import { dentalCityAdapter } from "./dentalcity"
import { dcDentalAdapter } from "./dcdental"
import { genericAdapter } from "./generic"
import { pearsonAdapter } from "./pearson"
import { shastaAdapter } from "./shasta"
import { shopifyAdapter } from "./shopify"
import { skyDentalAdapter } from "./skydental"
import type {
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

const adapters: SupplierProductAdapter[] = [
  dcDentalAdapter,
  dentalCityAdapter,
  pearsonAdapter,
  shastaAdapter,
  shopifyAdapter,
  skyDentalAdapter,
  genericAdapter,
]

export function adapterForCandidate(candidate: ProductPageCandidate) {
  return adapters.find((adapter) => adapter.matches(candidate)) ?? genericAdapter
}
