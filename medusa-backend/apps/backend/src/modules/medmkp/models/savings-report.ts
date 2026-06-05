import { model } from "@medusajs/framework/utils"

const SavingsReport = model.define("medmkp_savings_report", {
  id: model.id({ prefix: "msr" }).primaryKey(),
  practice_id: model.text().searchable(),
  invoice_id: model.text().searchable(),
  status: model.enum(["draft", "ready", "sent", "archived"]),
  reporting_period: model.text(),
  current_spend_cents: model.number(),
  estimated_monthly_savings_cents: model.number(),
  estimated_annual_savings_cents: model.number(),
  opportunity_count: model.number(),
  summary: model.text(),
})

export default SavingsReport
