import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"
import { parseCsv } from "./csv"

type SupplierCsvRow = {
  company_name: string
  website_url: string
  naics_description: string
}

type SupplierClassification =
  | "catalog_candidate"
  | "possible_supplier"
  | "manufacturer"
  | "dental_lab"
  | "clinic_or_practice"
  | "directory_or_placeholder"
  | "missing_url"
  | "needs_review"

export type VettedSupplierLead = {
  company_name: string
  website_url: string
  normalized_domain: string
  naics_description: string
  classification: SupplierClassification
  confidence_score: number
  reasons: string[]
}

export type UsableSupplierCatalogSource = {
  supplier_id: string
  supplier_name: string
  slug: string
  website_url: string
  source_catalog: string
  source_type: "website"
  source_url: string
  classification: SupplierClassification
  confidence_score: number
  source_company_name: string
  notes: string
}

const directoryHosts = [
  "business.site",
  "hub.biz",
  "tripod.com",
  "wordpress.com",
  "webs.com",
  "mfgpages.com",
  "ypeek.com",
  "getbeauty-gethealth.com",
  "wbu.com",
]

const knownCatalogDomains = [
  "benco.com",
  "burkhartdental.com",
  "crazydentalprices.com",
  "darby.com",
  "dentalcity.com",
  "dentalplanet.com",
  "henryschein.com",
  "net32.com",
  "pattersondental.com",
  "safcodental.com",
  "scottsdental.com",
  "usdentaldepot.com",
]

const catalogKeywords = [
  "supply",
  "supplies",
  "supplier",
  "store",
  "shop",
  "direct",
  "depot",
  "wholesale",
  "distributor",
  "equipment",
  "products",
  "catalog",
  "online",
]

const domainCatalogKeywords = [
  "supply",
  "supplies",
  "supplier",
  "shop",
  "store",
  "direct",
  "depot",
  "wholesale",
  "catalog",
  "online",
  "products",
]

const manufacturerKeywords = [
  "manufacturing",
  "manufacturer",
  "technologies",
  "technology",
  "systems",
  "instruments",
  "products",
  "pharmaceutical",
  "pharma",
  "materials",
]

const labKeywords = [
  "lab",
  "laboratory",
  "milling",
  "crown",
  "bridge",
  "denture",
  "orthodontic lab",
  "ceramics",
]

const clinicKeywords = [
  "dds",
  "dmd",
  "dental p.c",
  "dental pc",
  "dentist",
  "smile",
  "smiles",
  "orthodontics",
  "periodontics",
  "endodontics",
  "implant center",
  "dental arts",
  "dental studio",
]

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return { url: "", domain: "" }
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const url = new URL(withProtocol)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    return {
      url: `https://${hostname}${url.pathname === "/" ? "" : url.pathname}`,
      domain: hostname,
    }
  } catch {
    return {
      url: trimmed,
      domain: trimmed.toLowerCase().replace(/^www\./, ""),
    }
  }
}

function includesAny(haystack: string, needles: string[]) {
  return needles.filter((needle) => haystack.includes(needle))
}

function classify(row: SupplierCsvRow): VettedSupplierLead {
  const normalized = normalizeUrl(row.website_url)
  const haystack = [
    row.company_name,
    row.website_url,
    row.naics_description,
    normalized.domain,
  ]
    .join(" ")
    .toLowerCase()
  const domainHaystack = [normalized.domain, row.website_url]
    .join(" ")
    .toLowerCase()
  const reasons: string[] = []

  if (!normalized.domain) {
    return {
      ...row,
      website_url: "",
      normalized_domain: "",
      classification: "missing_url",
      confidence_score: 100,
      reasons: ["Missing website URL"],
    }
  }

  const directoryHits = directoryHosts.filter((host) =>
    normalized.domain.endsWith(host)
  )
  const knownCatalogHit = knownCatalogDomains.find((domain) =>
    normalized.domain.endsWith(domain)
  )
  const catalogHits = includesAny(haystack, catalogKeywords)
  const domainCatalogHits = includesAny(domainHaystack, domainCatalogKeywords)
  const labHits = includesAny(haystack, labKeywords)
  const domainLabHits = includesAny(domainHaystack, labKeywords)
  const clinicHits = includesAny(haystack, clinicKeywords)
  const domainClinicHits = includesAny(domainHaystack, clinicKeywords)
  const manufacturerHits = includesAny(haystack, manufacturerKeywords)
  const domainManufacturerHits = includesAny(domainHaystack, manufacturerKeywords)

  if (knownCatalogHit) {
    reasons.push(`Known dental catalog/distributor domain: ${knownCatalogHit}`)
  }
  if (catalogHits.length) {
    reasons.push(`Catalog signal: ${catalogHits.slice(0, 3).join(", ")}`)
  }
  if (domainCatalogHits.length) {
    reasons.push(`Domain catalog signal: ${domainCatalogHits.slice(0, 3).join(", ")}`)
  }
  if (manufacturerHits.length) {
    reasons.push(`Manufacturer signal: ${manufacturerHits.slice(0, 3).join(", ")}`)
  }
  if (domainManufacturerHits.length) {
    reasons.push(
      `Domain manufacturer signal: ${domainManufacturerHits.slice(0, 3).join(", ")}`
    )
  }
  if (domainLabHits.length || labHits.length) {
    reasons.push(
      `Lab signal: ${(domainLabHits.length ? domainLabHits : labHits)
        .slice(0, 3)
        .join(", ")}`
    )
  }
  if (domainClinicHits.length || clinicHits.length) {
    reasons.push(
      `Clinic/practice signal: ${(domainClinicHits.length ? domainClinicHits : clinicHits)
        .slice(0, 3)
        .join(", ")}`
    )
  }
  if (directoryHits.length) {
    reasons.push(`Directory or placeholder host: ${directoryHits[0]}`)
  }

  if (directoryHits.length) {
    return {
      ...row,
      website_url: normalized.url,
      normalized_domain: normalized.domain,
      classification: "directory_or_placeholder",
      confidence_score: 90,
      reasons,
    }
  }

  if (domainLabHits.length && !knownCatalogHit && domainCatalogHits.length < 2) {
    return {
      ...row,
      website_url: normalized.url,
      normalized_domain: normalized.domain,
      classification: "dental_lab",
      confidence_score: 82,
      reasons,
    }
  }

  if (domainClinicHits.length && !knownCatalogHit && domainCatalogHits.length < 2) {
    return {
      ...row,
      website_url: normalized.url,
      normalized_domain: normalized.domain,
      classification: "clinic_or_practice",
      confidence_score: 78,
      reasons,
    }
  }

  if (knownCatalogHit || domainCatalogHits.length >= 2) {
    return {
      ...row,
      website_url: normalized.url,
      normalized_domain: normalized.domain,
      classification: "catalog_candidate",
      confidence_score: knownCatalogHit
        ? 94
        : 72 + Math.min(domainCatalogHits.length * 4, 18),
      reasons,
    }
  }

  if (domainManufacturerHits.length >= 2) {
    return {
      ...row,
      website_url: normalized.url,
      normalized_domain: normalized.domain,
      classification: "manufacturer",
      confidence_score: 72,
      reasons,
    }
  }

  return {
    ...row,
    website_url: normalized.url,
    normalized_domain: normalized.domain,
    classification: domainCatalogHits.length ? "possible_supplier" : "needs_review",
    confidence_score: domainCatalogHits.length ? 58 : 40,
    reasons: reasons.length ? reasons : ["No strong offline signal"],
  }
}

function toCsvValue(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "")
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function toCsv(rows: VettedSupplierLead[]) {
  const headers = [
    "company_name",
    "website_url",
    "normalized_domain",
    "naics_description",
    "classification",
    "confidence_score",
    "reasons",
  ]

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => toCsvValue(row[header as keyof VettedSupplierLead]))
        .join(",")
    ),
  ].join("\n")
}

function dedupeByDomain(leads: VettedSupplierLead[]) {
  const byDomain = new Map<string, VettedSupplierLead>()

  leads.forEach((lead) => {
    const key = lead.normalized_domain || `${lead.company_name}:${lead.website_url}`
    const existing = byDomain.get(key)
    if (!existing || lead.confidence_score > existing.confidence_score) {
      byDomain.set(key, lead)
    }
  })

  return [...byDomain.values()]
}

function titleFromDomain(domain: string) {
  const labels = domain.split(".")
  const root = labels.length > 2 ? labels[labels.length - 2] : labels[0]

  const knownNames: Record<string, string> = {
    benco: "Benco Dental",
    henryschein: "Henry Schein",
    pattersondental: "Patterson Dental",
    directdenturedepot: "Direct Denture Depot",
  }

  return (
    knownNames[root] ??
    root
      .replace(/dental/g, " dental ")
      .replace(/direct/g, " direct ")
      .replace(/depot/g, " depot ")
      .replace(/supply/g, " supply ")
      .replace(/supplies/g, " supplies ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase())
  )
}

function usableSupplierSources(leads: VettedSupplierLead[]) {
  return leads
    .filter((lead) => lead.classification === "catalog_candidate")
    .sort((a, b) => b.confidence_score - a.confidence_score)
    .map((lead): UsableSupplierCatalogSource => {
      const slug = lead.normalized_domain.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

      return {
        supplier_id: `msup_${slug.replace(/-/g, "_")}`,
        supplier_name: titleFromDomain(lead.normalized_domain),
        slug,
        website_url: lead.website_url,
        source_catalog: `${slug}-website`,
        source_type: "website",
        source_url: lead.website_url,
        classification: lead.classification,
        confidence_score: lead.confidence_score,
        source_company_name: lead.company_name,
        notes: lead.reasons.join(" | "),
      }
    })
}

export function vetDentalSupplierCsv(csvPath: string) {
  const text = readFileSync(csvPath, "utf8")
  const parsedRows = parseCsv(text)
  const dataRows = parsedRows.slice(1).map((cells): SupplierCsvRow => ({
    company_name: cells[0]?.trim() ?? "",
    website_url: cells[1]?.trim() ?? "",
    naics_description: cells[2]?.trim() ?? "",
  }))

  const leads = dataRows.map(classify)
  const dedupedLeads = dedupeByDomain(leads)
  const rankedCatalogCandidates = dedupedLeads
    .filter((lead) =>
      ["catalog_candidate", "possible_supplier", "manufacturer"].includes(
        lead.classification
      )
    )
    .sort((a, b) => b.confidence_score - a.confidence_score)

  const classificationCounts = dedupedLeads.reduce(
    (acc, lead) => {
      acc[lead.classification] = (acc[lead.classification] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return {
    total_rows: dataRows.length,
    unique_leads: dedupedLeads.length,
    classification_counts: classificationCounts,
    leads: dedupedLeads,
    ranked_catalog_candidates: rankedCatalogCandidates,
    usable_catalog_sources: usableSupplierSources(dedupedLeads),
  }
}

export function writeSupplierVettingOutputs(
  csvPath: string,
  outputDir: string,
  topCandidateLimit = 250
) {
  const result = vetDentalSupplierCsv(csvPath)
  const absoluteOutputDir = resolve(outputDir)
  mkdirSync(absoluteOutputDir, { recursive: true })

  const allLeadsPath = resolve(absoluteOutputDir, "dental-supplier-leads.csv")
  const candidatesPath = resolve(
    absoluteOutputDir,
    "dental-catalog-candidates.csv"
  )
  const summaryPath = resolve(absoluteOutputDir, "summary.json")
  const usableSourcesPath = resolve(
    absoluteOutputDir,
    "usable-catalog-sources.json"
  )

  writeFileSync(allLeadsPath, toCsv(result.leads))
  writeFileSync(
    candidatesPath,
    toCsv(result.ranked_catalog_candidates.slice(0, topCandidateLimit))
  )
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        input: csvPath,
        output_dir: absoluteOutputDir,
        total_rows: result.total_rows,
        unique_leads: result.unique_leads,
        classification_counts: result.classification_counts,
        top_candidate_count: Math.min(
          result.ranked_catalog_candidates.length,
          topCandidateLimit
        ),
        usable_catalog_source_count: result.usable_catalog_sources.length,
      },
      null,
      2
    )
  )
  writeFileSync(
    usableSourcesPath,
    JSON.stringify(result.usable_catalog_sources, null, 2)
  )

  return {
    ...result,
    output_paths: {
      all_leads: allLeadsPath,
      catalog_candidates: candidatesPath,
      usable_catalog_sources: usableSourcesPath,
      summary: summaryPath,
    },
  }
}

export function defaultSupplierVettingOutputDir() {
  return resolve(dirname(__dirname), "../data/supplier-vetting")
}
