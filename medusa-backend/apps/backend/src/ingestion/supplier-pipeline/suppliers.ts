import { readFileSync } from "fs"
import { parseCsv } from "../csv"
import type { SupplierSeedRow } from "./types"

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function normalizeSiteUrl(value: string) {
  const trimmed = value.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  const parsed = new URL(withProtocol)

  return {
    origin: parsed.origin,
    href: parsed.href,
    domain: parsed.hostname.replace(/^www\./, ""),
  }
}

export function supplierRowsFromCsv(csvPath: string) {
  const rows = parseCsv(readFileSync(csvPath, "utf8"))
  const headers = rows[0].map((header) => header.trim().toLowerCase())

  return rows
    .slice(1)
    .map((cells): SupplierSeedRow => {
      const record = headers.reduce((acc, header, index) => {
        acc[header] = cells[index]?.trim() ?? ""
        return acc
      }, {} as Record<string, string>)

      return {
        distributor: record.distributor ?? "",
        website_url: record.size ?? record.website_url ?? record.url ?? "",
        prices: record["prices?"] ?? record.prices ?? "",
      }
    })
    .filter((row) => row.distributor && row.website_url)
}

export function filterSuppliers(
  suppliers: SupplierSeedRow[],
  supplierName?: string
) {
  const normalized = supplierName?.trim().toLowerCase()

  if (!normalized) {
    return suppliers
  }

  return suppliers.filter(
    (supplier) => supplier.distributor.toLowerCase() === normalized
  )
}
