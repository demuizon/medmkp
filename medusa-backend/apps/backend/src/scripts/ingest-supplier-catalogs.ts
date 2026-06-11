import type { MedusaContainer } from "@medusajs/framework"
import { buildSupplierCatalogIngestion } from "../ingestion/supplier-catalog"
import type {
  SupplierCatalogIngestionInput,
  SupplierCatalogRow,
} from "../ingestion/supplier-catalog"
import { runSupplierIngestionPipeline } from "../ingestion/supplier-pipeline/pipeline"
import { normalizeSiteUrl } from "../ingestion/supplier-pipeline/suppliers"
import type { SupplierSeedRow, SupplierSourceUrl } from "../ingestion/supplier-pipeline/types"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"

type CliOptions = {
  supplierId?: string
  supplierName?: string
  limit?: number
  timeoutMs?: number
  sitemapConcurrency?: number
  productConcurrency?: number
  sourceUrls: string[]
  sourceConcurrency?: number
  maxLinksPerSource?: number
  maxSitemapsPerSupplier?: number
  maxDcDentalCatalogPages?: number
  maxPearsonCatalogPages?: number
  maxShastaCatalogPages?: number
  debug: boolean
  commit: boolean
  allowEmptyCommit: boolean
}

function optionValue(arg: string) {
  const [, ...parts] = arg.split("=")
  return parts.join("=")
}

function parseOptions(): CliOptions {
  const options: CliOptions = {
    supplierId: process.env.SUPPLIER_ID,
    supplierName: process.env.SUPPLIER_NAME,
    limit: process.env.PRODUCT_PAGE_LIMIT
      ? Number(process.env.PRODUCT_PAGE_LIMIT)
      : undefined,
    timeoutMs: process.env.PRODUCT_PAGE_TIMEOUT_MS
      ? Number(process.env.PRODUCT_PAGE_TIMEOUT_MS)
      : undefined,
    sitemapConcurrency: process.env.SUPPLIER_INGESTION_SITEMAP_CONCURRENCY
      ? Number(process.env.SUPPLIER_INGESTION_SITEMAP_CONCURRENCY)
      : undefined,
    productConcurrency: process.env.SUPPLIER_INGESTION_PRODUCT_CONCURRENCY
      ? Number(process.env.SUPPLIER_INGESTION_PRODUCT_CONCURRENCY)
      : undefined,
    sourceUrls: process.env.SUPPLIER_INGESTION_SOURCE_URLS
      ? process.env.SUPPLIER_INGESTION_SOURCE_URLS.split(",").map((url) => url.trim()).filter(Boolean)
      : [],
    sourceConcurrency: process.env.SUPPLIER_INGESTION_SOURCE_CONCURRENCY
      ? Number(process.env.SUPPLIER_INGESTION_SOURCE_CONCURRENCY)
      : undefined,
    maxLinksPerSource: process.env.SUPPLIER_INGESTION_MAX_LINKS_PER_SOURCE
      ? Number(process.env.SUPPLIER_INGESTION_MAX_LINKS_PER_SOURCE)
      : undefined,
    maxSitemapsPerSupplier: process.env.SUPPLIER_INGESTION_MAX_SITEMAPS_PER_SUPPLIER
      ? Number(process.env.SUPPLIER_INGESTION_MAX_SITEMAPS_PER_SUPPLIER)
      : undefined,
    maxDcDentalCatalogPages: process.env.SUPPLIER_INGESTION_MAX_DCDENTAL_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_DCDENTAL_CATALOG_PAGES)
      : undefined,
    maxPearsonCatalogPages: process.env.SUPPLIER_INGESTION_MAX_PEARSON_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_PEARSON_CATALOG_PAGES)
      : undefined,
    maxShastaCatalogPages: process.env.SUPPLIER_INGESTION_MAX_SHASTA_CATALOG_PAGES
      ? Number(process.env.SUPPLIER_INGESTION_MAX_SHASTA_CATALOG_PAGES)
      : undefined,
    debug: process.env.SUPPLIER_INGESTION_DEBUG === "1",
    commit: process.env.SUPPLIER_INGESTION_COMMIT === "1",
    allowEmptyCommit: process.env.SUPPLIER_INGESTION_ALLOW_EMPTY_COMMIT === "1",
  }

  for (const arg of process.argv.slice(2)) {
    if (arg === "--debug") {
      options.debug = true
    }
    if (arg === "--commit") {
      options.commit = true
    }
    if (arg === "--allow-empty-commit") {
      options.allowEmptyCommit = true
    }
    if (arg.startsWith("--supplier-id=")) {
      options.supplierId = optionValue(arg)
    }
    if (arg.startsWith("--supplier=")) {
      options.supplierName = optionValue(arg)
    }
    if (arg.startsWith("--limit=")) {
      options.limit = Number(optionValue(arg))
    }
    if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(optionValue(arg))
    }
    if (arg.startsWith("--sitemap-concurrency=")) {
      options.sitemapConcurrency = Number(optionValue(arg))
    }
    if (arg.startsWith("--product-concurrency=")) {
      options.productConcurrency = Number(optionValue(arg))
    }
    if (arg.startsWith("--source-url=")) {
      options.sourceUrls.push(optionValue(arg))
    }
    if (arg.startsWith("--source-concurrency=")) {
      options.sourceConcurrency = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-links-per-source=")) {
      options.maxLinksPerSource = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-sitemaps-per-supplier=")) {
      options.maxSitemapsPerSupplier = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-dcdental-catalog-pages=")) {
      options.maxDcDentalCatalogPages = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-pearson-catalog-pages=")) {
      options.maxPearsonCatalogPages = Number(optionValue(arg))
    }
    if (arg.startsWith("--max-shasta-catalog-pages=")) {
      options.maxShastaCatalogPages = Number(optionValue(arg))
    }
  }

  return options
}

function sourceCatalogForSupplier(supplier: { slug?: string; website_url: string }) {
  const slug = supplier.slug?.trim()

  if (slug) {
    return `${slug}-website-public`
  }

  return new URL(supplier.website_url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() + "-website-public"
}

function cents(value: string | undefined) {
  if (!value?.trim()) {
    return undefined
  }

  const dollars = Number(value.replace(/[$,\s]/g, ""))

  return Number.isFinite(dollars) ? Math.round(dollars * 100) : undefined
}

function catalogRows(rows: Awaited<ReturnType<typeof runSupplierIngestionPipeline>>["products"]) {
  return rows.map((row): SupplierCatalogRow => ({
    ...row,
    price_cents: row.price_cents ?? cents(row.price),
  }))
}

function validUrl(value: string | undefined) {
  if (!value?.trim()) {
    return false
  }

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function parseSupplierSourceUrls(value: string | undefined) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)

    if (Array.isArray(parsed)) {
      return parsed.filter((url): url is string => typeof url === "string")
    }
  } catch {
    // Fall through to line/comma parsing for hand-edited values.
  }

  return trimmed
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter(Boolean)
}

function sourceUrlRecord(input: {
  supplierName: string
  supplierWebsiteUrl: string
  prices?: string
  sourceCatalog: string
  sourceUrl: string
}): SupplierSourceUrl {
  const site = normalizeSiteUrl(input.supplierWebsiteUrl)

  return {
    distributor: input.supplierName,
    website_url: input.supplierWebsiteUrl,
    origin: site.origin,
    prices: input.prices ?? "Y",
    source_catalog: input.sourceCatalog,
    source_url: input.sourceUrl,
  }
}

const dcDentalDefaultSourcePaths = [
  "/Supplies",
  "/Small-Equipment",
  "/3M-Merchandise",
]

function defaultSourceUrlsForSupplier(supplier: {
  name: string
  website_url: string
  slug?: string
}) {
  const site = normalizeSiteUrl(supplier.website_url)

  if (!/dcdental.com$/i.test(new URL(site.origin).hostname) &&
    !/dc dental/i.test(supplier.name)) {
    return [] as SupplierSourceUrl[]
  }

  return dcDentalDefaultSourcePaths.map((path) => sourceUrlRecord({
    supplierName: supplier.name,
    supplierWebsiteUrl: supplier.website_url,
    sourceCatalog: sourceCatalogForSupplier(supplier),
    sourceUrl: new URL(path, site.origin).href,
  }))
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }

  return result
}

async function promiseChunks<T>(
  items: T[],
  size: number,
  iterator: (chunk: T[]) => Promise<unknown>
) {
  for (const chunk of chunks(items, size)) {
    await iterator(chunk)
  }
}

async function replaceSupplierCatalog(
  medmkp: MedMKPModuleService,
  input: SupplierCatalogIngestionInput
) {
  const canonicalProducts = await medmkp.listCanonicalProducts()
  const ingestion = buildSupplierCatalogIngestion(
    input,
    canonicalProducts.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      attributes_text: product.attributes_text,
    }))
  )

  const [existingSources, existingProducts, existingMatches] =
    await Promise.all([
      medmkp.listSupplierCatalogSources(),
      medmkp.listSupplierProducts(),
      medmkp.listCanonicalProductMatches(),
    ])
  const productIdsToDelete = existingProducts
    .filter(
      (product) =>
        product.supplier_id === input.supplier_id &&
        product.source_catalog === input.source_catalog
    )
    .map((product) => product.id)
  const matchIdsToDelete = existingMatches
    .filter((match) => productIdsToDelete.includes(match.supplier_product_id))
    .map((match) => match.id)
  const sourceIdsToDelete = existingSources
    .filter(
      (source) =>
        source.supplier_id === input.supplier_id &&
        source.source_catalog === input.source_catalog
    )
    .map((source) => source.id)

  if (matchIdsToDelete.length) {
    await promiseChunks(matchIdsToDelete, 500, (chunk) =>
      medmkp.deleteCanonicalProductMatches(chunk)
    )
  }
  if (productIdsToDelete.length) {
    await promiseChunks(productIdsToDelete, 500, (chunk) =>
      medmkp.deleteSupplierProducts(chunk)
    )
  }
  if (sourceIdsToDelete.length) {
    await promiseChunks(sourceIdsToDelete, 500, (chunk) =>
      medmkp.deleteSupplierCatalogSources(chunk)
    )
  }

  await medmkp.createSupplierCatalogSources(ingestion.source)
  await promiseChunks(ingestion.supplierProducts, 500, (chunk) =>
    medmkp.createSupplierProducts(
      chunk as Parameters<typeof medmkp.createSupplierProducts>[0]
    )
  )
  await promiseChunks(ingestion.canonicalProductMatches, 500, (chunk) =>
    medmkp.createCanonicalProductMatches(
      chunk as Parameters<typeof medmkp.createCanonicalProductMatches>[0]
    )
  )

  if (ingestion.priceSnapshots.length) {
    await promiseChunks(ingestion.priceSnapshots, 500, (chunk) =>
      medmkp.createSupplierPriceSnapshots(
        chunk as Parameters<typeof medmkp.createSupplierPriceSnapshots>[0]
      )
    )
  }

  return {
    supplier_products: ingestion.supplierProducts.length,
    canonical_product_matches: ingestion.canonicalProductMatches.length,
    price_snapshots: ingestion.priceSnapshots.length,
  }
}

export default async function ingestSupplierCatalogs({
  container,
}: {
  container: MedusaContainer
}) {
  const options = parseOptions()
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const dbSuppliers = await medmkp.listSuppliers()
  const suppliers = dbSuppliers
    .filter((supplier) => !options.supplierId || supplier.id === options.supplierId)
    .map((supplier): SupplierSeedRow => ({
      distributor: supplier.name,
      website_url: supplier.website_url,
      prices: "Y",
    }))
  const matchedSupplier = dbSuppliers.find((supplier) =>
    options.supplierId
      ? supplier.id === options.supplierId
      : supplier.name === (options.supplierName ?? suppliers[0]?.distributor)
  )
  const dbSourceUrls = matchedSupplier
    ? parseSupplierSourceUrls(matchedSupplier.catalog_source_urls)
        .filter(validUrl)
        .map((sourceUrl) => sourceUrlRecord({
          supplierName: matchedSupplier.name,
          supplierWebsiteUrl: matchedSupplier.website_url,
          sourceCatalog: sourceCatalogForSupplier(matchedSupplier),
          sourceUrl,
        }))
    : []
  const cliSourceUrls = matchedSupplier
    ? options.sourceUrls.map((sourceUrl) => sourceUrlRecord({
      supplierName: matchedSupplier.name,
      supplierWebsiteUrl: matchedSupplier.website_url,
      sourceCatalog: sourceCatalogForSupplier(matchedSupplier),
      sourceUrl,
    }))
    : []
  const fallbackSourceUrls = matchedSupplier && !dbSourceUrls.length && !cliSourceUrls.length
    ? defaultSourceUrlsForSupplier(matchedSupplier)
    : []

  const result = await runSupplierIngestionPipeline({
    suppliers,
    supplierName: options.supplierName,
    productLimit: options.limit,
    timeoutMs: options.timeoutMs,
    sitemapConcurrency: options.sitemapConcurrency,
    productConcurrency: options.productConcurrency,
    sourceUrls: [...dbSourceUrls, ...cliSourceUrls, ...fallbackSourceUrls],
    sourceConcurrency: options.sourceConcurrency,
    maxLinksPerSource: options.maxLinksPerSource,
    maxSitemapsPerSupplier: options.maxSitemapsPerSupplier,
    maxDcDentalCatalogPages: options.maxDcDentalCatalogPages,
    maxPearsonCatalogPages: options.maxPearsonCatalogPages,
    maxShastaCatalogPages: options.maxShastaCatalogPages,
    debug: options.debug,
  })
  let importResult:
    | Awaited<ReturnType<typeof replaceSupplierCatalog>>
    | undefined

  if (options.commit) {
    if (!matchedSupplier) {
      throw new Error("Commit requires exactly one matched DB supplier")
    }
    if (!result.products.length && !options.allowEmptyCommit) {
      throw new Error(
        "Commit aborted: ingestion extracted 0 products. Re-run without --commit to inspect debug output, or pass --allow-empty-commit if you intentionally want to clear this supplier/source catalog."
      )
    }

    importResult = await replaceSupplierCatalog(medmkp, {
      supplier_id: matchedSupplier.id,
      source_type: "website",
      source_url: matchedSupplier.website_url,
      source_catalog: sourceCatalogForSupplier(matchedSupplier),
      rows: catalogRows(result.products),
    })
  }

  console.log(
    JSON.stringify(
      {
        source: "medmkp_supplier",
        commit: options.commit,
        allow_empty_commit: options.allowEmptyCommit,
        supplier_id: matchedSupplier?.id,
        source_urls: dbSourceUrls.length + cliSourceUrls.length + fallbackSourceUrls.length,
        ...result.summary,
        import: importResult,
      },
      null,
      2
    )
  )
}
