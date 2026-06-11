import { downloadText } from "./sitemap-discovery"
import { normalizeSiteUrl } from "./suppliers"
import type {
  IndexedSupplierUrl,
  SupplierSeedRow,
} from "./types"

/**
 * Shasta Dental Supply (shastadentalsupply.com) is a custom ASP.NET store
 * with no sitemap (sitemap.xml 404s and robots.txt has no Sitemap
 * directive). The catalog is reachable through navigation pages:
 *
 *   index.aspx -> show_Categories.aspx?ID= -> show_Subs.aspx?ID=
 *     -> show_Products.aspx?ID= (product family) -> show_Product.aspx?ID= (SKU)
 *
 * This discovery crawls the listing pages and emits SKU-level
 * show_Product.aspx URLs as product candidates.
 */
const SHASTA_LISTING_PATHS = [
  /^\/index\.aspx$/i,
  /^\/show_Categories\.aspx$/i,
  /^\/show_Subs\.aspx$/i,
  /^\/show_Products\.aspx$/i,
  /^\/show_Manufacturers\.aspx$/i,
]
const SHASTA_PRODUCT_PATH = /^\/show_Product\.aspx$/i

type ShastaCatalogPage = {
  url: string
  depth: number
}

type ShastaDiscoveryOptions = {
  timeoutMs?: number
  debug?: boolean
  concurrency?: number
  maxPages?: number
}

function debugLog(enabled: boolean | undefined, ...args: unknown[]) {
  if (enabled) {
    console.log("[shasta-catalog-discovery]", ...args)
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
}

function hrefs(html: string, baseUrl: string) {
  const urls: string[] = []

  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const href = match[2].trim()
    if (!href || href.startsWith("#") || /^(?:javascript|mailto|tel):/i.test(href)) {
      continue
    }

    try {
      urls.push(new URL(decodeHtml(href), baseUrl).href)
    } catch {
      // Ignore malformed hrefs.
    }
  }

  return urls
}

function shastaSupplier(supplier: SupplierSeedRow) {
  try {
    const site = normalizeSiteUrl(supplier.website_url)
    return /shastadentalsupply\.com$/i.test(new URL(site.origin).hostname) ||
      /shasta dental supply/i.test(supplier.distributor)
  } catch {
    return /shasta dental supply/i.test(supplier.distributor)
  }
}

function productCanonicalUrl(url: string, origin: string) {
  try {
    const parsed = new URL(url)
    if (parsed.origin !== origin || !SHASTA_PRODUCT_PATH.test(parsed.pathname)) {
      return ""
    }

    const id = parsed.searchParams.get("ID") ?? parsed.searchParams.get("id")
    if (!id) {
      return ""
    }

    return `${origin}/show_Product.aspx?ID=${id}`
  } catch {
    return ""
  }
}

function listingCanonicalUrl(url: string, origin: string) {
  try {
    const parsed = new URL(url)
    if (parsed.origin !== origin ||
      !SHASTA_LISTING_PATHS.some((pattern) => pattern.test(parsed.pathname))) {
      return ""
    }

    const keep = new URL(`${origin}${parsed.pathname}`)
    for (const param of ["ID", "id", "P", "C", "M", "Page"]) {
      const value = parsed.searchParams.get(param)
      if (value) {
        keep.searchParams.set(param, value)
      }
    }

    return keep.href
  } catch {
    return ""
  }
}

async function promiseMap<T, R>(
  items: T[],
  concurrency: number,
  iterator: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++
        results[currentIndex] = await iterator(items[currentIndex], currentIndex)
      }
    })
  )

  return results
}

export async function discoverShastaCatalogUrls(
  suppliers: SupplierSeedRow[],
  options: ShastaDiscoveryOptions = {}
) {
  const supplier = suppliers.find(shastaSupplier)
  if (!supplier) {
    return [] as IndexedSupplierUrl[]
  }

  const site = normalizeSiteUrl(supplier.website_url)
  const origin = site.origin
  const maxPages = options.maxPages ?? 5000
  const concurrency = options.concurrency ?? 4
  const queue: ShastaCatalogPage[] = [{ url: `${origin}/index.aspx`, depth: 0 }]
  const queued = new Set(queue.map((page) => page.url))
  const crawled = new Set<string>()
  const products = new Map<string, IndexedSupplierUrl>()
  let pagesFetched = 0

  debugLog(options.debug, "Starting Shasta full-catalog discovery")

  while (queue.length && pagesFetched < maxPages) {
    const remainingPageBudget = maxPages - pagesFetched
    const batch = queue.splice(0, Math.min(concurrency, remainingPageBudget))
    const pages = await promiseMap(batch, concurrency, async (page) => {
      if (crawled.has(page.url)) {
        return { page, result: undefined }
      }

      crawled.add(page.url)
      debugLog(options.debug, `Fetching catalog page ${page.url}`)
      const result = await downloadText(page.url, options.timeoutMs)
      return { page, result }
    })

    for (const { page, result } of pages) {
      if (!result || !result.ok || !result.body) {
        continue
      }

      pagesFetched += 1

      for (const url of hrefs(result.body, page.url)) {
        const productUrl = productCanonicalUrl(url, origin)
        if (productUrl) {
          if (!products.has(productUrl)) {
            products.set(productUrl, {
              distributor: supplier.distributor,
              website_url: supplier.website_url,
              origin,
              prices: supplier.prices,
              sitemap_url: page.url,
              url: productUrl,
              url_type: "product",
              confidence_score: 95,
              reasons: ["Shasta full-catalog crawl product link"],
            })
          }
          continue
        }

        const canonical = listingCanonicalUrl(url, origin)
        if (!canonical || queued.has(canonical) || crawled.has(canonical)) {
          continue
        }

        queued.add(canonical)
        queue.push({ url: canonical, depth: page.depth + 1 })
      }
    }

    if (pagesFetched % 50 === 0) {
      debugLog(
        options.debug,
        `Shasta catalog discovery progress: ${pagesFetched} page(s), ${products.size} product URL(s), ${queue.length} queued`
      )
    }
  }

  debugLog(
    options.debug,
    `Shasta full-catalog discovery complete: ${pagesFetched} page(s), ${products.size} product URL(s), ${queue.length} queued`
  )

  return [...products.values()]
}
