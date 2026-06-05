import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [
    reports,
    opportunities,
    invoices,
    practices,
    suppliers,
    supplierProducts,
  ] = await Promise.all([
    medmkp.listSavingsReports(),
    medmkp.listSavingsOpportunities(),
    medmkp.listInvoices(),
    medmkp.listDentalPractices(),
    medmkp.listSuppliers(),
    medmkp.listSupplierProducts(),
  ])

  res.json({
    reports: reports.map((report) => ({
      ...report,
      invoice: invoices.find((invoice) => invoice.id === report.invoice_id),
      practice: practices.find((practice) => practice.id === report.practice_id),
      opportunities: opportunities.filter(
        (opportunity) =>
          opportunity.practice_id === report.practice_id &&
          opportunity.invoice_id === report.invoice_id
      ),
    })),
    opportunities: opportunities.map((opportunity) => ({
      ...opportunity,
      supplier: suppliers.find(
        (supplier) => supplier.id === opportunity.recommended_supplier_id
      ),
      supplier_product: supplierProducts.find(
        (product) => product.id === opportunity.recommended_supplier_product_id
      ),
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const body = (req.body ?? {}) as {
    practice_id?: string
    invoice_id?: string
    current_spend_cents?: number
    estimated_monthly_savings_cents?: number
    opportunity_count?: number
    summary?: string
  }

  const monthlySavings = body.estimated_monthly_savings_cents ?? 0
  const report = await medmkp.createSavingsReports({
    id: `msr_demo_${Date.now()}`,
    practice_id: body.practice_id ?? "",
    invoice_id: body.invoice_id ?? "",
    status: "draft",
    reporting_period: "current",
    current_spend_cents: body.current_spend_cents ?? 0,
    estimated_monthly_savings_cents: monthlySavings,
    estimated_annual_savings_cents: monthlySavings * 12,
    opportunity_count: body.opportunity_count ?? 0,
    summary:
      body.summary ??
      "Draft savings report created. Add invoice line items and benchmark matches to finalize recommendations.",
  })

  res.status(202).json({ report })
}
