import integratedMedicalCatalog from "./supplier-catalogs/integrated-medical-catalog.json"
import { medmkpCanonicalProducts } from "./medmkp-fixtures"

const INTEGRATED_MEDICAL_SUPPLIER_ID = "msup_integrated_medical"
const SOURCE_CATALOG = "integratedmedical_catalog.pdf"

type SourceGroup = {
  page?: number
  section?: string
  name?: string
  variant?: string | null
  features?: string[]
  products?: {
    sku?: string
    description?: string
  }[]
}

type MatchRule = {
  category: string
  keywords: string[]
  reason: string
  confidence: number
  status: "exact" | "variant" | "substitute" | "needs_review"
}

const matchRules: MatchRule[] = [
  {
    category: "Therapy bands",
    keywords: ["exercise band", "exercise bands", "exercise tubing", "band loop", "resistance band"],
    reason: "Band/tubing category or description",
    confidence: 92,
    status: "variant",
  },
  {
    category: "Tape",
    keywords: ["kinesiology", "taping", "athletic tape", "strapping tape"],
    reason: "Tape category or description",
    confidence: 91,
    status: "variant",
  },
  {
    category: "Electrodes",
    keywords: ["electrode", "electrodes", "iontophoresis"],
    reason: "Electrode category or description",
    confidence: 94,
    status: "variant",
  },
  {
    category: "Table paper",
    keywords: ["table paper", "exam table paper", "treatment table paper"],
    reason: "Table paper category or description",
    confidence: 95,
    status: "variant",
  },
  {
    category: "Gloves",
    keywords: ["glove", "gloves", "nitrile", "latex exam"],
    reason: "Glove category or description",
    confidence: 90,
    status: "variant",
  },
  {
    category: "Disinfectant wipes",
    keywords: ["disinfectant wipe", "disinfecting wipe", "wipes", "sani-cloth"],
    reason: "Disinfectant wipe category or description",
    confidence: 90,
    status: "variant",
  },
  {
    category: "Hot/cold packs",
    keywords: ["hot and cold", "cold therapy", "heat therapy", "corpak", "elasto-gel", "hot/cold", "cold pack", "hot pack"],
    reason: "Hot/cold therapy category or description",
    confidence: 86,
    status: "substitute",
  },
  {
    category: "Face cradle covers",
    keywords: ["face cradle", "headrest cover", "head rest cover"],
    reason: "Face cradle cover category or description",
    confidence: 88,
    status: "variant",
  },
  {
    category: "Towels",
    keywords: ["towel", "towels"],
    reason: "Towel category or description",
    confidence: 88,
    status: "variant",
  },
  {
    category: "Foam rollers",
    keywords: ["foam roller", "foam rollers"],
    reason: "Foam roller category or description",
    confidence: 93,
    status: "variant",
  },
]

const canonicalProductsByCategory = new Map(
  medmkpCanonicalProducts.map((product) => [product.category, product])
)

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

function truncate(value: string, maxLength = 96) {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function compactText(parts: unknown[]) {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" ")
}

function productName(group: SourceGroup, product: { description?: string }) {
  const groupName = group.name || ""
  const description = product.description || ""

  if (!groupName || groupName.toLowerCase() === "general product") {
    return description || groupName || "Supplier product"
  }

  if (!description || groupName.toLowerCase().includes(description.toLowerCase())) {
    return groupName
  }

  return `${groupName} - ${description}`
}

function matchCanonicalProduct(group: SourceGroup, product: { description?: string }) {
  const haystack = compactText([
    group.section,
    group.name,
    group.variant,
    product.description,
    ...(group.features || []),
  ]).toLowerCase()

  const rule = matchRules.find((candidate) => {
    return candidate.keywords.some((keyword) => haystack.includes(keyword))
  })

  if (!rule) {
    return {
      canonicalProductId: "",
      status: "unmatched" as const,
      confidence: 0,
      reason: "No deterministic canonical match rule fired",
    }
  }

  const canonicalProduct = canonicalProductsByCategory.get(rule.category)

  return {
    canonicalProductId: canonicalProduct ? `mcp_${slug(canonicalProduct.handle)}` : "",
    status: rule.status,
    confidence: rule.confidence,
    reason: rule.reason,
  }
}

export const medmkpSeedCanonicalProducts = medmkpCanonicalProducts.map((product) => ({
  id: `mcp_${slug(product.handle)}`,
  handle: product.handle,
  name: product.title,
  category: product.category,
  description: product.description,
  unit_of_measure: product.unit,
  attributes_text: JSON.stringify({
    category: product.category,
    subtitle: product.subtitle,
  }),
}))

export function buildIntegratedMedicalSupplierCatalogSeed() {
  const groups = (integratedMedicalCatalog.groups || []) as SourceGroup[]
  const supplierProducts: unknown[] = []
  const canonicalProductMatches: unknown[] = []

  groups.forEach((group, groupIndex) => {
    ;(group.products || []).forEach((product, productIndex) => {
      const sku = product.sku || `NO-SKU-${groupIndex}-${productIndex}`
      const supplierProductId = `msp_im_${truncate(slug(`${sku}_${groupIndex}_${productIndex}`), 86)}`
      const name = productName(group, product)
      const description = product.description || name
      const featuresText = (group.features || []).join(" | ")
      const rawText = JSON.stringify({
        page: group.page || 0,
        section: group.section || "",
        name: group.name || "",
        variant: group.variant || "",
        sku,
        description,
        features: group.features || [],
      })
      const match = matchCanonicalProduct(group, product)

      supplierProducts.push({
        id: supplierProductId,
        supplier_id: INTEGRATED_MEDICAL_SUPPLIER_ID,
        source_catalog: SOURCE_CATALOG,
        source_page: group.page || 0,
        source_section: group.section || "",
        source_group_name: group.name || "",
        source_variant: group.variant || "",
        product_url: "",
        sku,
        manufacturer_sku: "",
        brand: "",
        name,
        description,
        category: "Clinical supplies",
        subcategory: group.section || "",
        product_line: group.name || "",
        pack_size: group.variant || "",
        unit_of_measure: "",
        features_text: featuresText,
        raw_text: rawText,
      })

      canonicalProductMatches.push({
        id: `mcpm_im_${truncate(slug(`${sku}_${groupIndex}_${productIndex}`), 85)}`,
        canonical_product_id: match.canonicalProductId,
        supplier_product_id: supplierProductId,
        supplier_id: INTEGRATED_MEDICAL_SUPPLIER_ID,
        match_status: match.status,
        confidence_score: match.confidence,
        match_reason: match.reason,
        extracted_attributes_text: JSON.stringify({
          source_section: group.section || "",
          source_group_name: group.name || "",
          source_variant: group.variant || "",
          features: group.features || [],
        }),
      })
    })
  })

  return {
    supplierProducts,
    canonicalProductMatches,
  }
}
