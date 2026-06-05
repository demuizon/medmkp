import { genericProductExtract } from "./generic"
import { firstMatch, metaContent, stripTags } from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

function cleanPearsonName(name?: string) {
  return (name ?? "")
    .replace(/\s*\|\s*Pearson Dental.*$/i, "")
    .replace(/\s*\|\s*Dental Product.*$/i, "")
    .replace(/^Buy\s+/i, "")
    .trim()
}

function titleBrand(html: string) {
  const title = firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i])
  return firstMatch(title, [/\(([^)]+)\)/])
}

function titleProductLine(html: string) {
  const title = metaContent(html, ["og:title", "twitter:title"]) ||
    firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i])

  return cleanPearsonName(title.replace(/\([^)]*\)/g, ""))
}

function firstDollarAmounts(html: string) {
  return [...html.matchAll(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/g)].map(
    (match) => match[1]
  )
}

function extractPackSize(name: string) {
  return firstMatch(name, [
    /((?:box|pkg|pack|package|case|bag|bottle|tube|syringe|unit)\s+of\s+[0-9][A-Za-z0-9/-]*)/i,
  ])
}

function normalizeSku(value: string) {
  return value.replace(/\s+/g, "").trim()
}

function skuProductUrl(candidate: ProductPageCandidate, binSku: string) {
  const url = new URL(candidate.url)
  url.pathname = "/catalog/product.asp"
  url.searchParams.set("bin2", binSku)

  return url.href
}

function pearsonItemRows(candidate: ProductPageCandidate, html: string) {
  if (/page (?:has been )?removed|product not found|error code/i.test(stripTags(html))) {
    return []
  }

  const rows = [
    ...html.matchAll(/<tr\b[^>]*valign\s*=\s*["']?\s*top\s*["']?[^>]*>([\s\S]*?)<\/tr>/gi),
  ]
  const productLine = titleProductLine(html)

  return rows.flatMap((match): ExtractedProductRow[] => {
    const rowHtml = match[1]
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (cell) => cell[1]
    )

    if (cells.length < 3) {
      return []
    }

    const descriptionCell = cells[0]
    const itemCell = cells[1]
    const priceCell = cells[2]
    const name = stripTags(
      firstMatch(descriptionCell, [/<b[^>]*>([\s\S]*?)<\/b>/i])
    )
    const manufacturerSku = firstMatch(stripTags(descriptionCell), [
      /Mfg\.\s*Part\s*#:\s*([A-Za-z0-9._/-]+)/i,
    ])
    const displaySku = stripTags(firstMatch(itemCell, [/<b[^>]*>([\s\S]*?)<\/b>/i]))
    const binSku = firstMatch(itemCell, [/bin2=([A-Za-z0-9]+)/i])
    const sku = normalizeSku(displaySku || binSku)
    const prices = firstDollarAmounts(priceCell)
    const price = prices.at(-1) ?? ""

    if (!name || !sku || !price) {
      return []
    }

    return [{
      sku,
      manufacturer_sku: manufacturerSku,
      brand: titleBrand(html),
      name,
      description: name,
      category: "Dental supplies",
      subcategory: "",
      product_line: productLine,
      product_url: binSku ? skuProductUrl(candidate, binSku) : candidate.url,
      pack_size: extractPackSize(name),
      unit_of_measure: "",
      price,
      price_basis: "each",
      availability: "unknown",
      min_quantity: 1,
      raw: {
        extracted_by: "pearson",
        source_page_url: candidate.url,
        sitemap_url: candidate.sitemap_url,
        confidence_score: candidate.confidence_score,
        reasons: candidate.reasons,
      },
    }]
  })
}

export const pearsonAdapter: SupplierProductAdapter = {
  id: "pearson",
  matches: (candidate: ProductPageCandidate) =>
    /pearsondental\.com/i.test(candidate.url) ||
    candidate.distributor.toLowerCase() === "pearson dental",
  extractProduct: (candidate, html) => {
    const product = genericProductExtract(candidate, html)

    return {
      ...product,
      name: cleanPearsonName(product.name),
      category: "Dental supplies",
      raw: {
        ...(typeof product.raw === "object" && product.raw ? product.raw : {}),
        extracted_by: "pearson",
      },
    }
  },
  extractProducts: pearsonItemRows,
}
