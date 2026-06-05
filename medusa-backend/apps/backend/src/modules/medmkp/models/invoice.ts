import { model } from "@medusajs/framework/utils"

const Invoice = model.define("medmkp_invoice", {
  id: model.id({ prefix: "minv" }).primaryKey(),
  practice_id: model.text().searchable(),
  vendor_name: model.text().searchable(),
  invoice_number: model.text().searchable(),
  invoice_date: model.text(),
  source_file_name: model.text(),
  source_file_url: model.text(),
  extraction_status: model.enum([
    "uploaded",
    "extracting",
    "needs_review",
    "normalized",
    "failed",
  ]),
  subtotal_cents: model.number(),
  shipping_cents: model.number(),
  tax_cents: model.number(),
  total_cents: model.number(),
  notes: model.text(),
})

export default Invoice
