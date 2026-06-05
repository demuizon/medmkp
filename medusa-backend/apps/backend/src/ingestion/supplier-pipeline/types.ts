import type { SupplierCatalogRow } from "../supplier-catalog"

export type SupplierSeedRow = {
  distributor: string
  website_url: string
  prices: string
}

export type DownloadResult = {
  url: string
  status: number
  ok: boolean
  content_type: string
  bytes: number
  file_path?: string
  body?: string
  error?: string
}

export type SupplierSitemapSummary = {
  distributor: string
  website_url: string
  origin: string
  prices: string
  robots: DownloadResult
  sitemap_directives: string[]
  used_fallback_sitemap: boolean
  sitemaps: DownloadResult[]
}

export type IndexedUrlType = "product" | "category" | "sitemap_index" | "other"

export type IndexedSupplierUrl = {
  distributor: string
  website_url: string
  origin: string
  prices: string
  sitemap_url: string
  url: string
  url_type: IndexedUrlType
  confidence_score: number
  reasons: string[]
}

export type ProductPageCandidate = IndexedSupplierUrl & {
  url_type: "product"
}

export type ExtractedProductRow = SupplierCatalogRow & {
  price?: string
}

export type FailedProductExtraction = {
  distributor: string
  url: string
  status: string
  error: string
  sitemap_url: string
  confidence_score: number
  reasons: string[]
}

export type ProductExtractionResult = {
  products: ExtractedProductRow[]
  failures: FailedProductExtraction[]
}

export type SupplierProductAdapter = {
  id: string
  matches: (candidate: ProductPageCandidate) => boolean
  extractProduct: (candidate: ProductPageCandidate, html: string) => ExtractedProductRow
  extractProducts?: (candidate: ProductPageCandidate, html: string) => ExtractedProductRow[]
}
