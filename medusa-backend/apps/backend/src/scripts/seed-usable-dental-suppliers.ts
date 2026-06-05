import { readFileSync } from "fs"
import type { MedusaContainer } from "@medusajs/framework"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import type { UsableSupplierCatalogSource } from "../ingestion/supplier-vetting"

const defaultInputPath = "./data/supplier-vetting/usable-catalog-sources.json"

export default async function seedUsableDentalSuppliers({
  container,
}: {
  container: MedusaContainer
}) {
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const inputPath =
    [...process.argv].reverse().find((arg) => arg.endsWith(".json")) ??
    defaultInputPath
  const candidates = JSON.parse(
    readFileSync(inputPath, "utf8")
  ) as UsableSupplierCatalogSource[]

  const [existingSuppliers, existingSources] = await Promise.all([
    medmkp.listSuppliers(),
    medmkp.listSupplierCatalogSources(),
  ])

  const supplierIdsToDelete = existingSuppliers
    .filter((supplier) =>
      candidates.some((candidate) => candidate.supplier_id === supplier.id)
    )
    .map((supplier) => supplier.id)
  const sourceIdsToDelete = existingSources
    .filter((source) =>
      candidates.some(
        (candidate) =>
          candidate.supplier_id === source.supplier_id &&
          candidate.source_catalog === source.source_catalog
      )
    )
    .map((source) => source.id)

  if (sourceIdsToDelete.length) {
    await medmkp.deleteSupplierCatalogSources(sourceIdsToDelete)
  }
  if (supplierIdsToDelete.length) {
    await medmkp.deleteSuppliers(supplierIdsToDelete)
  }

  const now = new Date().toISOString()

  if (candidates.length) {
    await medmkp.createSuppliers(
      candidates.map((candidate) => ({
        id: candidate.supplier_id,
        name: candidate.supplier_name,
        slug: candidate.slug,
        website_url: candidate.website_url,
        support_email: "",
        onboarding_status: "in_review" as const,
        ein_last_four: "",
        certification_summary: `Usable dental supplier lead from research CSV. ${candidate.notes}`,
        default_lead_time_days: 0,
        ach_enabled: false,
      }))
    )

    await medmkp.createSupplierCatalogSources(
      candidates.map((candidate) => ({
        id: `mscs_${candidate.slug.replace(/-/g, "_")}`,
        supplier_id: candidate.supplier_id,
        source_type: candidate.source_type,
        source_catalog: candidate.source_catalog,
        source_url: candidate.source_url,
        auth_required: false,
        refresh_frequency: "manual" as const,
        last_crawled_at: now,
        status: "active" as const,
        notes: `Seeded from vetted supplier CSV. Source company row: ${candidate.source_company_name}.`,
      }))
    )
  }

  console.log(
    JSON.stringify(
      {
        seeded_suppliers: candidates.length,
        input_path: inputPath,
      },
      null,
      2
    )
  )
}
