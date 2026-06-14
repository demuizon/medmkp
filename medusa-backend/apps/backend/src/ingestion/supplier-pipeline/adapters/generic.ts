import {
  firstMatch,
  metaContent,
  nestedString,
  productImageUrls,
  productJsonLd,
  stringValue,
  stripTags,
} from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

function offerRecord(product: Record<string, unknown> | undefined) {
  const offers = product?.offers
  const firstOffer = Array.isArray(offers) ? offers[0] : offers

  return firstOffer && typeof firstOffer === "object"
    ? (firstOffer as Record<string, unknown>)
    : undefined
}

function priceFromProductJson(product: Record<string, unknown> | undefined) {
  return stringValue(offerRecord(product)?.price)
}

function availabilityFromProductJson(
  product: Record<string, unknown> | undefined
) {
  const raw = stringValue(offerRecord(product)?.availability).toLowerCase()

  if (raw.includes("instock")) {
    return "in_stock"
  }

  if (raw.includes("outofstock")) {
    return "unknown"
  }

  return undefined
}

function extractPrice(html: string, product: Record<string, unknown> | undefined) {
  return (
    priceFromProductJson(product) ||
    metaContent(html, ["product:price:amount", "og:price:amount"]) ||
    firstMatch(html, [
      /(?:price|sale-price|product-price)[^$]{0,80}\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
      /\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
    ])
  )
}

export function genericProductExtract(
  candidate: ProductPageCandidate,
  html: string
): ExtractedProductRow {
  const product = productJsonLd(html)
  const plainText = stripTags(html)
  const title = firstMatch(html, [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ])
  const name =
    nestedString(product, ["name"]) ||
    metaContent(html, ["og:title", "twitter:title"]) ||
    stripTags(title)
  const description =
    nestedString(product, ["description"]) ||
    metaContent(html, ["og:description", "description", "twitter:description"])
  const imageUrls = productImageUrls(html, candidate.url, product)

  return {
    sku:
      nestedString(product, ["sku"]) ||
      firstMatch(html, [/sku[:#\s-]*([A-Za-z0-9._-]{3,})/i]),
    manufacturer_sku:
      nestedString(product, ["mpn"]) ||
      firstMatch(html, [
        /(?:mfg|manufacturer)\s*(?:sku|#|number)[:#\s-]*([A-Za-z0-9._-]{3,})/i,
      ]),
    brand:
      nestedString(product, ["brand", "name"]) ||
      stringValue(product?.brand) ||
      metaContent(html, ["product:brand"]),
    name,
    description,
    category: candidate.distributor,
    subcategory: "",
    product_line: "",
    product_url: candidate.url,
    pack_size: firstMatch(plainText, [
      /((?:box|pkg|pack|package|case|bag|bottle|tube|syringe|unit)\s+of\s+[0-9][A-Za-z0-9/-]*)/i,
    ]),
    unit_of_measure: "",
    image_url: imageUrls[0] ?? "",
    price: extractPrice(html, product),
    price_basis: "each",
    availability: availabilityFromProductJson(product),
    min_quantity: 1,
    raw: {
      extracted_by: "generic",
      sitemap_url: candidate.sitemap_url,
      confidence_score: candidate.confidence_score,
      reasons: candidate.reasons,
      image_urls: imageUrls,
    },
  }
}

export const genericAdapter: SupplierProductAdapter = {
  id: "generic",
  matches: () => true,
  extractProduct: genericProductExtract,
}
