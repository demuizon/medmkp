import { runSupplierIngestionPipeline } from "../ingestion/supplier-pipeline/pipeline"
import type { SupplierIngestionStage } from "../ingestion/supplier-pipeline/pipeline"
import { normalizeSiteUrl } from "../ingestion/supplier-pipeline/suppliers"
import type { SupplierSourceUrl } from "../ingestion/supplier-pipeline/types"

type CliOptions = {
  suppliersCsvPath: string
  supplierName?: string
  stages?: SupplierIngestionStage[]
  productLimit?: number
  timeoutMs?: number
  sitemapConcurrency?: number
  productConcurrency?: number
  sourceUrls: string[]
  sourceConcurrency?: number
  maxLinksPerSource?: number
  maxSitemapsPerSupplier?: number
  maxDcDentalCatalogPages?: number
  maxPearsonCatalogPages?: number
  maxShastaCatalogPages?: number
  debug: boolean
  debugOutputDir?: string
}

function optionValue(arg: string) {
  const [, ...parts] = arg.split("=")
  return parts.join("=")
}

function parseStages(value?: string) {
  if (!value) {
    return undefined
  }

  const stages = value
    .split(",")
    .map((stage) => stage.trim())
    .filter(Boolean)

  const allowed = new Set(["discover", "index", "extract"])

  stages.forEach((stage) => {
    if (!allowed.has(stage)) {
      throw new Error(`Unknown ingestion stage "${stage}"`)
    }
  })

  return stages as SupplierIngestionStage[]
}

function parseOptions(): CliOptions {
  const options: CliOptions = {
    suppliersCsvPath:
      process.env.SUPPLIER_INGESTION_SUPPLIERS_CSV ??
      "../../../research/dental-suppliers.csv",
    supplierName: process.env.SUPPLIER_NAME,
    stages: parseStages(process.env.SUPPLIER_INGESTION_STAGES),
    productLimit: process.env.PRODUCT_PAGE_LIMIT
      ? Number(process.env.PRODUCT_PAGE_LIMIT)
      : undefined,
    timeoutMs: process.env.PRODUCT_PAGE_TIMEOUT_MS
      ? Number(process.env.PRODUCT_PAGE_TIMEOUT_MS)
      : undefined,
    sitemapConcurrency: process.env.SUPPLIER_INGESTION_SITEMAP_CONCURRENCY
      ? Number(process.env.SUPPLIER_INGESTION_SITEMAP_CONCURRENCY)
      : undefined,
    productConcurrency: process.env.SUPPLIER_INGESTION_PRODUCT_CONCURRENCY
      ? Number(process.env.SUPPLIER_INGESTION_PRODUCT_CONCURRENCY)
      : undefined,
    sourceUrls: process.env.SUPPLIER_INGESTION_SOURCE_URLS
      ? process.env.SUPPLIER_INGESTION_SOURCE_URLS.split(",").map((url) => url.trim()).filter(Boolean)
      : [],
    sourceConcurrency: process.env.SUPPLIER_INGESTION_SOURCE_CONCURRENCY
      ? Number(process.env.SUPPLIER_INGESTION_SOURCE_CONCURRENCY)
      : undefined,
    maxLinksPerSource: process.env.SUPPLIER_INGESTION_MAX_LINKS_PER_SOURCE
      ? Number(process.env.SUPPLIER_INGESTION_MAX_LINKS_PER_SOURCE)
      : undefined,
    maxSitemapsPerSupplier: process.env.SUPPLIER_INGESTION_MAX_SITEMAPS_PER_SUPPLIER
      ? Number(process.env.SUPPLIER_INGESTION_MAX_SITEMAPS_PER_SUPPLIER)
      : undefined,
    maxDcDentalCatalogPages: process.env.SUPPLIER_INGESTION_MAX_DCDENTAL_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_DCDENTAL_CATALOG_PAGES)
      : undefined,
    maxPearsonCatalogPages: process.env.SUPPLIER_INGESTION_MAX_PEARSON_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_PEARSON_CATALOG_PAGES)
      : undefined,
    maxShastaCatalogPages: process.env.SUPPLIER_INGESTION_MAX_SHASTA_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_SHASTA_CATALOG_PAGES)
      : undefined,
    debug: process.env.SUPPLIER_INGESTION_DEBUG === "1",
    debugOutputDir: process.env.SUPPLIER_INGESTION_DEBUG_DIR,
  }

  for (const arg of process.argv.slice(2)) {
    if (arg === "--debug") {
      options.debug = true
      continue
    }

    if (arg.startsWith("--suppliers-csv=")) {
      options.suppliersCsvPath = optionValue(arg)
    }

    if (arg.startsWith("--supplier=")) {
      options.supplierName = optionValue(arg)
    }

    if (arg.startsWith("--stages=")) {
      options.stages = parseStages(optionValue(arg))
    }

    if (arg.startsWith("--limit=")) {
      options.productLimit = Number(optionValue(arg))
    }

    if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(optionValue(arg))
    }

    if (arg.startsWith("--sitemap-concurrency=")) {
      options.sitemapConcurrency = Number(optionValue(arg))
    }

    if (arg.startsWith("--product-concurrency=")) {
      options.productConcurrency = Number(optionValue(arg))
    }

    if (arg.startsWith("--source-url=")) {
      options.sourceUrls.push(optionValue(arg))
    }

    if (arg.startsWith("--source-concurrency=")) {
      options.sourceConcurrency = Number(optionValue(arg))
    }

    if (arg.startsWith("--max-links-per-source=")) {
      options.maxLinksPerSource = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-sitemaps-per-supplier=")) {
      options.maxSitemapsPerSupplier = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-dcdental-catalog-pages=")) {
      options.maxDcDentalCatalogPages = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-pearson-catalog-pages=")) {
      options.maxPearsonCatalogPages = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-shasta-catalog-pages=")) {
      options.maxShastaCatalogPages = Number(optionValue(arg))
    }

    if (arg.startsWith("--debug-output-dir=")) {
      options.debugOutputDir = optionValue(arg)
    }
  }

  return options
}

async function run() {
  const options = parseOptions()
  const sourceUrls: SupplierSourceUrl[] = options.sourceUrls.map((sourceUrl) => {
    const site = normalizeSiteUrl(sourceUrl)

    return {
      distributor: options.supplierName ?? site.domain,
      website_url: site.origin,
      origin: site.origin,
      prices: "Y",
      source_catalog: `${site.domain.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-source-url`,
      source_url: sourceUrl,
    }
  })
  const result = await runSupplierIngestionPipeline({
    ...options,
    sourceUrls,
    sourceConcurrency: options.sourceConcurrency,
    maxLinksPerSource: options.maxLinksPerSource,
    maxSitemapsPerSupplier: options.maxSitemapsPerSupplier,
    maxDcDentalCatalogPages: options.maxDcDentalCatalogPages,
    maxPearsonCatalogPages: options.maxPearsonCatalogPages,
    maxShastaCatalogPages: options.maxShastaCatalogPages,
  })

  console.log(JSON.stringify(result.summary, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
