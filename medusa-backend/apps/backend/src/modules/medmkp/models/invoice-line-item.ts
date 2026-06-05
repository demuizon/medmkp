import { model } from "@medusajs/framework/utils"

const InvoiceLineItem = model.define("medmkp_invoice_line_item", {
  id: model.id({ prefix: "mili" }).primaryKey(),
  invoice_id: model.text().searchable(),
  practice_id: model.text().searchable(),
  canonical_product_id: model.text().searchable(),
  match_status: model.enum([
    "exact",
    "variant",
    "substitute",
    "needs_review",
    "unmatched",
  ]),
  raw_description: model.text().searchable(),
  supplier_sku: model.text().searchable(),
  manufacturer_sku: model.text().searchable(),
  brand: model.text().searchable(),
  category: model.text().searchable(),
  quantity: model.number(),
  unit_of_measure: model.text(),
  pack_size: model.text(),
  unit_price_cents: model.number(),
  extended_price_cents: model.number(),
  normalized_unit_price_cents: model.number(),
  confidence_score: model.number(),
})

export default InvoiceLineItem
