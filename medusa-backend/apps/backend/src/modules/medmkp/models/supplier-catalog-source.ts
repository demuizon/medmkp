import { model } from "@medusajs/framework/utils"

const SupplierCatalogSource = model.define("medmkp_supplier_catalog_source", {
  id: model.id({ prefix: "mscs" }).primaryKey(),
  supplier_id: model.text().searchable(),
  source_type: model.enum(["website", "pdf", "csv", "manual", "api", "email", "agent"]),
  source_catalog: model.text().searchable(),
  source_url: model.text(),
  auth_required: model.boolean(),
  refresh_frequency: model.enum(["weekly", "monthly", "quarterly", "manual"]),
  last_crawled_at: model.text(),
  status: model.enum(["active", "stale", "failed", "paused"]),
  notes: model.text(),
})

export default SupplierCatalogSource
