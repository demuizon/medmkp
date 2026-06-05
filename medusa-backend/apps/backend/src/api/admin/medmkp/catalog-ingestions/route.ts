import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { buildSupplierCatalogIngestion } from "../../../../ingestion/supplier-catalog"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"

type CatalogIngestionBody = Parameters<typeof buildSupplierCatalogIngestion>[0]

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [sources, supplierProducts, priceSnapshots, matches, suppliers] =
    await Promise.all([
      medmkp.listSupplierCatalogSources(),
      medmkp.listSupplierProducts(),
      medmkp.listSupplierPriceSnapshots(),
      medmkp.listCanonicalProductMatches(),
      medmkp.listSuppliers(),
    ])

  res.json({
    sources: sources.map((source) => {
      const products = supplierProducts.filter(
        (product) =>
          product.supplier_id === source.supplier_id &&
          product.source_catalog === source.source_catalog
      )

      return {
        ...source,
        supplier: suppliers.find((supplier) => supplier.id === source.supplier_id),
        product_count: products.length,
        price_snapshot_count: priceSnapshots.filter(
          (snapshot) =>
            snapshot.supplier_id === source.supplier_id &&
            products.some((product) => product.id === snapshot.supplier_product_id)
        ).length,
        match_count: matches.filter(
          (match) =>
            match.supplier_id === source.supplier_id &&
            products.some((product) => product.id === match.supplier_product_id)
        ).length,
      }
    }),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const body = (req.body ?? {}) as Partial<CatalogIngestionBody>

  if (!body.supplier_id || !body.source_catalog || !body.source_type) {
    res.status(400).json({
      message: "supplier_id, source_catalog, and source_type are required.",
    })
    return
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    res.status(400).json({
      message: "rows must include at least one supplier catalog row.",
    })
    return
  }

  const canonicalProducts = await medmkp.listCanonicalProducts()
  const ingestion = buildSupplierCatalogIngestion(
    body as CatalogIngestionBody,
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

  const sourceIdsToDelete = existingSources
    .filter((source) => source.id === ingestion.source.id)
    .map((source) => source.id)
  const productIdsToDelete = existingProducts
    .filter(
      (product) =>
        product.supplier_id === body.supplier_id &&
        product.source_catalog === body.source_catalog
    )
    .map((product) => product.id)
  const matchIdsToDelete = existingMatches
    .filter((match) => productIdsToDelete.includes(match.supplier_product_id))
    .map((match) => match.id)

  if (matchIdsToDelete.length) {
    await medmkp.deleteCanonicalProductMatches(matchIdsToDelete)
  }
  if (productIdsToDelete.length) {
    await medmkp.deleteSupplierProducts(productIdsToDelete)
  }
  if (sourceIdsToDelete.length) {
    await medmkp.deleteSupplierCatalogSources(sourceIdsToDelete)
  }

  const [source, supplierProducts, canonicalProductMatches, priceSnapshots] =
    await Promise.all([
      medmkp.createSupplierCatalogSources(ingestion.source),
      medmkp.createSupplierProducts(
        ingestion.supplierProducts as Parameters<
          typeof medmkp.createSupplierProducts
        >[0]
      ),
      medmkp.createCanonicalProductMatches(
        ingestion.canonicalProductMatches as Parameters<
          typeof medmkp.createCanonicalProductMatches
        >[0]
      ),
      ingestion.priceSnapshots.length
        ? medmkp.createSupplierPriceSnapshots(
            ingestion.priceSnapshots as Parameters<
              typeof medmkp.createSupplierPriceSnapshots
            >[0]
          )
        : Promise.resolve([]),
    ])

  res.status(202).json({
    source,
    imported: {
      supplier_products: Array.isArray(supplierProducts)
        ? supplierProducts.length
        : 1,
      canonical_product_matches: Array.isArray(canonicalProductMatches)
        ? canonicalProductMatches.length
        : 1,
      price_snapshots: Array.isArray(priceSnapshots) ? priceSnapshots.length : 1,
    },
  })
}
