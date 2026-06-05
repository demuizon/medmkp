import { genericAdapter } from "./generic"
import { pearsonAdapter } from "./pearson"
import type {
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

const adapters: SupplierProductAdapter[] = [pearsonAdapter, genericAdapter]

export function adapterForCandidate(candidate: ProductPageCandidate) {
  return adapters.find((adapter) => adapter.matches(candidate)) ?? genericAdapter
}
