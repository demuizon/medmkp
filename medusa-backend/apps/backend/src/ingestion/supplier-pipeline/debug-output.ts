import { mkdirSync, writeFileSync } from "fs"
import { resolve } from "path"
import { writeCsv } from "./csv-output"
import type {
  ExtractedProductRow,
  FailedProductExtraction,
  IndexedSupplierUrl,
  SupplierSitemapSummary,
} from "./types"

const indexedHeaders = [
  "distributor",
  "website_url",
  "origin",
  "prices",
  "sitemap_url",
  "url",
  "url_type",
  "confidence_score",
  "reasons",
] as const

const productHeaders = [
  "sku",
  "manufacturer_sku",
  "brand",
  "name",
  "description",
  "category",
  "subcategory",
  "product_line",
  "product_url",
  "pack_size",
  "unit_of_measure",
  "price",
  "price_basis",
  "availability",
  "min_quantity",
] as const

const failureHeaders = [
  "distributor",
  "url",
  "status",
  "error",
  "sitemap_url",
  "confidence_score",
  "reasons",
] as const

export function writePipelineDebugOutput(
  outputDir: string,
  payload: {
    summary: Record<string, unknown>
    sitemaps: SupplierSitemapSummary[]
    indexedUrls: IndexedSupplierUrl[]
    products: ExtractedProductRow[]
    failures: FailedProductExtraction[]
  }
) {
  const absoluteOutputDir = resolve(outputDir)
  mkdirSync(absoluteOutputDir, { recursive: true })

  const productCandidates = payload.indexedUrls.filter(
    (row) => row.url_type === "product"
  )
  const categoryCandidates = payload.indexedUrls.filter(
    (row) => row.url_type === "category"
  )

  writeFileSync(
    resolve(absoluteOutputDir, "summary.json"),
    JSON.stringify(payload.summary, null, 2)
  )
  writeFileSync(
    resolve(absoluteOutputDir, "sitemaps.json"),
    JSON.stringify(payload.sitemaps, null, 2)
  )
  writeCsv(resolve(absoluteOutputDir, "all-urls.csv"), indexedHeaders, payload.indexedUrls)
  writeCsv(
    resolve(absoluteOutputDir, "product-candidates.csv"),
    indexedHeaders,
    productCandidates
  )
  writeCsv(
    resolve(absoluteOutputDir, "category-candidates.csv"),
    indexedHeaders,
    categoryCandidates
  )
  writeCsv(resolve(absoluteOutputDir, "products.csv"), productHeaders, payload.products)
  writeCsv(resolve(absoluteOutputDir, "failures.csv"), failureHeaders, payload.failures)

  return absoluteOutputDir
}
