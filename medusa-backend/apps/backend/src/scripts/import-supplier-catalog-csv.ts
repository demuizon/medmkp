import { readFileSync } from "fs"
import type { MedusaContainer } from "@medusajs/framework"
import { parseCsv } from "../ingestion/csv"
import {
  buildSupplierCatalogIngestion,
  type SupplierCatalogIngestionInput,
  type SupplierCatalogRow,
} from "../ingestion/supplier-catalog"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"

type CliOptions = {
  csv?: string
  supplier?: string
  sourceCatalog?: string
  sourceType?: SupplierCatalogIngestionInput["source_type"]
  sourceUrl?: string
}

function readCliOptions() {
  const envOptions: CliOptions = {
    csv: process.env.SUPPLIER_CATALOG_CSV,
    supplier: process.env.SUPPLIER_ID,
    sourceCatalog: process.env.SOURCE_CATALOG,
    sourceType: process.env.SOURCE_TYPE as SupplierCatalogIngestionInput["source_type"],
    sourceUrl: process.env.SOURCE_URL,
  }

  return process.argv.reduce((acc, arg) => {
    const [key, ...valueParts] = arg.split("=")
    const value = valueParts.join("=")

    if (key === "--csv") acc.csv = value
    if (key === "--supplier") acc.supplier = value
    if (key === "--source-catalog") acc.sourceCatalog = value
    if (key === "--source-type") {
      acc.sourceType = value as SupplierCatalogIngestionInput["source_type"]
    }
    if (key === "--source-url") acc.sourceUrl = value

    return acc
  }, envOptions)
}

function cents(value: string | undefined) {
  if (!value?.trim()) {
    return undefined
  }

  const normalized = value.replace(/[$,\s]/g, "")
  const dollars = Number(normalized)

  if (!Number.isFinite(dollars)) {
    return undefined
  }

  return Math.round(dollars * 100)
}

function numberValue(value: string | undefined) {
  if (!value?.trim()) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function csvRowsToCatalogRows(csvPath: string): SupplierCatalogRow[] {
  const rows = parseCsv(readFileSync(csvPath, "utf8"))
  const headers = rows[0].map((header) => header.trim())

  return rows.slice(1).map((cells) => {
    const record = headers.reduce((acc, header, index) => {
      acc[header] = cells[index]?.trim() ?? ""
      return acc
    }, {} as Record<string, string>)

    return {
      sku: record.sku,
      manufacturer_sku: record.manufacturer_sku,
      brand: record.brand,
      name: record.name,
      description: record.description,
      category: record.category,
      subcategory: record.subcategory,
      product_line: record.product_line,
      product_url: record.product_url,
      pack_size: record.pack_size,
      unit_of_measure: record.unit_of_measure,
      price_cents: cents(record.price),
      price_basis: record.price_basis as SupplierCatalogRow["price_basis"],
      availability: record.availability as SupplierCatalogRow["availability"],
      min_quantity: numberValue(record.min_quantity),
      raw: record,
    }
  })
}

export default async function importSupplierCatalogCsv({
  container,
}: {
  container: MedusaContainer
}) {
  const options = readCliOptions()

  if (!options.csv || !options.supplier || !options.sourceCatalog) {
    throw new Error(
      "Usage: SUPPLIER_CATALOG_CSV=./data/catalog.csv SUPPLIER_ID=msup_benco_com SOURCE_CATALOG=benco-com-manual-csv SOURCE_URL=https://benco.com npm run supplier:import-csv"
    )
  }

  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const rows = csvRowsToCatalogRows(options.csv)
  const canonicalProducts = await medmkp.listCanonicalProducts()
  const ingestion = buildSupplierCatalogIngestion(
    {
      supplier_id: options.supplier,
      source_catalog: options.sourceCatalog,
      source_type: options.sourceType ?? "csv",
      source_url: options.sourceUrl ?? "",
      rows,
    },
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
        product.supplier_id === options.supplier &&
        product.source_catalog === options.sourceCatalog
    )
    .map((product) => product.id)
  const matchIdsToDelete = existingMatches
    .filter((match) => productIdsToDelete.includes(match.supplier_product_id))
    .map((match) => match.id)
  const sourceIdsToDelete = existingSources
    .filter(
      (source) =>
        source.supplier_id === options.supplier &&
        source.source_catalog === options.sourceCatalog
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

  console.log(
    JSON.stringify(
      {
        supplier_id: options.supplier,
        source_catalog: options.sourceCatalog,
        supplier_products: ingestion.supplierProducts.length,
        canonical_product_matches: ingestion.canonicalProductMatches.length,
        price_snapshots: ingestion.priceSnapshots.length,
      },
      null,
      2
    )
  )
}
