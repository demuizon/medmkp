import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260605101000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier_product" add column if not exists "product_url" text not null default '', add column if not exists "manufacturer_sku" text not null default '', add column if not exists "brand" text not null default '', add column if not exists "pack_size" text not null default '', add column if not exists "unit_of_measure" text not null default '';`);
    this.addSql(`alter table if exists "medmkp_supplier_product" alter column "product_url" drop default, alter column "manufacturer_sku" drop default, alter column "brand" drop default, alter column "pack_size" drop default, alter column "unit_of_measure" drop default;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier_product" drop column if exists "product_url", drop column if exists "manufacturer_sku", drop column if exists "brand", drop column if exists "pack_size", drop column if exists "unit_of_measure";`);
  }

}
