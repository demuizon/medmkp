import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"

function latestSnapshotsByProduct(snapshots: Awaited<ReturnType<MedMKPModuleService["listSupplierPriceSnapshots"]>>) {
  return snapshots.reduce((acc, snapshot) => {
    const existing = acc.get(snapshot.supplier_product_id)

    if (
      !existing ||
      new Date(snapshot.captured_at).getTime() >
        new Date(existing.captured_at).getTime()
    ) {
      acc.set(snapshot.supplier_product_id, snapshot)
    }

    return acc
  }, new Map<string, (typeof snapshots)[number]>())
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const url = new URL(req.url, "http://localhost")
  const supplierId = url.searchParams.get("supplier_id")
  const sourceCatalog = url.searchParams.get("source_catalog")

  const [products, suppliers, priceSnapshots, matches] = await Promise.all([
    medmkp.listSupplierProducts(),
    medmkp.listSuppliers(),
    medmkp.listSupplierPriceSnapshots(),
    medmkp.listCanonicalProductMatches(),
  ])
  const latestPrices = latestSnapshotsByProduct(priceSnapshots)

  const filteredProducts = products.filter((product) => {
    if (supplierId && product.supplier_id !== supplierId) {
      return false
    }

    if (sourceCatalog && product.source_catalog !== sourceCatalog) {
      return false
    }

    return true
  })

  res.json({
    count: filteredProducts.length,
    supplier_products: filteredProducts.map((product) => {
      const latest_price = latestPrices.get(product.id)
      const match = matches.find(
        (candidate) => candidate.supplier_product_id === product.id
      )

      return {
        ...product,
        supplier: suppliers.find((supplier) => supplier.id === product.supplier_id),
        latest_price,
        canonical_match: match,
      }
    }),
  })
}
