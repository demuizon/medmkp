import { resolve } from "path"
import { discoverSupplierSitemaps } from "./sitemap-discovery"
import { extractProductPages } from "./product-extraction"
import { filterSuppliers, supplierRowsFromCsv } from "./suppliers"
import { indexSupplierSitemapUrls, summarizeIndexedUrls } from "./url-index"
import { writePipelineDebugOutput } from "./debug-output"
import type {
  IndexedSupplierUrl,
  ProductPageCandidate,
  SupplierSeedRow,
  SupplierSitemapSummary,
} from "./types"

export type SupplierIngestionStage = "discover" | "index" | "extract"

export type SupplierIngestionPipelineOptions = {
  suppliersCsvPath?: string
  suppliers?: SupplierSeedRow[]
  supplierName?: string
  stages?: SupplierIngestionStage[]
  productLimit?: number
  timeoutMs?: number
  debug?: boolean
  debugOutputDir?: string
}

function productCandidates(indexedUrls: IndexedSupplierUrl[]) {
  return indexedUrls
    .filter((row): row is ProductPageCandidate => row.url_type === "product")
    .sort((a, b) => b.confidence_score - a.confidence_score)
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

  if (!suppliers.length) {
    throw new Error(
      options.supplierName
        ? `No supplier matched "${options.supplierName}"`
        : "No suppliers found"
    )
  }

  let sitemaps: SupplierSitemapSummary[] = []
  let indexedUrls: IndexedSupplierUrl[] = []
  let extracted = {
    products: [],
    failures: [],
  } as Awaited<ReturnType<typeof extractProductPages>>

  if (stages.includes("discover")) {
    sitemaps = await discoverSupplierSitemaps(suppliers, {
      timeoutMs: options.timeoutMs,
    })
  }

  if (stages.includes("index")) {
    indexedUrls = indexSupplierSitemapUrls(sitemaps)
  }

  if (stages.includes("extract")) {
    extracted = await extractProductPages(productCandidates(indexedUrls), {
      limit: options.productLimit,
      timeoutMs: options.timeoutMs,
    })
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
    ...indexedSummary,
    extracted_products: extracted.products.length,
    extraction_failures: extracted.failures.length,
  }
  const debugOutputDir = options.debug
    ? writePipelineDebugOutput(
        options.debugOutputDir ?? "./.medmkp/ingestion/latest",
        {
          summary,
          sitemaps,
          indexedUrls,
          products: extracted.products,
          failures: extracted.failures,
        }
      )
    : undefined

  return {
    summary: {
      ...summary,
      debug_output_dir: debugOutputDir,
    },
    sitemaps,
    indexedUrls,
    products: extracted.products,
    failures: extracted.failures,
  }
}
