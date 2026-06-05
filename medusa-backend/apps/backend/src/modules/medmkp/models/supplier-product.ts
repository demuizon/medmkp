import { model } from "@medusajs/framework/utils"

const SupplierProduct = model.define("medmkp_supplier_product", {
  id: model.id({ prefix: "msp" }).primaryKey(),
  supplier_id: model.text().searchable(),
  source_catalog: model.text().searchable(),
  source_page: model.number(),
  source_section: model.text().searchable(),
  source_group_name: model.text().searchable(),
  source_variant: model.text().searchable(),
  product_url: model.text(),
  sku: model.text().searchable(),
  manufacturer_sku: model.text().searchable(),
  brand: model.text().searchable(),
  name: model.text().searchable(),
  description: model.text().searchable(),
  category: model.text().searchable(),
  subcategory: model.text().searchable(),
  product_line: model.text().searchable(),
  pack_size: model.text(),
  unit_of_measure: model.text(),
  features_text: model.text(),
  raw_text: model.text(),
})

export default SupplierProduct
