import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [invoices, lineItems, practices] = await Promise.all([
    medmkp.listInvoices(),
    medmkp.listInvoiceLineItems(),
    medmkp.listDentalPractices(),
  ])

  res.json({
    invoices: invoices.map((invoice) => ({
      ...invoice,
      practice: practices.find((practice) => practice.id === invoice.practice_id),
      line_items: lineItems.filter((item) => item.invoice_id === invoice.id),
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const body = (req.body ?? {}) as {
    practice_id?: string
    practice_name?: string
    primary_contact_email?: string
    vendor_name?: string
    invoice_number?: string
    invoice_date?: string
    source_file_name?: string
    source_file_url?: string
    total_cents?: number
    notes?: string
  }

  let practiceId = body.practice_id

  if (!practiceId) {
    const practice = await medmkp.createDentalPractices({
      id: `mdp_demo_${Date.now()}`,
      name: body.practice_name ?? "New dental practice",
      primary_contact_name: "",
      primary_contact_email: body.primary_contact_email ?? "buyer@example.com",
      phone: "",
      website_url: "",
      address_text: "",
      practice_management_system: "",
      status: "lead",
    })
    practiceId = practice.id
  }

  const invoice = await medmkp.createInvoices({
    id: `minv_demo_${Date.now()}`,
    practice_id: practiceId,
    vendor_name: body.vendor_name ?? "Current dental supplier",
    invoice_number: body.invoice_number ?? "",
    invoice_date: body.invoice_date ?? "",
    source_file_name: body.source_file_name ?? "uploaded-invoice.pdf",
    source_file_url: body.source_file_url ?? "",
    extraction_status: "uploaded",
    subtotal_cents: body.total_cents ?? 0,
    shipping_cents: 0,
    tax_cents: 0,
    total_cents: body.total_cents ?? 0,
    notes: body.notes ?? "Pending invoice extraction.",
  })

  res.status(202).json({ invoice })
}
