import { Migration } from '@mikro-orm/migrations';

export class Migration20260921235341_organization_tenant_schema extends Migration {

  override name = 'Migration20260921235341_organization_tenant_schema';

  override up(): void | Promise<void> {
    this.addSql(`create or replace function "posts"."organization_organization_tenant_schema_fn"() returns trigger as \$\$ begin IF TG_OP = 'INSERT' THEN
          EXECUTE format('create schema if not exists %I', 'tenant_' || NEW.slug);         ELSIF TG_OP = 'DELETE' THEN
          EXECUTE format('drop schema if exists %I cascade', 'tenant_' || OLD.slug);         END IF;         RETURN NULL; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "organization_tenant_schema" AFTER INSERT OR DELETE on "posts"."organization" for each ROW execute function "posts"."organization_organization_tenant_schema_fn"();`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop trigger if exists "organization_tenant_schema" on "posts"."organization";`);
    this.addSql(`drop function if exists "posts"."organization_organization_tenant_schema_fn"();`);
  }

}
