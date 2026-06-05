import { model } from "@medusajs/framework/utils"

const SavingsOpportunity = model.define("medmkp_savings_opportunity", {
  id: model.id({ prefix: "mso" }).primaryKey(),
  practice_id: model.text().searchable(),
  invoice_id: model.text().searchable(),
  invoice_line_item_id: model.text().searchable(),
  canonical_product_id: model.text().searchable(),
  recommended_supplier_id: model.text().searchable(),
  recommended_supplier_product_id: model.text().searchable(),
  type: model.enum([
    "exact_match_cheaper",
    "equivalent_substitute",
    "bulk_purchase",
    "vendor_negotiation",
    "contract_pricing",
    "reorder_consolidation",
  ]),
  status: model.enum(["new", "reviewing", "recommended", "accepted", "ignored"]),
  current_unit_price_cents: model.number(),
  recommended_unit_price_cents: model.number(),
  estimated_monthly_savings_cents: model.number(),
  estimated_annual_savings_cents: model.number(),
  confidence_score: model.number(),
  explanation: model.text(),
  evidence_url: model.text(),
})

export default SavingsOpportunity
