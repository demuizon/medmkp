import type {
  IndexedSupplierUrl,
  SupplierSitemapSummary,
} from "./types"
import { xmlUrls } from "./sitemap-discovery"

const productPatterns = [
  /\/product/i,
  /product\.asp/i,
  /product2\.asp/i,
  /\/p\//i,
  /\/item/i,
  /pid=/i,
  /sku=/i,
  /\.htm$/i,
]

const categoryPatterns = [
  /\/c\//i,
  /\/category/i,
  /\/categories/i,
  /\/collections/i,
  /\/dental-supplies/i,
  /\/supplies/i,
  /\/catalog/i,
]

export function classifySupplierUrl(
  url: string
): Pick<IndexedSupplierUrl, "url_type" | "confidence_score" | "reasons"> {
  const reasons: string[] = []

  if (/\.xml($|\?)/i.test(url)) {
    return {
      url_type: "sitemap_index",
      confidence_score: 90,
      reasons: ["XML sitemap/feed URL"],
    }
  }

  if (/pearsondental\.com\/catalog\/product_thumb_multi\.asp/i.test(url)) {
    return {
      url_type: "category",
      confidence_score: 70,
      reasons: ["Pearson product-family page, not SKU-level product URL"],
    }
  }

  const productHits = productPatterns.filter((pattern) => pattern.test(url))
  const categoryHits = categoryPatterns.filter((pattern) => pattern.test(url))

  if (productHits.length) {
    reasons.push(`Product URL pattern hits: ${productHits.length}`)
  }

  if (categoryHits.length) {
    reasons.push(`Category URL pattern hits: ${categoryHits.length}`)
  }

  if (productHits.length && !categoryHits.length) {
    return {
      url_type: "product",
      confidence_score: Math.min(95, 65 + productHits.length * 10),
      reasons,
    }
  }

  if (productHits.length && categoryHits.length) {
    return {
      url_type: "product",
      confidence_score: 70,
      reasons: [...reasons, "Both product and category patterns matched"],
    }
  }

  if (categoryHits.length) {
    return {
      url_type: "category",
      confidence_score: Math.min(90, 55 + categoryHits.length * 10),
      reasons,
    }
  }

  return {
    url_type: "other",
    confidence_score: 20,
    reasons: ["No product/category pattern matched"],
  }
}

export function indexSupplierSitemapUrls(
  sitemapSummaries: SupplierSitemapSummary[]
) {
  const indexed: IndexedSupplierUrl[] = []

  for (const supplier of sitemapSummaries) {
    for (const sitemap of supplier.sitemaps) {
      if (!sitemap.ok || !sitemap.body) {
        continue
      }

      for (const url of xmlUrls(sitemap.body)) {
        indexed.push({
          distributor: supplier.distributor,
          website_url: supplier.website_url,
          origin: supplier.origin,
          prices: supplier.prices,
          sitemap_url: sitemap.url,
          url,
          ...classifySupplierUrl(url),
        })
      }
    }
  }

  return indexed
}

export function summarizeIndexedUrls(indexed: IndexedSupplierUrl[]) {
  const byType = indexed.reduce((acc, row) => {
    acc[row.url_type] = (acc[row.url_type] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return {
    indexed_urls: indexed.length,
    by_type: byType,
    product_candidates: byType.product ?? 0,
    category_candidates: byType.category ?? 0,
  }
}
