import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260605100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medmkp_dental_practice" ("id" text not null, "name" text not null, "primary_contact_name" text not null, "primary_contact_email" text not null, "phone" text not null, "website_url" text not null, "address_text" text not null, "practice_management_system" text not null, "status" text check ("status" in ('lead', 'active', 'paused', 'churned')) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_dental_practice_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_dental_practice_deleted_at" ON "medmkp_dental_practice" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_practice_subscription" ("id" text not null, "practice_id" text not null, "plan" text check ("plan" in ('starter', 'growth', 'concierge')) not null, "status" text check ("status" in ('trialing', 'active', 'past_due', 'canceled')) not null, "monthly_fee_cents" integer not null, "started_at" text not null, "renews_at" text not null, "stripe_customer_id" text not null, "stripe_subscription_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_practice_subscription_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_practice_subscription_deleted_at" ON "medmkp_practice_subscription" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_invoice" ("id" text not null, "practice_id" text not null, "vendor_name" text not null, "invoice_number" text not null, "invoice_date" text not null, "source_file_name" text not null, "source_file_url" text not null, "extraction_status" text check ("extraction_status" in ('uploaded', 'extracting', 'needs_review', 'normalized', 'failed')) not null, "subtotal_cents" integer not null, "shipping_cents" integer not null, "tax_cents" integer not null, "total_cents" integer not null, "notes" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_invoice_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_invoice_deleted_at" ON "medmkp_invoice" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_invoice_line_item" ("id" text not null, "invoice_id" text not null, "practice_id" text not null, "canonical_product_id" text not null, "match_status" text check ("match_status" in ('exact', 'variant', 'substitute', 'needs_review', 'unmatched')) not null, "raw_description" text not null, "supplier_sku" text not null, "manufacturer_sku" text not null, "brand" text not null, "category" text not null, "quantity" integer not null, "unit_of_measure" text not null, "pack_size" text not null, "unit_price_cents" integer not null, "extended_price_cents" integer not null, "normalized_unit_price_cents" integer not null, "confidence_score" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_invoice_line_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_invoice_line_item_deleted_at" ON "medmkp_invoice_line_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_supplier_catalog_source" ("id" text not null, "supplier_id" text not null, "source_type" text check ("source_type" in ('website', 'pdf', 'csv', 'manual', 'api', 'email', 'agent')) not null, "source_catalog" text not null, "source_url" text not null, "auth_required" boolean not null, "refresh_frequency" text check ("refresh_frequency" in ('weekly', 'monthly', 'quarterly', 'manual')) not null, "last_crawled_at" text not null, "status" text check ("status" in ('active', 'stale', 'failed', 'paused')) not null, "notes" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_supplier_catalog_source_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_supplier_catalog_source_deleted_at" ON "medmkp_supplier_catalog_source" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_supplier_price_snapshot" ("id" text not null, "supplier_product_id" text not null, "supplier_id" text not null, "price_cents" integer not null, "price_basis" text check ("price_basis" in ('each', 'box', 'case', 'pack', 'unknown')) not null, "min_quantity" integer not null, "availability" text check ("availability" in ('in_stock', 'limited', 'backordered', 'unknown')) not null, "captured_at" text not null, "source_url" text not null, "confidence_score" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_supplier_price_snapshot_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_supplier_price_snapshot_deleted_at" ON "medmkp_supplier_price_snapshot" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_savings_opportunity" ("id" text not null, "practice_id" text not null, "invoice_id" text not null, "invoice_line_item_id" text not null, "canonical_product_id" text not null, "recommended_supplier_id" text not null, "recommended_supplier_product_id" text not null, "type" text check ("type" in ('exact_match_cheaper', 'equivalent_substitute', 'bulk_purchase', 'vendor_negotiation', 'contract_pricing', 'reorder_consolidation')) not null, "status" text check ("status" in ('new', 'reviewing', 'recommended', 'accepted', 'ignored')) not null, "current_unit_price_cents" integer not null, "recommended_unit_price_cents" integer not null, "estimated_monthly_savings_cents" integer not null, "estimated_annual_savings_cents" integer not null, "confidence_score" integer not null, "explanation" text not null, "evidence_url" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_savings_opportunity_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_savings_opportunity_deleted_at" ON "medmkp_savings_opportunity" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medmkp_savings_report" ("id" text not null, "practice_id" text not null, "invoice_id" text not null, "status" text check ("status" in ('draft', 'ready', 'sent', 'archived')) not null, "reporting_period" text not null, "current_spend_cents" integer not null, "estimated_monthly_savings_cents" integer not null, "estimated_annual_savings_cents" integer not null, "opportunity_count" integer not null, "summary" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medmkp_savings_report_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medmkp_savings_report_deleted_at" ON "medmkp_savings_report" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medmkp_savings_report" cascade;`);
    this.addSql(`drop table if exists "medmkp_savings_opportunity" cascade;`);
    this.addSql(`drop table if exists "medmkp_supplier_price_snapshot" cascade;`);
    this.addSql(`drop table if exists "medmkp_supplier_catalog_source" cascade;`);
    this.addSql(`drop table if exists "medmkp_invoice_line_item" cascade;`);
    this.addSql(`drop table if exists "medmkp_invoice" cascade;`);
    this.addSql(`drop table if exists "medmkp_practice_subscription" cascade;`);
    this.addSql(`drop table if exists "medmkp_dental_practice" cascade;`);
  }

}
