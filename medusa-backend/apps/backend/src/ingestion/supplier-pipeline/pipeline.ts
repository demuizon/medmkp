import { resolve } from "path"
import { discoverSupplierSitemaps } from "./sitemap-discovery"
import { discoverSupplierSourceUrls } from "./source-url-discovery"
import { discoverDcDentalCatalogUrls } from "./dcdental-catalog-discovery"
import { discoverPearsonCatalogUrls } from "./pearson-catalog-discovery"
import { discoverShastaCatalogUrls } from "./shasta-catalog-discovery"
import { extractProductPages } from "./product-extraction"
import { extractShopifyCatalogProducts } from "./shopify-catalog-extraction"
import { filterSuppliers, supplierRowsFromCsv } from "./suppliers"
import { indexSupplierSitemapUrls, summarizeIndexedUrls } from "./url-index"
import { writePipelineDebugOutput } from "./debug-output"
import type {
  IndexedSupplierUrl,
  ProductPageCandidate,
  SupplierSeedRow,
  SupplierSitemapSummary,
  SupplierSourceUrl,
  SupplierSourceUrlSummary,
} from "./types"

export type SupplierIngestionStage = "discover" | "index" | "extract"

export type SupplierIngestionPipelineOptions = {
  suppliersCsvPath?: string
  suppliers?: SupplierSeedRow[]
  supplierName?: string
  stages?: SupplierIngestionStage[]
  initialSitemaps?: SupplierSitemapSummary[]
  initialIndexedUrls?: IndexedSupplierUrl[]
  productLimit?: number
  timeoutMs?: number
  sitemapConcurrency?: number
  productConcurrency?: number
  sourceUrls?: SupplierSourceUrl[]
  sourceConcurrency?: number
  maxLinksPerSource?: number
  maxSitemapsPerSupplier?: number
  maxDcDentalCatalogPages?: number
  maxPearsonCatalogPages?: number
  maxShastaCatalogPages?: number
  debug?: boolean
  debugOutputDir?: string
}

function productCandidateKey(row: IndexedSupplierUrl) {
  try {
    const url = new URL(row.url)
    if (/pearsondental\.com$/i.test(url.hostname) && /\/catalog\/product2?\.asp$/i.test(url.pathname)) {
      const pid = url.searchParams.get("pid")
      const bin = url.searchParams.get("bin2")
      if (pid) {
        return `pearson:pid:${pid}`
      }
      if (bin) {
        return `pearson:bin2:${bin}`
      }
    }
  } catch {
    // Fall back to exact URL matching below.
  }

  return row.url
}

function productCandidates(indexedUrls: IndexedSupplierUrl[]) {
  const seen = new Set<string>()

  return indexedUrls
    .filter((row): row is ProductPageCandidate => row.url_type === "product")
    .sort((a, b) => b.confidence_score - a.confidence_score)
    .filter((row) => {
      const key = productCandidateKey(row)
      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

function pearsonFullCatalogProductCount(indexedUrls: IndexedSupplierUrl[]) {
  return indexedUrls.filter((row) =>
    row.reasons.some((reason) => /Pearson full-catalog crawl/i.test(reason))
  ).length
}

function log(...args: unknown[]) {
  console.log("[supplier-ingestion]", ...args)
}

export async function runSupplierIngestionPipeline(
  options: SupplierIngestionPipelineOptions
) {
  const stages = options.stages ?? ["discover", "index", "extract"]
  const sourceSuppliers = options.suppliers ??
    supplierRowsFromCsv(resolve(options.suppliersCsvPath ?? "../../../research/dental-suppliers.csv"))
  const suppliers = filterSuppliers(
    sourceSuppliers,
    options.supplierName
  )

  log("Starting supplier ingestion pipeline")
  log("Stages:", stages.join(", "))
  log("Suppliers:", suppliers.map((supplier) => supplier.distributor).join(", "))

  if (!suppliers.length) {
    throw new Error(
      options.supplierName
        ? `No supplier matched "${options.supplierName}"`
        : "No suppliers found"
    )
  }

  let sitemaps: SupplierSitemapSummary[] = options.initialSitemaps ?? []
  let sourceUrlSummaries: SupplierSourceUrlSummary[] = []
  let indexedUrls: IndexedSupplierUrl[] = options.initialIndexedUrls ?? []
  let extracted = {
    products: [],
    failures: [],
  } as Awaited<ReturnType<typeof extractProductPages>>

  if (stages.includes("discover")) {
    log("Beginning discovery stage")
    sitemaps = await discoverSupplierSitemaps(suppliers, {
      timeoutMs: options.timeoutMs,
      debug: options.debug,
      concurrency: options.sitemapConcurrency,
      sitemapConcurrency: options.sitemapConcurrency,
      maxSitemapsPerSupplier: options.maxSitemapsPerSupplier,
    })
    log(
      `Discovery stage complete: ${sitemaps.length} suppliers processed, ${sitemaps.reduce(
        (total, supplier) => total + supplier.sitemaps.length,
        0
      )} sitemap fetches attempted`
    )
  }

  if (stages.includes("index")) {
    log("Beginning index stage")
    indexedUrls = indexSupplierSitemapUrls(sitemaps)
    if (options.sourceUrls?.length) {
      log(
        `Index stage source URL discovery: ${options.sourceUrls.length} source URL(s)`
      )
      const sourceResults = await discoverSupplierSourceUrls(options.sourceUrls, {
        timeoutMs: options.timeoutMs,
        debug: options.debug,
        concurrency: options.sourceConcurrency,
        maxLinksPerSource: options.maxLinksPerSource,
      })
      sourceUrlSummaries = sourceResults.summaries
      indexedUrls.push(...sourceResults.indexedUrls)
    }

    const pearsonCatalogUrls = await discoverPearsonCatalogUrls(suppliers, {
      timeoutMs: options.timeoutMs,
      debug: options.debug,
      concurrency: options.sourceConcurrency,
      maxPages: options.maxPearsonCatalogPages,
    })
    if (pearsonCatalogUrls.length) {
      log(
        `Index stage Pearson full-catalog discovery: ${pearsonCatalogUrls.length} product URL(s)`
      )
      indexedUrls.push(...pearsonCatalogUrls)
    }
    const shastaCatalogUrls = await discoverShastaCatalogUrls(suppliers, {
      timeoutMs: options.timeoutMs,
      debug: options.debug,
      concurrency: options.sourceConcurrency,
      maxPages: options.maxShastaCatalogPages,
    })
    if (shastaCatalogUrls.length) {
      log(
        `Index stage Shasta full-catalog discovery: ${shastaCatalogUrls.length} product URL(s)`
      )
      indexedUrls.push(...shastaCatalogUrls)
    }
    const dcDentalCatalogUrls = await discoverDcDentalCatalogUrls(suppliers, indexedUrls, {
      timeoutMs: options.timeoutMs,
      debug: options.debug,
      concurrency: options.sourceConcurrency,
      maxPages: options.maxDcDentalCatalogPages,
    })
    if (dcDentalCatalogUrls.length) {
      log(
        `Index stage DC Dental catalog discovery: ${dcDentalCatalogUrls.length} product URL(s)`
      )
      indexedUrls.push(...dcDentalCatalogUrls)
    }
    const indexedSummary = summarizeIndexedUrls(indexedUrls)
    log(
      `Index stage complete: ${indexedSummary.indexed_urls} urls parsed, ${indexedSummary.product_candidates} product candidates, ${indexedSummary.category_candidates} category candidates`
    )
  }

  if (stages.includes("extract")) {
    const allCandidates = productCandidates(indexedUrls)
    const candidates = options.productLimit
      ? allCandidates.slice(0, options.productLimit)
      : allCandidates
    log(
      `Beginning extract stage: ${candidates.length} product candidate(s) to process`,
      options.productLimit ? `(limit ${options.productLimit})` : ""
    )
    const catalogExtracted = await extractShopifyCatalogProducts(candidates, {
      timeoutMs: options.timeoutMs,
    })
    if (catalogExtracted.remaining.length !== candidates.length) {
      log(
        `Extract stage Shopify catalog pre-pass: ${catalogExtracted.products.length} products from products.json, ${catalogExtracted.failures.length} rejected, ${catalogExtracted.remaining.length} candidate(s) falling back to page extraction`
      )
    }
    const pageExtracted = await extractProductPages(catalogExtracted.remaining, {
      timeoutMs: options.timeoutMs,
      concurrency: options.productConcurrency,
      debug: options.debug,
    })
    extracted = {
      products: [...catalogExtracted.products, ...pageExtracted.products],
      failures: [...catalogExtracted.failures, ...pageExtracted.failures],
    }
    log(
      `Extract stage complete: ${extracted.products.length} products extracted, ${extracted.failures.length} failures`
    )
  }

  const indexedSummary = summarizeIndexedUrls(indexedUrls)
  const summary = {
    suppliers: suppliers.length,
    stages,
    sitemap_downloads: sitemaps.reduce(
      (total, supplier) => total + supplier.sitemaps.length,
      0
    ),
    successful_sitemap_downloads: sitemaps.reduce(
      (total, supplier) =>
        total + supplier.sitemaps.filter((sitemap) => sitemap.ok).length,
      0
    ),
    source_pages: sourceUrlSummaries.length,
    successful_source_pages: sourceUrlSummaries.filter((source) => source.page.ok).length,
    source_discovered_urls: sourceUrlSummaries.reduce(
      (total, source) => total + source.discovered_urls,
      0
    ),
    ...indexedSummary,
    pearson_full_catalog_product_urls: pearsonFullCatalogProductCount(indexedUrls),
    extracted_products: extracted.products.length,
    extraction_failures: extracted.failures.length,
  }
  const debugOutputDir = options.debug
    ? writePipelineDebugOutput(
        options.debugOutputDir ?? "./.medmkp/ingestion/latest",
        {
          summary,
          sitemaps,
          sourceUrlSummaries,
          indexedUrls,
          products: extracted.products,
          failures: extracted.failures,
        }
      )
    : undefined

  log("Pipeline finished", summary)

  return {
    summary: {
      ...summary,
      debug_output_dir: debugOutputDir,
    },
    sitemaps,
    sourceUrlSummaries,
    indexedUrls,
    products: extracted.products,
    failures: extracted.failures,
  }
}
