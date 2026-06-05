# MedMKP Dental Spend Optimization Architecture

MedMKP is now a subscription SaaS for dental practices, not a transaction marketplace.
The product makes money from monthly service fees, and the buyer remains responsible
for purchasing from suppliers directly.

## Product Promise

Dental practices upload supplier invoices. MedMKP normalizes line items, compares
their current prices against cached supplier catalogs and fresh price evidence, and
produces savings opportunities the practice can act on.

```text
Invoice upload
  -> invoice extraction
  -> line-item normalization
  -> canonical product matching
  -> cached supplier catalog search
  -> price snapshot comparison
  -> savings opportunities
  -> savings report
```

## Backend Direction

Medusa remains useful as the backend shell for now, but MedMKP domain data should
live in custom modules instead of commerce primitives. The core SaaS model is:

```text
DentalPractice
PracticeSubscription
Invoice
InvoiceLineItem
Supplier
SupplierCatalogSource
SupplierProduct
CanonicalProduct
CanonicalProductMatch
SupplierPriceSnapshot
SavingsOpportunity
SavingsReport
```

Avoid coupling core savings logic to carts, checkout, orders, payouts, or supplier
commission flows unless the business model changes again.

## Catalog Strategy

Cached supplier catalogs are the source of truth for product search and benchmark
comparisons. Live agentic browsing is a refresh/enrichment tool.

```text
Supplier website / PDF / CSV / manual sheet
  -> catalog source
  -> supplier product cache
  -> append-only price snapshots
  -> canonical product matching
```

Live browsing should be triggered when:

- an invoice line item is unmatched
- cached pricing is stale
- a high-value savings opportunity needs verification
- an admin asks to refresh a supplier/product

Live browsing results should create evidence-backed proposed updates, not silently
overwrite trusted pricing.

## Supplier Catalog Ingestion

Operational catalog refresh and supplier onboarding steps live in
`SUPPLIER_INGESTION.md`.

The first ingestion surface is `POST /admin/medmkp/catalog-ingestions`. It accepts
a supplier, source metadata, and normalized product rows. The pipeline writes:

- one `SupplierCatalogSource`
- cached `SupplierProduct` rows
- deterministic `CanonicalProductMatch` rows
- append-only `SupplierPriceSnapshot` rows when a price is present

Catalog imports replace cached products and canonical matches from the same
`supplier_id` + `source_catalog`, but price snapshots remain historical evidence.

Supplier discovery starts with offline vetting, not live crawling. The supplier CSV
can be classified with:

```bash
npm run supplier:vet -- "/Users/patrice/Downloads/Med Supply URLs (Merged) - dental urls.csv"
```

This writes:

- `data/supplier-vetting/dental-supplier-leads.csv`
- `data/supplier-vetting/dental-catalog-candidates.csv`
- `data/supplier-vetting/usable-catalog-sources.json`
- `data/supplier-vetting/summary.json`

The usable subset is intentionally strict. The source CSV contains many missing
URLs and mismatched company/domain rows, so MedMKP should only promote
`catalog_candidate` domains into supplier records automatically. Those can be
seeded with:

```bash
npm run supplier:seed-usable
```

Example row shape:

```json
{
  "sku": "DC-112233",
  "manufacturer_sku": "112233",
  "brand": "Crosstex",
  "name": "Dental Bibs, 2-Ply, Blue",
  "category": "Dental disposables",
  "pack_size": "500/case",
  "unit_of_measure": "case",
  "price_cents": 1899,
  "price_basis": "case",
  "availability": "in_stock",
  "product_url": "https://supplier.example/products/DC-112233"
}
```

Normalized supplier CSVs can be imported with:

```bash
SUPPLIER_CATALOG_CSV=./data/catalog-imports/benco.csv \
SUPPLIER_ID=msup_benco_com \
SOURCE_CATALOG=benco-com-manual-csv \
SOURCE_URL=https://benco.com \
npm run supplier:import-csv
```

The template lives at
`data/catalog-imports/normalized-supplier-catalog-template.csv`.

## Canonical Matching

Supplier products should be linked to canonical products through a match table,
not a single hard foreign key. Dental products often require fuzzy and reviewable
matching.

```text
SupplierProduct
  -> CanonicalProductMatch
  -> CanonicalProduct
```

Match metadata should capture:

- match status: exact, variant, substitute, needs review, unmatched
- confidence score
- match reason
- extracted attributes

Search should generally resolve buyer queries or invoice descriptions to canonical
products first, then rank matched supplier products by price, freshness, confidence,
and substitution policy.

## Report-Centric Workflow

The quote page should evolve into a savings report, not checkout approval.

```text
SavingsOpportunity
  -> SavingsReport
  -> buyer action outside MedMKP
```

Useful buyer actions:

- download negotiation sheet
- mark opportunity accepted or ignored
- request MedMKP to gather fresher supplier evidence
- add item to reorder watchlist
