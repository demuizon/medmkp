import {
  firstMatch,
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

function breadcrumbNames(html: string) {
  const breadcrumb = firstMatch(html, [
    /<ol[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/ol>/i,
  ])

  return [...breadcrumb.matchAll(/itemprop=["']name["']>([^<]+)</gi)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean)
}

/**
 * Sky Dental breadcrumbs look like:
 * Home / Dental Equipment / Intra-Oral Camera & Parts / Intra Oral Cameras / <product name>
 * Drop "Home" and the trailing product name, keep the taxonomy levels.
 */
function categoryParts(html: string) {
  const names = breadcrumbNames(html)
  const parts = names.slice(1, Math.max(1, names.length - 1))

  return {
    category: parts[0] || "Dental supplies",
    subcategory: parts[1] || "",
    product_line: parts[2] || "",
  }
}

function offerRecord(product: Record<string, unknown> | undefined) {
  const offers = product?.offers
  const firstOffer = Array.isArray(offers) ? offers[0] : offers

  return firstOffer && typeof firstOffer === "object"
    ? (firstOffer as Record<string, unknown>)
    : undefined
}

function availability(product: Record<string, unknown> | undefined) {
  const raw = stringValue(offerRecord(product)?.availability).toLowerCase()

  if (raw.includes("instock")) {
    return "in_stock" as const
  }

  if (raw.includes("backorder")) {
    return "backordered" as const
  }

  if (raw.includes("limitedavailability")) {
    return "limited" as const
  }

  return "unknown" as const
}

function packSize(value: string) {
  return firstMatch(value, [
    /([0-9][0-9,]*\s*\/\s*(?:bag|box|case|pack|pkg|bottle|tube|syringe|unit|cartridge|pk|bx)s?)/i,
    /((?:bag|box|case|pack|pkg|bottle|tube|syringe|unit|cartridge|pk|bx)s?\s+of\s+[0-9][A-Za-z0-9/-]*)/i,
  ])
}

function extractProduct(
  candidate: ProductPageCandidate,
  html: string
): ExtractedProductRow {
  const product = productJsonLd(html)
  const name = nestedString(product, ["name"])
  const sku = nestedString(product, ["sku"])
  const mpn = nestedString(product, ["mpn"])
  const description = nestedString(product, ["description"])
  const { category, subcategory, product_line } = categoryParts(html)
  const images = productImageUrls(html, candidate.url, product)

  return {
    sku,
    manufacturer_sku: mpn || sku,
    brand: nestedString(product, ["brand", "name"]) || stringValue(product?.brand),
    name,
    description: description || name,
    category,
    subcategory,
    product_line,
    product_url: stringValue(offerRecord(product)?.url) || candidate.url,
    image_url: images[0] ?? "",
    pack_size: packSize(`${name} ${description}`),
    unit_of_measure: "",
    price: stringValue(offerRecord(product)?.price),
    price_basis: "each",
    availability: availability(product),
    min_quantity: 1,
    raw: {
      extracted_by: "skydental",
      image_urls: images,
      source_page_url: candidate.url,
      sitemap_url: candidate.sitemap_url,
      confidence_score: candidate.confidence_score,
      reasons: candidate.reasons,
    },
  }
}

export const skyDentalAdapter: SupplierProductAdapter = {
  id: "skydental",
  matches: (candidate: ProductPageCandidate) =>
    /skydentalsupply\.com/i.test(candidate.url) ||
    /sky dental supply/i.test(candidate.distributor),
  extractProduct,
}
