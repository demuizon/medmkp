import { firstMatch, stripTags } from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

/**
 * Shasta renders hidden inputs with quoted attributes on family pages and
 * unquoted attributes on some single-product pages (name=Product_Price).
 */
function hiddenInput(html: string, name: string) {
  return firstMatch(html, [
    new RegExp(
      `<input[^>]+value=["']([^"']*)["'][^>]+name=["']?${name}["']?[\\s>]`,
      "i"
    ),
    new RegExp(
      `<input[^>]+name=["']?${name}["']?[\\s>][^>]*value=["']([^"']*)["'][^>]*>`,
      "i"
    ),
  ])
}

function labelledValue(html: string, label: string) {
  return firstMatch(html, [
    new RegExp(`<strong>\\s*${label}\\s*</strong>\\s*:?\\s*([^<]+)<`, "i"),
  ])
}

/**
 * Shasta breadcrumbs look like:
 * Dental Supplies / Anesthetics / Disposable Needles / <product family>
 */
function breadcrumbParts(html: string) {
  const breadcrumb = firstMatch(html, [
    /<ul[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i,
  ])

  return [...breadcrumb.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean)
    .slice(1)
}

/**
 * Regular items: <strong>Price:</strong>$12.00 ea.
 * Clearance items strike the list price and add a sale line:
 * <strong>Price:</strong> <s>$57.45 ea.</s> ... <strong>Sale Price:</strong> $28.00 ea.
 */
function priceParts(html: string) {
  const line = firstMatch(html, [
    /<strong>\s*Sale Price:?\s*<\/strong>\s*\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?[^<]*)</i,
    /<strong>\s*Price:?\s*<\/strong>\s*\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?[^<]*)</i,
  ])
  const price = firstMatch(line, [/^([0-9][0-9,]*(?:\.[0-9]{2})?)/])
  const basisText = line.slice(price.length).trim().toLowerCase()

  if (/^(?:ea|each)\b/.test(basisText)) {
    return { price, basis: "each" as const }
  }

  if (/^(?:bx|box)\b/.test(basisText)) {
    return { price, basis: "box" as const }
  }

  if (/^(?:cs|case)\b/.test(basisText)) {
    return { price, basis: "case" as const }
  }

  if (/^(?:pk|pack|pkg)\b/.test(basisText)) {
    return { price, basis: "pack" as const }
  }

  return { price, basis: price ? ("each" as const) : ("unknown" as const) }
}

function availability(html: string) {
  const value = firstMatch(html, [
    /<strong>\s*Availability:?\s*<\/strong>\s*<a\b[^>]*>([\s\S]*?)<\/a>/i,
  ]).toLowerCase()

  if (value.includes("in stock")) {
    return "in_stock" as const
  }

  if (value.includes("partially")) {
    return "limited" as const
  }

  if (value.includes("backorder")) {
    return "backordered" as const
  }

  return "unknown" as const
}

function description(html: string) {
  const block = firstMatch(html, [
    /<div[^>]+id=["']tab1["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["']tab-pane/i,
    /<div[^>]+id=["']tab1["'][^>]*>([\s\S]*?)<\/div>/i,
  ])

  return stripTags(block).replace(/\s*(?:Back|Read More)\s*$/i, "").trim()
}

function productIdFromUrl(url: string) {
  return firstMatch(url, [/show_Product\.aspx\?ID=([0-9]+)/i])
}

function extractProduct(
  candidate: ProductPageCandidate,
  html: string
): ExtractedProductRow {
  const name = hiddenInput(html, "Product_Name") ||
    stripTags(firstMatch(html, [/<h4[^>]*>([\s\S]*?)<\/h4>/i]))
  const sku = hiddenInput(html, "Product_SKU") ||
    labelledValue(html, "Item Number")
  const { price, basis } = priceParts(html)
  const crumbs = breadcrumbParts(html)
  const productId = productIdFromUrl(candidate.url)
  const components = labelledValue(html, "Components")
  const listPrice = firstMatch(html, [
    /<strong>\s*Price:?\s*<\/strong>\s*<s>\s*\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
  ])

  return {
    sku,
    manufacturer_sku: labelledValue(html, "Mfg\\. Number") || sku,
    brand: labelledValue(html, "Manufacturer"),
    name,
    description: description(html) || name,
    category: crumbs[0] || "Dental supplies",
    subcategory: crumbs[1] || "",
    product_line: crumbs[2] || "",
    product_url: candidate.url,
    pack_size: components,
    unit_of_measure: "",
    price: price || hiddenInput(html, "Product_Price"),
    price_basis: basis,
    availability: availability(html),
    min_quantity: 1,
    raw: {
      extracted_by: "shasta",
      product_id: productId,
      list_price: listPrice,
      image_urls: productId
        ? [`${candidate.origin}/img_Large.asp?id=${productId}`]
        : [],
      source_page_url: candidate.url,
      sitemap_url: candidate.sitemap_url,
      confidence_score: candidate.confidence_score,
      reasons: candidate.reasons,
    },
  }
}

export const shastaAdapter: SupplierProductAdapter = {
  id: "shasta",
  matches: (candidate: ProductPageCandidate) =>
    /shastadentalsupply\.com/i.test(candidate.url) ||
    /shasta dental supply/i.test(candidate.distributor),
  extractProduct,
}
