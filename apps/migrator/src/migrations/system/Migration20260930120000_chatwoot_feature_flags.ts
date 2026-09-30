import { Migration } from '@mikro-orm/migrations';

export class Migration20260930120000_chatwoot_feature_flags extends Migration {

  override name = 'Migration20260930120000_chatwoot_feature_flags';

  override up(): void | Promise<void> {
    this.addSql(`drop trigger if exists "chatwoot_sync" on "organization";`);
    this.addSql(`drop function if exists "organization_chatwoot_sync_fn"();`);

    this.addSql(`create or replace function "organization_chatwoot_sync_fn"() returns trigger as \$\$ begin IF TG_TABLE_SCHEMA <> 'public' OR to_regclass('chatwoot.accounts') IS NULL THEN
      RETURN NULL;     END IF;     IF TG_OP = 'DELETE' THEN
      DELETE FROM chatwoot.account_users
       WHERE account_id IN (SELECT id FROM chatwoot.accounts WHERE platform_organization_id = OLD.id);       UPDATE chatwoot.accounts SET status = 1, updated_at = now() WHERE platform_organization_id = OLD.id;       RETURN NULL;     END IF;     IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'chatwoot' AND table_name = 'accounts' AND column_name = 'feature_flags_ext_1'
    ) THEN
      INSERT INTO chatwoot.accounts (name, platform_organization_id, feature_flags, feature_flags_ext_1, created_at, updated_at)
      VALUES (NEW.name, NEW.id, 1442282865933417223, 4, NEW.created_at, now())
      ON CONFLICT (platform_organization_id) DO UPDATE
         SET name = excluded.name,
             status = 0,
             updated_at = now();     ELSE
      INSERT INTO chatwoot.accounts (name, platform_organization_id, feature_flags, created_at, updated_at)
      VALUES (NEW.name, NEW.id, 1442282865933417223, NEW.created_at, now())
      ON CONFLICT (platform_organization_id) DO UPDATE
         SET name = excluded.name,
             status = 0,
             updated_at = now();     END IF;     RETURN NULL; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "chatwoot_sync" AFTER INSERT OR UPDATE OR DELETE on "organization" for each ROW execute function "organization_chatwoot_sync_fn"();`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop trigger if exists "chatwoot_sync" on "organization";`);
    this.addSql(`drop function if exists "organization_chatwoot_sync_fn"();`);

    this.addSql(`create or replace function "organization_chatwoot_sync_fn"() returns trigger as \$\$ begin IF TG_TABLE_SCHEMA <> 'public' OR to_regclass('chatwoot.accounts') IS NULL THEN
      RETURN NULL;     END IF;     IF TG_OP = 'DELETE' THEN
      DELETE FROM chatwoot.account_users
       WHERE account_id IN (SELECT id FROM chatwoot.accounts WHERE platform_organization_id = OLD.id);       UPDATE chatwoot.accounts SET status = 1, updated_at = now() WHERE platform_organization_id = OLD.id;       RETURN NULL;     END IF;     INSERT INTO chatwoot.accounts (name, platform_organization_id, feature_flags, created_at, updated_at)
    VALUES (NEW.name, NEW.id, 288235736297634575, NEW.created_at, now())
    ON CONFLICT (platform_organization_id) DO UPDATE
       SET name = excluded.name,
           status = 0,
           updated_at = now();     RETURN NULL; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "chatwoot_sync" AFTER INSERT OR UPDATE OR DELETE on "organization" for each ROW execute function "organization_chatwoot_sync_fn"();`);
  }

}
