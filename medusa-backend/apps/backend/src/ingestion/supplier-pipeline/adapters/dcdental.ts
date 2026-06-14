import { firstMatch, productImageUrls, stripTags } from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

type DCDentalApiItem = {
  custitem_quik_view_subcat2?: string
  custitem_category_facet?: string
  custitem_dc_specs?: string
  internalid?: number | string
  isbackorderable?: boolean
  isinstock?: boolean
  itemid?: string
  itemimages_detail?: unknown
  itemimages?: unknown
  itemimage?: unknown
  manufacturer?: string
  onlinecustomerprice_detail?: {
    onlinecustomerprice?: number
    onlinecustomerprice_formatted?: string
  }
  pagetitle?: string
  quantityavailable?: number
  storedetaileddescription?: string
  storedisplayname2?: string
  storedescription?: string
  urlcomponent?: string
}

function apiImageValues(value: unknown): string[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(apiImageValues)
  }

  if (typeof value === "string" || typeof value === "number") {
    return [String(value)]
  }

  if (typeof value !== "object") {
    return []
  }

  const record = value as Record<string, unknown>
  return [
    record.url,
    record.src,
    record.fullurl,
    record.mediaurl,
    record.thumbnailurl,
  ].flatMap(apiImageValues)
}

function imageUrls(candidate: ProductPageCandidate, html: string, item: DCDentalApiItem | undefined) {
  const apiImages = [
    item?.itemimage,
    item?.itemimages,
    item?.itemimages_detail,
  ].flatMap(apiImageValues)

  return [
    ...new Set(
      [...apiImages, ...productImageUrls(html, candidate.url)]
        .map((url) => {
          try {
            return new URL(url, candidate.origin).href
          } catch {
            return ""
          }
        })
        .filter(Boolean)
    ),
  ]
}

function apiJson(html: string) {
  const raw = firstMatch(html, [
    /<script[^>]+id=["']medmkp-dcdental-api["'][^>]*>([\s\S]*?)<\/script>/i,
  ])

  if (!raw) {
    return undefined
  }

  try {
    return JSON.parse(raw) as { items?: DCDentalApiItem[] }
  } catch {
    return undefined
  }
}

function firstApiItem(html: string) {
  return apiJson(html)?.items?.[0]
}

function pathProductUrl(candidate: ProductPageCandidate, item: DCDentalApiItem | undefined) {
  if (!item?.urlcomponent) {
    return candidate.url
  }

  return new URL(`/${item.urlcomponent}`, candidate.origin).href
}

function titleName(html: string) {
  return stripTags(firstMatch(html, [
    /<h1[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ])).replace(/\s*\|\s*DC Dental\s*$/i, "")
}

function htmlSku(html: string) {
  return stripTags(firstMatch(html, [
    /<span[^>]+itemprop=["']sku["'][^>]*>([\s\S]*?)<\/span>/i,
    /<span[^>]+class=["'][^"']*product-line-sku-value[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  ])).replace(/^SKU:\s*/i, "")
}

function htmlManufacturer(html: string) {
  return stripTags(firstMatch(html, [
    /<div[^>]+class=["'][^"']*product-details-main-content-manufacturer[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ]))
}

function productDescription(html: string, item: DCDentalApiItem | undefined) {
  const apiDescription = stripTags(item?.storedetaileddescription ?? "")

  if (apiDescription) {
    return apiDescription
  }

  return stripTags(firstMatch(html, [
    /<div[^>]+id=["']product-details-information-tab-content-container-0["'][^>]*>([\s\S]*?)<\/div>/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
  ]))
}

function price(item: DCDentalApiItem | undefined) {
  return item?.onlinecustomerprice_detail?.onlinecustomerprice_formatted ??
    (typeof item?.onlinecustomerprice_detail?.onlinecustomerprice === "number"
      ? String(item.onlinecustomerprice_detail.onlinecustomerprice)
      : "")
}

function categoryParts(candidate: ProductPageCandidate, item: DCDentalApiItem | undefined) {
  const category = item?.custitem_category_facet || candidate.category || "Dental supplies"

  return {
    category,
    subcategory: item?.custitem_quik_view_subcat2 || candidate.subcategory || "",
  }
}

function availability(item: DCDentalApiItem | undefined) {
  if (item?.isinstock) {
    return "in_stock" as const
  }

  if (item?.isbackorderable) {
    return "backordered" as const
  }

  return "unknown" as const
}

function packSize(value: string) {
  return firstMatch(value, [
    /([0-9][0-9,]*\s*\/\s*(?:bag|box|case|pack|pkg|bottle|tube|syringe|unit|cartridge)s?)/i,
    /((?:bag|box|case|pack|pkg|bottle|tube|syringe|unit|cartridge)s?\s+of\s+[0-9][A-Za-z0-9/-]*)/i,
  ])
}

export const dcDentalAdapter: SupplierProductAdapter = {
  id: "dcdental",
  matches: (candidate: ProductPageCandidate) =>
    /dcdental\.com/i.test(candidate.url) ||
    /^dc dental$/i.test(candidate.distributor),
  extractProduct: (candidate, html): ExtractedProductRow => {
    const item = firstApiItem(html)
    const name = item?.storedisplayname2 || item?.storedescription || titleName(html)
    const description = productDescription(html, item) || name
    const { category, subcategory } = categoryParts(candidate, item)
    const sku = item?.itemid || htmlSku(html)
    const images = imageUrls(candidate, html, item)

    return {
      sku,
      manufacturer_sku: sku,
      brand: item?.manufacturer || htmlManufacturer(html),
      name,
      description,
      category,
      subcategory,
      product_line: item?.custitem_quik_view_subcat2 || "",
      product_url: pathProductUrl(candidate, item),
      image_url: images[0] ?? "",
      pack_size: packSize(`${name} ${description} ${item?.custitem_dc_specs ?? ""}`),
      unit_of_measure: "",
      price: price(item),
      price_basis: "each",
      availability: availability(item),
      min_quantity: 1,
      raw: {
        extracted_by: "dcdental",
        internalid: item?.internalid,
        quantityavailable: item?.quantityavailable,
        source_page_url: candidate.url,
        sitemap_url: candidate.sitemap_url,
        confidence_score: candidate.confidence_score,
        reasons: candidate.reasons,
        image_urls: images,
      },
    }
  },
}
