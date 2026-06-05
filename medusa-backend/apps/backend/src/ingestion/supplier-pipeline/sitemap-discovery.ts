import type {
  DownloadResult,
  SupplierSeedRow,
  SupplierSitemapSummary,
} from "./types"
import { normalizeSiteUrl } from "./suppliers"

function sitemapDirectives(robotsText: string, origin: string) {
  return robotsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^sitemap:/i.test(line))
    .map((line) => line.replace(/^sitemap:\s*/i, "").trim())
    .map((url) => {
      try {
        return new URL(url, origin).href
      } catch {
        return url
      }
    })
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

export function xmlUrls(xml: string) {
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean)

  return [...new Set(urls)]
}

export async function downloadText(
  url: string,
  timeoutMs = 20_000
): Promise<DownloadResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MedMKP supplier catalog ingestion (+https://medmkp.com)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body = await response.text()

    return {
      url,
      status: response.status,
      ok: response.ok,
      content_type: response.headers.get("content-type") ?? "",
      bytes: Buffer.byteLength(body),
      body,
    }
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      content_type: "",
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function discoverSupplierSitemaps(
  suppliers: SupplierSeedRow[],
  options: { timeoutMs?: number } = {}
) {
  const summary: SupplierSitemapSummary[] = []

  for (const supplier of suppliers) {
    const site = normalizeSiteUrl(supplier.website_url)
    const robotsUrl = `${site.origin}/robots.txt`
    const robots = await downloadText(robotsUrl, options.timeoutMs)
    const directives = robots.ok && robots.body
      ? sitemapDirectives(robots.body, site.origin)
      : []
    const sitemapUrls = directives.length
      ? directives
      : [`${site.origin}/sitemap.xml`]
    const sitemaps: DownloadResult[] = []

    for (const sitemapUrl of sitemapUrls) {
      sitemaps.push(await downloadText(sitemapUrl, options.timeoutMs))
    }

    summary.push({
      distributor: supplier.distributor,
      website_url: supplier.website_url,
      origin: site.origin,
      prices: supplier.prices,
      robots,
      sitemap_directives: directives,
      used_fallback_sitemap: directives.length === 0,
      sitemaps,
    })
  }

  return summary
}
