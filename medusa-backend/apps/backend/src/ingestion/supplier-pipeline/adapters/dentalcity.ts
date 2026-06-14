import { firstMatch, productImageUrls, stripTags, uniqueImageUrls } from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

function metaItemProp(block: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  return firstMatch(block, [
    new RegExp(
      `<meta[^>]+itemprop=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+itemprop=["']${escaped}["'][^>]*>`,
      "i"
    ),
  ])
}

function itemOfferedBlocks(html: string) {
  return [
    ...html.matchAll(
      /<div\b[^>]*itemprop=["']itemOffered["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
    ),
  ].map((match) => match[0])
}

function productIdFromUrl(url: string) {
  return firstMatch(url, [/\/product\/([0-9]+)\//i])
}

/**
 * Dental City's itemOffered meta markup emits broken URLs (the path is a
 * sitemap shard, e.g. "https://www.dentalcity.com//754/..." which 404s).
 * Keep the crawled product page URL and append only the SKU variant query.
 */
function skuVariantUrl(metaUrl: string, pageUrl: string) {
  const queryIndex = metaUrl.indexOf("?")

  if (queryIndex < 0 || pageUrl.includes("?")) {
    return pageUrl
  }

  return `${pageUrl}${metaUrl.slice(queryIndex)}`
}

function categoryParts(category: string) {
  const [categoryName = "Dental supplies", subcategory = ""] = category
    .split("/")
    .map((part) => part.trim())

  return {
    category: categoryName || "Dental supplies",
    subcategory,
  }
}

function priceBasis(name: string) {
  if (/\bcase\b/i.test(name)) {
    return "case" as const
  }

  if (/\b(?:box|bag|pack|pkg)\b/i.test(name)) {
    return "pack" as const
  }

  return "each" as const
}

function availability(value: string) {
  const lower = value.toLowerCase()

  if (lower.includes("instock")) {
    return "in_stock" as const
  }

  if (lower.includes("backorder")) {
    return "backordered" as const
  }

  return "unknown" as const
}

function productLine(html: string) {
  return (
    firstMatch(html, [
      /<span[^>]+class=["'][^"']*desktopproductname[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      /<h1[^>]+id=["']productname["'][^>]*>([\s\S]*?)<\/h1>/i,
    ]) || ""
  )
}

function packSize(value: string) {
  return firstMatch(value, [
    /([0-9][0-9,]*\s*\/\s*(?:bag|box|case|pack|pkg|bottle|tube|syringe|unit))/i,
    /((?:bag|box|case|pack|pkg|bottle|tube|syringe|unit)\s+of\s+[0-9][A-Za-z0-9/-]*)/i,
  ])
}

function rowImageUrls(block: string, candidate: ProductPageCandidate, html: string) {
  return uniqueImageUrls(
    [
      metaItemProp(block, "image"),
      ...productImageUrls(html, candidate.url),
    ],
    candidate.url
  )
}

function dentalCityRows(
  candidate: ProductPageCandidate,
  html: string
): ExtractedProductRow[] {
  const line = stripTags(productLine(html))
  const productId = productIdFromUrl(candidate.url)
  const blocks = itemOfferedBlocks(html)

  return blocks.flatMap((block): ExtractedProductRow[] => {
    const name = metaItemProp(block, "name")
    const sku = metaItemProp(block, "sku")
    const category = metaItemProp(block, "category")
    const description = metaItemProp(block, "description")
    const brand = metaItemProp(block, "brand")
    const price = metaItemProp(block, "price")
    const url = metaItemProp(block, "url")
    const mpn = metaItemProp(block, "mpn")
    const { category: categoryName, subcategory } = categoryParts(category)
    const imageUrls = rowImageUrls(block, candidate, html)

    if (!name || !sku || !price) {
      return []
    }

    return [{
      sku,
      manufacturer_sku: mpn || sku,
      brand: brand || "Dental City",
      name,
      description: description || name,
      category: categoryName,
      subcategory,
      product_line: line,
      product_url: skuVariantUrl(url, candidate.url),
      image_url: imageUrls[0] ?? "",
      pack_size: packSize(`${name} ${description}`),
      unit_of_measure: "",
      price,
      price_basis: priceBasis(name),
      availability: availability(metaItemProp(block, "availability")),
      min_quantity: 1,
      raw: {
        extracted_by: "dentalcity",
        product_id: productId,
        source_page_url: candidate.url,
        sitemap_url: candidate.sitemap_url,
        confidence_score: candidate.confidence_score,
        reasons: candidate.reasons,
        image_urls: imageUrls,
      },
    }]
  })
}

export const dentalCityAdapter: SupplierProductAdapter = {
  id: "dentalcity",
  matches: (candidate: ProductPageCandidate) =>
    /dentalcity\.com/i.test(candidate.url) ||
    candidate.distributor.toLowerCase() === "dental city",
  extractProduct: (candidate, html) => {
    const row = dentalCityRows(candidate, html)[0]

    if (row) {
      return row
    }

    const name = firstMatch(html, [
      /<span[^>]+class=["'][^"']*desktopproductname[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ])
    const imageUrls = productImageUrls(html, candidate.url)

    return {
      sku: productIdFromUrl(candidate.url),
      name: stripTags(name),
      description: stripTags(name),
      category: "Dental supplies",
      product_url: candidate.url,
      image_url: imageUrls[0] ?? "",
      raw: {
        extracted_by: "dentalcity",
        source_page_url: candidate.url,
        image_urls: imageUrls,
      },
    }
  },
  extractProducts: dentalCityRows,
}
