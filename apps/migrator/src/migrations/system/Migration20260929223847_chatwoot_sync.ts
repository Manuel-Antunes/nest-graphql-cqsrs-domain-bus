import { Migration } from '@mikro-orm/migrations';

export class Migration20260929223847_chatwoot_sync extends Migration {

  override name = 'Migration20260929223847_chatwoot_sync';

  override up(): void | Promise<void> {
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

    this.addSql(`create or replace function "team_chatwoot_sync_fn"() returns trigger as \$\$ begin DECLARE
      v_account integer;       v_team integer;     BEGIN
      IF TG_TABLE_SCHEMA <> 'public' OR to_regclass('chatwoot.teams') IS NULL THEN
        RETURN NULL;       END IF;       IF TG_OP = 'DELETE' THEN
        v_team := (SELECT id FROM chatwoot.teams WHERE platform_team_id = OLD.id);         IF v_team IS NOT NULL THEN
          UPDATE chatwoot.conversations SET team_id = NULL WHERE team_id = v_team;           DELETE FROM chatwoot.team_members WHERE team_id = v_team;           DELETE FROM chatwoot.teams WHERE id = v_team;         END IF;         RETURN NULL;       END IF;       v_account := (SELECT id FROM chatwoot.accounts WHERE platform_organization_id = NEW.organization_id);       IF v_account IS NULL THEN
        RETURN NULL;       END IF;       BEGIN
        UPDATE chatwoot.teams
           SET name = lower(NEW.name),
               account_id = v_account,
               updated_at = now()
         WHERE platform_team_id = NEW.id;         IF NOT FOUND THEN
          INSERT INTO chatwoot.teams (name, account_id, platform_team_id, created_at, updated_at)
          VALUES (lower(NEW.name), v_account, NEW.id, NEW.created_at, now())
          ON CONFLICT (name, account_id) DO UPDATE
             SET platform_team_id = excluded.platform_team_id,
                 updated_at = now()
           WHERE chatwoot.teams.platform_team_id IS NULL;         END IF;       EXCEPTION WHEN unique_violation THEN
        NULL;       END;       RETURN NULL;     END; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "chatwoot_sync" AFTER INSERT OR UPDATE OR DELETE on "team" for each ROW execute function "team_chatwoot_sync_fn"();`);

    this.addSql(`create or replace function "users_chatwoot_sync_fn"() returns trigger as \$\$ begin DECLARE
      v_agent integer;     BEGIN
      IF TG_TABLE_SCHEMA <> 'public' OR to_regclass('chatwoot.users') IS NULL THEN
        RETURN NULL;       END IF;       IF TG_OP = 'DELETE' THEN
        v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = OLD.id);       ELSIF NEW.deleted_at IS NOT NULL THEN
        v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = NEW.id);       ELSE
        UPDATE chatwoot.users
           SET name = NEW.name,
               email = lower(NEW.email),
               uid = lower(NEW.email),
               type = CASE WHEN 'admin' = ANY (string_to_array(replace(coalesce(NEW.role, ''), ' ', ''), ',')) THEN 'SuperAdmin' END,
               updated_at = now()
         WHERE platform_user_id = NEW.id;         IF NOT FOUND THEN
          INSERT INTO chatwoot.users
            (name, email, uid, provider, encrypted_password, confirmed_at, type, platform_user_id, created_at, updated_at)
          VALUES
            (NEW.name, lower(NEW.email), lower(NEW.email), 'email', '', now(), CASE WHEN 'admin' = ANY (string_to_array(replace(coalesce(NEW.role, ''), ' ', ''), ',')) THEN 'SuperAdmin' END, NEW.id, NEW.created_at, now())
          ON CONFLICT (uid, provider) DO UPDATE
             SET name = excluded.name,
                 email = excluded.email,
                 type = excluded.type,
                 platform_user_id = excluded.platform_user_id,
                 updated_at = now();         END IF;         RETURN NULL;       END IF;       IF v_agent IS NOT NULL THEN
        DELETE FROM chatwoot.team_members WHERE user_id = v_agent;         DELETE FROM chatwoot.account_users WHERE user_id = v_agent;         DELETE FROM chatwoot.users WHERE id = v_agent;       END IF;       RETURN NULL;     END; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "chatwoot_sync" AFTER INSERT OR UPDATE OR DELETE on "users" for each ROW execute function "users_chatwoot_sync_fn"();`);

    this.addSql(`create or replace function "team_member_chatwoot_sync_fn"() returns trigger as \$\$ begin DECLARE
      v_team integer;       v_agent integer;     BEGIN
      IF TG_TABLE_SCHEMA <> 'public' OR to_regclass('chatwoot.team_members') IS NULL THEN
        RETURN NULL;       END IF;       IF TG_OP = 'DELETE'
         OR (TG_OP = 'UPDATE' AND (OLD.team_id, OLD.user_id) IS DISTINCT FROM (NEW.team_id, NEW.user_id)) THEN
        DELETE FROM chatwoot.team_members
         WHERE team_id = (SELECT id FROM chatwoot.teams WHERE platform_team_id = OLD.team_id)
           AND user_id = (SELECT id FROM chatwoot.users WHERE platform_user_id = OLD.user_id);       END IF;       IF TG_OP = 'DELETE' THEN
        RETURN NULL;       END IF;       v_team := (SELECT id FROM chatwoot.teams WHERE platform_team_id = NEW.team_id);       v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = NEW.user_id);       IF v_team IS NOT NULL AND v_agent IS NOT NULL THEN
        INSERT INTO chatwoot.team_members (team_id, user_id, created_at, updated_at)
        VALUES (v_team, v_agent, coalesce(NEW.created_at, now()), now())
        ON CONFLICT (team_id, user_id) DO NOTHING;       END IF;       RETURN NULL;     END; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "chatwoot_sync" AFTER INSERT OR UPDATE OR DELETE on "team_member" for each ROW execute function "team_member_chatwoot_sync_fn"();`);

    this.addSql(`create or replace function "member_chatwoot_sync_fn"() returns trigger as \$\$ begin DECLARE
      v_account integer;       v_agent integer;     BEGIN
      IF TG_TABLE_SCHEMA <> 'public' OR to_regclass('chatwoot.account_users') IS NULL THEN
        RETURN NULL;       END IF;       IF TG_OP = 'DELETE'
         OR (TG_OP = 'UPDATE' AND (OLD.organization_id, OLD.user_id) IS DISTINCT FROM (NEW.organization_id, NEW.user_id)) THEN
        v_account := (SELECT id FROM chatwoot.accounts WHERE platform_organization_id = OLD.organization_id);         v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = OLD.user_id);         DELETE FROM chatwoot.team_members
         WHERE user_id = v_agent
           AND team_id IN (SELECT id FROM chatwoot.teams WHERE account_id = v_account);         DELETE FROM chatwoot.account_users WHERE account_id = v_account AND user_id = v_agent;       END IF;       IF TG_OP = 'DELETE' THEN
        RETURN NULL;       END IF;       v_account := (SELECT id FROM chatwoot.accounts WHERE platform_organization_id = NEW.organization_id);       v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = NEW.user_id);       IF v_account IS NOT NULL AND v_agent IS NOT NULL THEN
        INSERT INTO chatwoot.account_users (account_id, user_id, role, created_at, updated_at)
        VALUES (
          v_account,
          v_agent,
          CASE WHEN string_to_array(replace(NEW.role, ' ', ''), ',') && ARRAY['owner', 'admin']
            THEN 1 ELSE 0 END,
          NEW.created_at,
          now()
        )
        ON CONFLICT (account_id, user_id) DO UPDATE
           SET role = excluded.role,
               updated_at = now();       END IF;       RETURN NULL;     END; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "chatwoot_sync" AFTER INSERT OR UPDATE OR DELETE on "member" for each ROW execute function "member_chatwoot_sync_fn"();`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop trigger if exists "chatwoot_sync" on "member";`);
    this.addSql(`drop function if exists "member_chatwoot_sync_fn"();`);

    this.addSql(`drop trigger if exists "chatwoot_sync" on "organization";`);
    this.addSql(`drop function if exists "organization_chatwoot_sync_fn"();`);

    this.addSql(`drop trigger if exists "chatwoot_sync" on "team";`);
    this.addSql(`drop function if exists "team_chatwoot_sync_fn"();`);

    this.addSql(`drop trigger if exists "chatwoot_sync" on "team_member";`);
    this.addSql(`drop function if exists "team_member_chatwoot_sync_fn"();`);

    this.addSql(`drop trigger if exists "chatwoot_sync" on "users";`);
    this.addSql(`drop function if exists "users_chatwoot_sync_fn"();`);
  }

}
