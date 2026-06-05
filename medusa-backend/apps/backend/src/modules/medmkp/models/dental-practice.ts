import { model } from "@medusajs/framework/utils"

const DentalPractice = model.define("medmkp_dental_practice", {
  id: model.id({ prefix: "mdp" }).primaryKey(),
  name: model.text().searchable(),
  primary_contact_name: model.text().searchable(),
  primary_contact_email: model.text(),
  phone: model.text(),
  website_url: model.text(),
  address_text: model.text(),
  practice_management_system: model.text(),
  status: model.enum(["lead", "active", "paused", "churned"]),
})

export default DentalPractice
