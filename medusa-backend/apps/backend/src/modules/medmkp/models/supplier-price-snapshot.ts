import { model } from "@medusajs/framework/utils"

const SupplierPriceSnapshot = model.define("medmkp_supplier_price_snapshot", {
  id: model.id({ prefix: "msps" }).primaryKey(),
  supplier_product_id: model.text().searchable(),
  supplier_id: model.text().searchable(),
  price_cents: model.number(),
  price_basis: model.enum(["each", "box", "case", "pack", "unknown"]),
  min_quantity: model.number(),
  availability: model.enum(["in_stock", "limited", "backordered", "unknown"]),
  captured_at: model.text(),
  source_url: model.text(),
  confidence_score: model.number(),
})

export default SupplierPriceSnapshot
