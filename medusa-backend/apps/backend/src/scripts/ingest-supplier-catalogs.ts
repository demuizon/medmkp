import type { MedusaContainer } from "@medusajs/framework"
import { buildSupplierCatalogIngestion } from "../ingestion/supplier-catalog"
import type {
  SupplierCatalogIngestionInput,
  SupplierCatalogRow,
} from "../ingestion/supplier-catalog"
import { runSupplierIngestionPipeline } from "../ingestion/supplier-pipeline/pipeline"
import type { SupplierSeedRow } from "../ingestion/supplier-pipeline/types"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"

type CliOptions = {
  supplierId?: string
  supplierName?: string
  limit?: number
  timeoutMs?: number
  debug: boolean
  commit: boolean
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
    debug: process.env.SUPPLIER_INGESTION_DEBUG === "1",
    commit: process.env.SUPPLIER_INGESTION_COMMIT === "1",
  }

  for (const arg of process.argv.slice(2)) {
    if (arg === "--debug") {
      options.debug = true
    }
    if (arg === "--commit") {
      options.commit = true
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
  }

  return options
}

function sourceCatalogForSupplier(supplier: { slug?: string; website_url: string }) {
  const slug = supplier.slug?.trim()

  if (slug) {
    return `${slug}-sitemap-public`
  }

  return new URL(supplier.website_url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() + "-sitemap-public"
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
    await medmkp.deleteCanonicalProductMatches(matchIdsToDelete)
  }
  if (productIdsToDelete.length) {
    await medmkp.deleteSupplierProducts(productIdsToDelete)
  }
  if (sourceIdsToDelete.length) {
    await medmkp.deleteSupplierCatalogSources(sourceIdsToDelete)
  }

  await medmkp.createSupplierCatalogSources(ingestion.source)
  await medmkp.createSupplierProducts(
    ingestion.supplierProducts as Parameters<
      typeof medmkp.createSupplierProducts
    >[0]
  )
  await medmkp.createCanonicalProductMatches(
    ingestion.canonicalProductMatches as Parameters<
      typeof medmkp.createCanonicalProductMatches
    >[0]
  )

  if (ingestion.priceSnapshots.length) {
    await medmkp.createSupplierPriceSnapshots(
      ingestion.priceSnapshots as Parameters<
        typeof medmkp.createSupplierPriceSnapshots
      >[0]
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

  const result = await runSupplierIngestionPipeline({
    suppliers,
    supplierName: options.supplierName,
    productLimit: options.limit,
    timeoutMs: options.timeoutMs,
    debug: options.debug,
  })
  const matchedSupplier = dbSuppliers.find((supplier) =>
    options.supplierId
      ? supplier.id === options.supplierId
      : supplier.name === (options.supplierName ?? suppliers[0]?.distributor)
  )
  let importResult:
    | Awaited<ReturnType<typeof replaceSupplierCatalog>>
    | undefined

  if (options.commit) {
    if (!matchedSupplier) {
      throw new Error("Commit requires exactly one matched DB supplier")
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
        supplier_id: matchedSupplier?.id,
        ...result.summary,
        import: importResult,
      },
      null,
      2
    )
  )
}
