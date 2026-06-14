import { adapterForCandidate } from "./adapters"
import {
  shopifyAvailability,
  shopifyPackSize,
  shopifyVariantName,
} from "./adapters/shopify"
import { stripTags } from "./html"
import { failedExtraction, invalidProductReason } from "./product-extraction"
import type {
  ExtractedProductRow,
  ProductExtractionResult,
  ProductPageCandidate,
} from "./types"

const CATALOG_PAGE_SIZE = 250
const CATALOG_PAGE_INTERVAL_MS = 300
const MAX_CATALOG_PAGES = 400
const MAX_RATE_LIMIT_RETRIES = 8
const INITIAL_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 60_000

type ShopifyCatalogVariant = {
  id?: number
  title?: string
  sku?: string
  price?: string | number
  available?: boolean
  featured_image?: ShopifyCatalogImage | string | null
}

type ShopifyCatalogImage = {
  src?: string
}

type ShopifyCatalogProduct = {
  id?: number
  title?: string
  handle?: string
  body_html?: string
  vendor?: string
  product_type?: string
  image?: ShopifyCatalogImage | string | null
  images?: Array<ShopifyCatalogImage | string>
  featured_image?: ShopifyCatalogImage | string | null
  variants?: ShopifyCatalogVariant[]
}

function log(...args: unknown[]) {
  console.log("[shopify-catalog]", ...args)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function productHandle(url: string) {
  try {
    const match = new URL(url).pathname.match(/^\/products\/([^/]+)\/?$/i)
    return match ? decodeURIComponent(match[1]).toLowerCase() : ""
  } catch {
    return ""
  }
}

async function fetchCatalogPage(origin: string, page: number, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `${origin}/products.json?limit=${CATALOG_PAGE_SIZE}&page=${page}`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MedMKP-CatalogIndexer/0.1; +https://medmkp.local)",
          Accept: "application/json",
        },
      }
    )

    if (!response.ok) {
      return { status: response.status }
    }

    const parsed = (await response.json()) as { products?: ShopifyCatalogProduct[] }
    return { status: response.status, products: parsed.products }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchShopifyCatalog(
  origin: string,
  timeoutMs: number
): Promise<{ products: ShopifyCatalogProduct[]; complete: boolean } | undefined> {
  const products: ShopifyCatalogProduct[] = []
  let backoffMs = INITIAL_BACKOFF_MS

  for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
    let result: Awaited<ReturnType<typeof fetchCatalogPage>> | undefined

    for (let retry = 0; retry <= MAX_RATE_LIMIT_RETRIES; retry += 1) {
      try {
        result = await fetchCatalogPage(origin, page, timeoutMs)
      } catch {
        result = { status: 0 }
      }

      if (result.status !== 429 && result.status !== 0) {
        break
      }

      log(
        `Catalog page ${page} for ${origin} got status ${result.status || "network error"}, backing off ${backoffMs}ms`
      )
      await sleep(backoffMs + Math.floor(Math.random() * 500))
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
    }

    if (!result || result.status !== 200 || !Array.isArray(result.products)) {
      // Endpoint unavailable on page 1 means the store disabled products.json;
      // mid-pagination errors are not safe to commit as a replacement catalog.
      return page === 1 ? undefined : { products, complete: false }
    }

    backoffMs = INITIAL_BACKOFF_MS
    products.push(...result.products)

    if (result.products.length < CATALOG_PAGE_SIZE) {
      return { products, complete: true }
    }

    await sleep(CATALOG_PAGE_INTERVAL_MS)
  }

  return { products, complete: false }
}

function priceString(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2)
  }

  if (typeof value === "string") {
    return value.trim()
  }

  return ""
}

function imageSource(value: ShopifyCatalogImage | string | null | undefined) {
  if (typeof value === "string") {
    return value
  }

  return value?.src || ""
}

function catalogImageUrls(
  product: ShopifyCatalogProduct,
  variant: ShopifyCatalogVariant,
  origin: string
) {
  return [
    ...new Set(
      [
        imageSource(variant.featured_image),
        imageSource(product.featured_image),
        imageSource(product.image),
        ...(product.images ?? []).map(imageSource),
      ]
        .filter(Boolean)
        .map((url) => {
          try {
            return new URL(url, origin).href
          } catch {
            return ""
          }
        })
        .filter(Boolean)
    ),
  ]
}

function catalogRows(
  candidate: ProductPageCandidate,
  product: ShopifyCatalogProduct,
  origin: string
): ExtractedProductRow[] {
  const variants = product.variants?.length ? product.variants : [{}]
  const description = stripTags(product.body_html ?? "")
  const productUrl = product.handle
    ? new URL("/products/" + product.handle, origin).href
    : candidate.url

  return variants.map((variant, index): ExtractedProductRow => {
    const name = shopifyVariantName(product.title ?? "", variant.title ?? "")
    const imageUrls = catalogImageUrls(product, variant, origin)

    return {
      sku: variant.sku || "",
      manufacturer_sku: variant.sku || "",
      brand: product.vendor,
      name,
      description: description || name,
      category: product.product_type || candidate.category || "Dental supplies",
      subcategory: candidate.subcategory || "",
      product_line: product.product_type || "",
      product_url: productUrl,
      image_url: imageUrls[0] ?? "",
      pack_size: shopifyPackSize(name + " " + description),
      unit_of_measure: "",
      price: priceString(variant.price),
      price_basis: "each",
      availability: shopifyAvailability(variant.available),
      min_quantity: 1,
      raw: {
        extracted_by: "shopify-products-json",
        product_id: product.id,
        variant_id: variant.id,
        variant_index: index,
        source_page_url: candidate.url,
        sitemap_url: candidate.sitemap_url,
        confidence_score: candidate.confidence_score,
        reasons: candidate.reasons,
        image_urls: imageUrls,
      },
    }
  })
}

function catalogCandidate(
  origin: string,
  product: ShopifyCatalogProduct,
  fallback: ProductPageCandidate
): ProductPageCandidate {
  const productUrl = product.handle
    ? new URL("/products/" + product.handle, origin).href
    : fallback.url

  return {
    ...fallback,
    url: productUrl,
    category: product.product_type || fallback.category,
    subcategory: fallback.subcategory || "",
    reasons: [
      ...fallback.reasons,
      "Shopify products.json full-catalog extraction",
    ],
  }
}

export async function extractShopifyCatalogProducts(
  candidates: ProductPageCandidate[],
  options: { timeoutMs?: number } = {}
): Promise<ProductExtractionResult & { remaining: ProductPageCandidate[] }> {
  const remaining: ProductPageCandidate[] = []
  const byOrigin = new Map<string, ProductPageCandidate[]>()

  for (const candidate of candidates) {
    if (adapterForCandidate(candidate).id !== "shopify" || !productHandle(candidate.url)) {
      remaining.push(candidate)
      continue
    }

    const origin = new URL(candidate.url).origin
    const group = byOrigin.get(origin) ?? []
    group.push(candidate)
    byOrigin.set(origin, group)
  }

  const products: ProductExtractionResult["products"] = []
  const failures: ProductExtractionResult["failures"] = []

  for (const [origin, originCandidates] of byOrigin) {
    log(
      `Fetching catalog from ${origin}/products.json for ${originCandidates.length} candidate(s)`
    )
    const catalog = await fetchShopifyCatalog(origin, options.timeoutMs ?? 30_000)

    if (!catalog?.products.length) {
      log(
        `Catalog endpoint unavailable for ${origin}, falling back to per-page extraction`
      )
      remaining.push(...originCandidates)
      continue
    }

    if (!catalog.complete) {
      log(
        `Catalog endpoint returned ${catalog.products.length} partial product(s) for ${origin}, falling back to per-page extraction`
      )
      remaining.push(...originCandidates)
      continue
    }

    log(`Fetched ${catalog.products.length} product(s) from ${origin}/products.json`)
    const candidateByHandle = new Map(
      originCandidates.map((candidate) => [productHandle(candidate.url), candidate])
    )
    const fallbackCandidate = originCandidates[0]

    let matched = 0
    for (const product of catalog.products) {
      const handle = String(product.handle ?? "").toLowerCase()
      const matchedCandidate = candidateByHandle.get(handle)
      const candidate = matchedCandidate ?? catalogCandidate(origin, product, fallbackCandidate)

      if (matchedCandidate) {
        matched += 1
      }

      for (const row of catalogRows(candidate, product, origin)) {
        const reason = invalidProductReason(row)

        if (reason) {
          failures.push(failedExtraction(candidate, "products.json", reason))
          continue
        }

        products.push(row)
      }
    }

    log(
      `Matched ${matched}/${originCandidates.length} candidate(s) and extracted full ${origin} catalog`
    )
  }

  return { products, failures, remaining }
}
