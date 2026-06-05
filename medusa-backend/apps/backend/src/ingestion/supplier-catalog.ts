type MatchStatus = "exact" | "variant" | "substitute" | "needs_review" | "unmatched"
type SourceType = "website" | "pdf" | "csv" | "manual" | "api" | "email" | "agent"
type RefreshFrequency = "weekly" | "monthly" | "quarterly" | "manual"
type PriceBasis = "each" | "box" | "case" | "pack" | "unknown"
type Availability = "in_stock" | "limited" | "backordered" | "unknown"

export type CanonicalProductCandidate = {
  id: string
  name: string
  category: string
  attributes_text?: string
}

export type SupplierCatalogRow = {
  sku?: string
  manufacturer_sku?: string
  brand?: string
  name?: string
  description?: string
  category?: string
  subcategory?: string
  product_line?: string
  product_url?: string
  pack_size?: string
  unit_of_measure?: string
  price_cents?: number
  price_basis?: PriceBasis
  availability?: Availability
  min_quantity?: number
  raw?: unknown
}

export type SupplierCatalogIngestionInput = {
  supplier_id: string
  source_type: SourceType
  source_url?: string
  source_catalog: string
  source_section?: string
  auth_required?: boolean
  refresh_frequency?: RefreshFrequency
  captured_at?: string
  rows: SupplierCatalogRow[]
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

function compact(parts: unknown[]) {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" ")
}

function boundedId(prefix: string, parts: string[], maxLength = 96) {
  const base = slug(parts.filter(Boolean).join("_")) || "unknown"
  return `${prefix}_${base}`.slice(0, maxLength)
}

function normalizePriceBasis(value?: PriceBasis): PriceBasis {
  return value ?? "unknown"
}

function normalizeAvailability(value?: Availability): Availability {
  return value ?? "unknown"
}

function scoreCanonicalMatch(
  row: SupplierCatalogRow,
  canonicalProducts: CanonicalProductCandidate[]
) {
  const haystack = compact([
    row.manufacturer_sku,
    row.brand,
    row.name,
    row.description,
    row.category,
    row.subcategory,
    row.product_line,
    row.pack_size,
  ]).toLowerCase()

  let best:
    | {
        canonicalProductId: string
        status: MatchStatus
        confidence: number
        reason: string
      }
    | undefined

  canonicalProducts.forEach((product) => {
    const category = product.category.toLowerCase()
    const nameTokens = product.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3)
    const categoryHit = category && haystack.includes(category)
    const tokenHits = nameTokens.filter((token) => haystack.includes(token)).length
    const tokenScore = nameTokens.length ? Math.round((tokenHits / nameTokens.length) * 70) : 0
    const score = (categoryHit ? 25 : 0) + tokenScore

    if (!best || score > best.confidence) {
      best = {
        canonicalProductId: product.id,
        status: score >= 80 ? "exact" : score >= 55 ? "variant" : score >= 35 ? "needs_review" : "unmatched",
        confidence: score,
        reason:
          score > 0
            ? "Deterministic text overlap against canonical product name/category"
            : "No deterministic canonical match rule fired",
      }
    }
  })

  if (!best || best.confidence < 35) {
    return {
      canonicalProductId: "",
      status: "unmatched" as const,
      confidence: 0,
      reason: "No deterministic canonical match rule fired",
    }
  }

  return best
}

export function buildSupplierCatalogIngestion(
  input: SupplierCatalogIngestionInput,
  canonicalProducts: CanonicalProductCandidate[]
) {
  const capturedAt = input.captured_at ?? new Date().toISOString()
  const sourceId = boundedId("mscs", [input.supplier_id, input.source_catalog], 96)

  const source = {
    id: sourceId,
    supplier_id: input.supplier_id,
    source_type: input.source_type,
    source_catalog: input.source_catalog,
    source_url: input.source_url ?? "",
    auth_required: input.auth_required ?? false,
    refresh_frequency: input.refresh_frequency ?? "manual",
    last_crawled_at: capturedAt,
    status: "active" as const,
    notes: `Imported ${input.rows.length} catalog rows into cached supplier products.`,
  }

  const supplierProducts: unknown[] = []
  const canonicalProductMatches: unknown[] = []
  const priceSnapshots: unknown[] = []

  input.rows.forEach((row, index) => {
    const sku = row.sku?.trim() || row.manufacturer_sku?.trim() || `NO-SKU-${index + 1}`
    const supplierProductId = boundedId("msp", [input.supplier_id, input.source_catalog, sku, String(index)], 96)
    const name = row.name?.trim() || row.description?.trim() || sku
    const description = row.description?.trim() || name
    const category = row.category?.trim() || "Dental supplies"
    const match = scoreCanonicalMatch(row, canonicalProducts)

    supplierProducts.push({
      id: supplierProductId,
      supplier_id: input.supplier_id,
      source_catalog: input.source_catalog,
      source_page: 0,
      source_section: input.source_section ?? "",
      source_group_name: row.product_line ?? "",
      source_variant: row.pack_size ?? "",
      product_url: row.product_url ?? "",
      sku,
      manufacturer_sku: row.manufacturer_sku ?? "",
      brand: row.brand ?? "",
      name,
      description,
      category,
      subcategory: row.subcategory ?? "",
      product_line: row.product_line ?? "",
      pack_size: row.pack_size ?? "",
      unit_of_measure: row.unit_of_measure ?? "",
      features_text: compact([row.brand, row.pack_size, row.unit_of_measure]),
      raw_text: JSON.stringify(row.raw ?? row),
    })

    canonicalProductMatches.push({
      id: boundedId("mcpm", [input.supplier_id, input.source_catalog, sku, String(index)], 96),
      canonical_product_id: match.canonicalProductId,
      supplier_product_id: supplierProductId,
      supplier_id: input.supplier_id,
      match_status: match.status,
      confidence_score: match.confidence,
      match_reason: match.reason,
      extracted_attributes_text: JSON.stringify({
        sku,
        manufacturer_sku: row.manufacturer_sku ?? "",
        brand: row.brand ?? "",
        category,
        subcategory: row.subcategory ?? "",
        pack_size: row.pack_size ?? "",
        unit_of_measure: row.unit_of_measure ?? "",
      }),
    })

    if (typeof row.price_cents === "number" && row.price_cents >= 0) {
      priceSnapshots.push({
        id: boundedId("msps", [input.supplier_id, input.source_catalog, sku, capturedAt, String(index)], 96),
        supplier_product_id: supplierProductId,
        supplier_id: input.supplier_id,
        price_cents: row.price_cents,
        price_basis: normalizePriceBasis(row.price_basis),
        min_quantity: row.min_quantity ?? 1,
        availability: normalizeAvailability(row.availability),
        captured_at: capturedAt,
        source_url: row.product_url ?? input.source_url ?? "",
        confidence_score: row.product_url || input.source_url ? 85 : 65,
      })
    }
  })

  return {
    source,
    supplierProducts,
    canonicalProductMatches,
    priceSnapshots,
  }
}
