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
}

type ShopifyCatalogProduct = {
  id?: number
  title?: string
  handle?: string
  body_html?: string
  vendor?: string
  product_type?: string
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
): Promise<ShopifyCatalogProduct[] | undefined> {
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
      // mid-pagination errors keep the partial catalog and let the rest fall
      // back to per-page extraction.
      return page === 1 ? undefined : products
    }

    backoffMs = INITIAL_BACKOFF_MS
    products.push(...result.products)

    if (result.products.length < CATALOG_PAGE_SIZE) {
      return products
    }

    await sleep(CATALOG_PAGE_INTERVAL_MS)
  }

  return products
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
      },
    }
  })
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

    if (!catalog?.length) {
      log(
        `Catalog endpoint unavailable for ${origin}, falling back to per-page extraction`
      )
      remaining.push(...originCandidates)
      continue
    }

    log(`Fetched ${catalog.length} product(s) from ${origin}/products.json`)
    const byHandle = new Map(
      catalog.map((product) => [String(product.handle ?? "").toLowerCase(), product])
    )

    let matched = 0
    for (const candidate of originCandidates) {
      const product = byHandle.get(productHandle(candidate.url))

      if (!product) {
        remaining.push(candidate)
        continue
      }

      matched += 1
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
      `Matched ${matched}/${originCandidates.length} candidate(s) against ${origin} catalog`
    )
  }

  return { products, failures, remaining }
}
