import { adapterForCandidate } from "./adapters"
import type {
  FailedProductExtraction,
  ProductExtractionResult,
  ProductPageCandidate,
} from "./types"

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error)
  }

  const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined

  if (cause instanceof Error && cause.message) {
    return `${error.message}: ${cause.message}`
  }

  if (cause && typeof cause === "object" && "code" in cause) {
    return `${error.message}: ${(cause as { code: string }).code}`
  }

  return error.message
}

export async function fetchProductHtml(url: string, timeoutMs = 12_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MedMKP-CatalogIndexer/0.1; +https://medmkp.local)",
        Accept: "text/html,application/xhtml+xml",
      },
    })
    const contentType = response.headers.get("content-type") ?? ""
    const body = await response.text()

    return {
      ok: response.ok && /html/i.test(contentType),
      status: String(response.status),
      html: body,
      error: response.ok ? `Non-HTML content type: ${contentType}` : response.statusText,
    }
  } finally {
    clearTimeout(timer)
  }
}

function failedExtraction(
  candidate: ProductPageCandidate,
  status: string,
  error: string
): FailedProductExtraction {
  return {
    distributor: candidate.distributor,
    url: candidate.url,
    status,
    error,
    sitemap_url: candidate.sitemap_url,
    confidence_score: candidate.confidence_score,
    reasons: candidate.reasons,
  }
}

function invalidProductReason(product: ProductExtractionResult["products"][number]) {
  const name = product.name?.trim() ?? ""
  const description = product.description?.trim() ?? ""
  const hasIdentifier = Boolean(product.sku?.trim() || product.manufacturer_sku?.trim())
  const hasPrice = Boolean(product.price?.trim() || product.price_cents)

  if (!name) {
    return "No product name extracted"
  }

  if (/page (?:has been )?removed|product not found|error code/i.test(`${name} ${description}`)) {
    return "Rejected supplier error/product-not-found page"
  }

  if (!hasIdentifier) {
    return "Rejected product row without supplier SKU or manufacturer SKU"
  }

  if (!hasPrice) {
    return "Rejected product row without price"
  }

  return ""
}

export async function extractProductPages(
  candidates: ProductPageCandidate[],
  options: { limit?: number; timeoutMs?: number } = {}
): Promise<ProductExtractionResult> {
  const selected = candidates.slice(0, options.limit ?? candidates.length)
  const products: ProductExtractionResult["products"] = []
  const failures: ProductExtractionResult["failures"] = []

  for (const candidate of selected) {
    try {
      const result = await fetchProductHtml(candidate.url, options.timeoutMs)

      if (!result.ok) {
        failures.push(failedExtraction(candidate, result.status, result.error))
        continue
      }

      const adapter = adapterForCandidate(candidate)
      const extractedProducts = adapter.extractProducts
        ? adapter.extractProducts(candidate, result.html)
        : [adapter.extractProduct(candidate, result.html)]

      if (!extractedProducts.length) {
        failures.push(failedExtraction(candidate, result.status, "No valid product rows extracted"))
        continue
      }

      for (const product of extractedProducts) {
        const reason = invalidProductReason(product)

        if (reason) {
          failures.push(failedExtraction(candidate, result.status, reason))
          continue
        }

        products.push(product)
      }
    } catch (error) {
      failures.push(failedExtraction(candidate, "fetch failed", errorMessage(error)))
    }
  }

  return {
    products,
    failures,
  }
}
