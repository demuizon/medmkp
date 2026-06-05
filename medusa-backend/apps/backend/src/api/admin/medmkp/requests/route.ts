import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import {
  medmkpCatalogItems,
  medmkpQuotes,
  medmkpRequests,
} from "../../../../seed/medmkp-fixtures"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [dbRequests, dbItems, dbQuotes] = await Promise.all([
    medmkp.listProcurementRequests(),
    medmkp.listCatalogItems(),
    medmkp.listQuotes(),
  ])
  const requests = dbRequests.length ? dbRequests : medmkpRequests
  const catalogItems = dbItems.length ? dbItems : medmkpCatalogItems
  const quotes = dbQuotes.length ? dbQuotes : medmkpQuotes

  res.json({
    requests: requests.map((request) => ({
      ...request,
      recommended_items: catalogItems.slice(0, 3),
      quotes: quotes.filter(
        (quote) => quote.procurement_request_id === request.id
      ),
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const body = (req.body ?? {}) as {
    buyer_name?: string
    buyer_email?: string
    source_file_name?: string
    notes?: string
  }
  const request = await medmkp.createProcurementRequests({
    id: `mpr_demo_${Date.now()}`,
    buyer_name: body.buyer_name ?? "New dental practice",
    buyer_facility_type: "dental",
    buyer_email: body.buyer_email ?? "buyer@example.com",
    status: "uploaded",
    source_file_name: body.source_file_name ?? "uploaded-invoice.pdf",
    item_count: 0,
    target_savings_percent: 10,
    notes: body.notes ?? "Pending invoice analysis.",
  })

  res.status(202).json({
    request,
  })
}
