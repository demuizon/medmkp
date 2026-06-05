import { model } from "@medusajs/framework/utils"

const PracticeSubscription = model.define("medmkp_practice_subscription", {
  id: model.id({ prefix: "mps" }).primaryKey(),
  practice_id: model.text().searchable(),
  plan: model.enum(["starter", "growth", "concierge"]),
  status: model.enum(["trialing", "active", "past_due", "canceled"]),
  monthly_fee_cents: model.number(),
  started_at: model.text(),
  renews_at: model.text(),
  stripe_customer_id: model.text(),
  stripe_subscription_id: model.text(),
})

export default PracticeSubscription
