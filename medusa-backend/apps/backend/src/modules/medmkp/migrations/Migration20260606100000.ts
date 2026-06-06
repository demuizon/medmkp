import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260606100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier" add column if not exists "catalog_source_urls" text not null default '', add column if not exists "catalog_source_notes" text not null default '';`);
    this.addSql(`alter table if exists "medmkp_supplier" alter column "catalog_source_urls" drop default, alter column "catalog_source_notes" drop default;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medmkp_supplier" drop column if exists "catalog_source_urls", drop column if exists "catalog_source_notes";`);
  }

}
