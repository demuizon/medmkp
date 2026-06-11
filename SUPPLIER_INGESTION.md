# Supplier Catalog Ingestion Runbook

This document explains how MedMKP refreshes supplier product catalogs and how to
add new suppliers to the ingestion system.

## Source Of Truth

`medmkp_supplier` is the runtime source of truth for suppliers.

CSV files in `research/` and `data/supplier-vetting/` are curation inputs only.
Use them to discover and seed suppliers, but production ingestion should read
from `medmkp_supplier`.

Catalog data lands in:

- `medmkp_supplier_catalog_source`
- `medmkp_supplier_product`
- `medmkp_supplier_price_snapshot`
- `medmkp_canonical_product_match`

After ingestion commits, regenerate cross-supplier product matches — see
`PRODUCT_MATCHING.md`.

## Pipeline Shape

The supplier pipeline has three stages:

```text
discover -> index -> extract
```

- `discover`: fetches `robots.txt`, reads `Sitemap:` directives, and falls back
  to `/sitemap.xml`.
- `index`: classifies sitemap URLs as product, category, sitemap index, or other.
  It can also fetch configured source/category/search URLs and classify links
  found on those pages.
- `extract`: fetches product candidates and extracts quality-gated product rows.

The code lives in:

```text
medusa-backend/apps/backend/src/ingestion/supplier-pipeline/
```

Supplier-specific logic lives in:

```text
medusa-backend/apps/backend/src/ingestion/supplier-pipeline/adapters/
```

## Refresh A Supplier Catalog

Use the DB-backed command for normal refreshes:

```bash
cd medusa-backend/apps/backend
npm run supplier:ingest:db -- --supplier-id=msup_pearsondental_com --limit=25 --debug
```

This is a dry run. It reads from `medmkp_supplier`, writes debug output, and does
not update catalog tables.

Review:

```text
medusa-backend/apps/backend/.medmkp/ingestion/latest/products.csv
medusa-backend/apps/backend/.medmkp/ingestion/latest/failures.csv
medusa-backend/apps/backend/.medmkp/ingestion/latest/summary.json
```

Commit after review:

```bash
npm run supplier:ingest:db -- --supplier-id=msup_pearsondental_com --limit=25 --commit
```

`--commit` replaces cached supplier products and canonical matches for the same
supplier/source catalog. Price snapshots are appended as historical evidence.

Commits with zero extracted products are rejected by default. To intentionally
clear a supplier/source catalog, pass `--allow-empty-commit`.

## Suppliers Without Sitemaps

Some suppliers block `/sitemap.xml`, omit `Sitemap:` directives, or protect
sitemaps behind Cloudflare. Those suppliers can still be ingested from known
category/search/source URLs.

One-off dry run:

```bash
npm run supplier:ingest:db -- \
  --supplier-id=msup_net32_com \
  --source-url=https://www.net32.com/supplies/gloves \
  --limit=100 \
  --debug
```

Persistent source URL:

1. Update `medmkp_supplier.catalog_source_urls` for the supplier.
2. Store a JSON array of category/search/catalog URLs.
3. Optionally describe the source strategy in `catalog_source_notes`.
4. Run the normal DB-backed ingestion command.

Example value:

```json
["https://www.net32.com/supplies/gloves"]
```

The pipeline will fetch those source URLs during the index stage, extract
same-origin links, classify product candidates, and then run the normal product
extraction adapters.

## Production Safety

Run production refreshes in this order:

1. Dry run with `--debug` and a small `--limit`.
2. Inspect `products.csv` and `failures.csv`.
3. Increase `--limit` gradually.
4. Commit only after product rows pass review.
5. Query Postgres to verify `medmkp_supplier_product` and
   `medmkp_supplier_price_snapshot`.

Recommended production command pattern:

```bash
npm run supplier:ingest:db -- --supplier-id=<supplier_id> --limit=100 --debug
npm run supplier:ingest:db -- --supplier-id=<supplier_id> --limit=100 --commit
```

Do not run broad all-supplier commits until each supplier has a proven adapter or
clean structured data source.

## Quality Gates

Accepted product rows must have:

- product name
- supplier SKU or manufacturer SKU
- price
- product URL

Rows are rejected when:

- the supplier page is an error/product-not-found page
- no SKU/manufacturer SKU is found
- no price is found
- the adapter cannot extract a SKU-level product row

Generic extraction is intentionally conservative. Supplier-specific adapters
should be added for important suppliers.

## Add A Supplier

1. Add or seed the supplier into `medmkp_supplier`.

Required fields:

- `name`
- `slug`
- `website_url`
- `onboarding_status`
- `catalog_source_urls`

2. Dry-run ingestion:

```bash
npm run supplier:ingest:db -- --supplier-id=<supplier_id> --limit=10 --debug
```

3. Review debug output.

If the generic adapter produces clean rows, keep using it cautiously. If not,
write a supplier adapter.

## Add A Supplier Adapter

Create a new adapter:

```text
medusa-backend/apps/backend/src/ingestion/supplier-pipeline/adapters/<supplier>.ts
```

Implement:

```ts
export const supplierAdapter = {
  id: "supplier",
  matches: (candidate) => /supplier-domain\.com/i.test(candidate.url),
  extractProducts: (candidate, html) => {
    return []
  },
}
```

Use `extractProducts` when one page can contain multiple SKU rows. Use
`extractProduct` only when a page is truly one product/SKU.

Register it in:

```text
medusa-backend/apps/backend/src/ingestion/supplier-pipeline/adapters/index.ts
```

Adapter rules:

- Extract SKU-level rows, not SEO page summaries.
- Prefer table/structured fields over meta descriptions.
- Reject product-family pages unless they contain SKU rows.
- Preserve supplier SKU and manufacturer SKU separately.
- Attach source URLs that point to the most specific SKU/product page available.
- Do not fabricate brand, SKU, availability, or pack size.

## CSV-Based Sources

Manual CSV imports still exist for curated supplier files:

```bash
SUPPLIER_CATALOG_CSV=./data/catalog-imports/example.csv \
SUPPLIER_ID=msup_example_com \
SOURCE_CATALOG=example-com-manual-csv \
SOURCE_URL=https://example.com \
npm run supplier:import-csv
```

Use CSV imports for:

- supplier-provided catalog files
- manually reviewed starter catalogs
- one-off imports where website extraction is not reliable

Do not use generated debug CSVs as long-term source files.

## Current Known Adapter

Pearson Dental has a supplier-specific adapter.

It extracts SKU-level rows from Pearson item tables, including:

- supplier SKU
- manufacturer part number
- brand from page title
- clean item name
- item-level price
- SKU-specific `bin2` product URL

Pearson `product_thumb_multi.asp` pages are treated as family/category pages, not
SKU-level product pages.

Sky Dental Supply (skydentalsupply.com) has a supplier-specific adapter.

- Single `sitemap.xml` with ~7,600 `.htm` product URLs; standard sitemap
  discovery works.
- Product pages serve full schema.org Product JSON-LD (name, sku, mpn, brand,
  price, availability).
- Category/subcategory/product line come from BreadcrumbList markup; image
  URLs are stored in `raw.image_urls`.
- Discontinued products return HTTP 410 and are logged as failures.

Shasta Dental Supply (shastadentalsupply.com) has a supplier-specific adapter
plus a full-catalog discovery module (`shasta-catalog-discovery.ts`).

- No sitemap: `sitemap.xml` 404s and robots.txt has no `Sitemap:` directive,
  so discovery crawls `index.aspx -> show_Categories.aspx -> show_Subs.aspx ->
  show_Products.aspx` (family pages) and emits SKU-level
  `show_Product.aspx?ID=` URLs. Cap the crawl with
  `--max-shasta-catalog-pages` (default 5000).
- SKU pages expose Item Number (supplier SKU), Manufacturer, Mfg. Number,
  price with a basis suffix (`ea`/`bx`/`cs`/`pk`), availability, breadcrumb
  taxonomy, and pack size (`Components`).
- Clearance items strike the list price and show a `Sale Price:` line; the
  adapter extracts the sale price and keeps the list price in
  `raw.list_price`.

Frontier Dental (frontierdental.com) is currently not ingestible.

- Cloudflare bot management returns 403 for all non-interactive clients,
  including `robots.txt`-allowed paths and `sitemap.xml`, for both plain
  HTTP fetches and headless browsers.
- Do not attempt to bypass the block. Options: request a catalog feed or
  dealer API access from the supplier, or use a manually exported CSV via
  `supplier:import-csv`.
