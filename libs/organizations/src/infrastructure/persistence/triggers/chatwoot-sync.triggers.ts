import type { TriggerDef } from '@nestposts/database';
import { SYSTEM_SCHEMA } from '@nestposts/database';

export const CHATWOOT_SYNC_TRIGGER = 'chatwoot_sync';

/**
 * The `feature_flags` a Chatwoot account starts with: every feature `apps/chatwoot/config/features.yml`
 * enables by default. Rails computes it in a `before_create` a trigger never runs, so it is written
 * here — and recomputed whenever Chatwoot is upgraded.
 */
export const CHATWOOT_DEFAULT_FEATURE_FLAGS = '288235736297634575';

const CHATWOOT_ADMINISTRATOR = 1;
const CHATWOOT_AGENT = 0;

/** An organization is a Chatwoot account; deleting it suspends the account and revokes its agents. */
export const OrganizationChatwootSyncTrigger: TriggerDef = {
  name: CHATWOOT_SYNC_TRIGGER,
  timing: 'after',
  events: ['insert', 'update', 'delete'],
  forEach: 'row',
  body: /* sql */ `
    IF TG_TABLE_SCHEMA <> '${SYSTEM_SCHEMA}' OR to_regclass('chatwoot.accounts') IS NULL THEN
      RETURN NULL;
    END IF;

    IF TG_OP = 'DELETE' THEN
      DELETE FROM chatwoot.account_users
       WHERE account_id IN (SELECT id FROM chatwoot.accounts WHERE platform_organization_id = OLD.id);
      UPDATE chatwoot.accounts SET status = 1, updated_at = now() WHERE platform_organization_id = OLD.id;
      RETURN NULL;
    END IF;

    INSERT INTO chatwoot.accounts (name, platform_organization_id, feature_flags, created_at, updated_at)
    VALUES (NEW.name, NEW.id, ${CHATWOOT_DEFAULT_FEATURE_FLAGS}, NEW.created_at, now())
    ON CONFLICT (platform_organization_id) DO UPDATE
       SET name = excluded.name,
           status = 0,
           updated_at = now();
    RETURN NULL
  `,
};

/** A member is an agent of the organization's account: an administrator when `owner` or `admin`. */
export const MemberChatwootSyncTrigger: TriggerDef = {
  name: CHATWOOT_SYNC_TRIGGER,
  timing: 'after',
  events: ['insert', 'update', 'delete'],
  forEach: 'row',
  body: /* sql */ `
    DECLARE
      v_account integer;
      v_agent integer;
    BEGIN
      IF TG_TABLE_SCHEMA <> '${SYSTEM_SCHEMA}' OR to_regclass('chatwoot.account_users') IS NULL THEN
        RETURN NULL;
      END IF;

      IF TG_OP = 'DELETE'
         OR (TG_OP = 'UPDATE' AND (OLD.organization_id, OLD.user_id) IS DISTINCT FROM (NEW.organization_id, NEW.user_id)) THEN
        v_account := (SELECT id FROM chatwoot.accounts WHERE platform_organization_id = OLD.organization_id);
        v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = OLD.user_id);
        DELETE FROM chatwoot.team_members
         WHERE user_id = v_agent
           AND team_id IN (SELECT id FROM chatwoot.teams WHERE account_id = v_account);
        DELETE FROM chatwoot.account_users WHERE account_id = v_account AND user_id = v_agent;
      END IF;

      IF TG_OP = 'DELETE' THEN
        RETURN NULL;
      END IF;

      v_account := (SELECT id FROM chatwoot.accounts WHERE platform_organization_id = NEW.organization_id);
      v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = NEW.user_id);
      IF v_account IS NOT NULL AND v_agent IS NOT NULL THEN
        INSERT INTO chatwoot.account_users (account_id, user_id, role, created_at, updated_at)
        VALUES (
          v_account,
          v_agent,
          CASE WHEN string_to_array(replace(NEW.role, ' ', ''), ',') && ARRAY['owner', 'admin']
            THEN ${CHATWOOT_ADMINISTRATOR} ELSE ${CHATWOOT_AGENT} END,
          NEW.created_at,
          now()
        )
        ON CONFLICT (account_id, user_id) DO UPDATE
           SET role = excluded.role,
               updated_at = now();
      END IF;
      RETURN NULL;
    END
  `,
};

/**
 * A team is a Chatwoot team of the organization's account, named in lower case as Chatwoot names
 * them. A Chatwoot team of the same name that no platform team claims yet is adopted; a rename
 * that would collide with another Chatwoot team leaves the Chatwoot name as it was.
 */
export const TeamChatwootSyncTrigger: TriggerDef = {
  name: CHATWOOT_SYNC_TRIGGER,
  timing: 'after',
  events: ['insert', 'update', 'delete'],
  forEach: 'row',
  body: /* sql */ `
    DECLARE
      v_account integer;
      v_team integer;
    BEGIN
      IF TG_TABLE_SCHEMA <> '${SYSTEM_SCHEMA}' OR to_regclass('chatwoot.teams') IS NULL THEN
        RETURN NULL;
      END IF;

      IF TG_OP = 'DELETE' THEN
        v_team := (SELECT id FROM chatwoot.teams WHERE platform_team_id = OLD.id);
        IF v_team IS NOT NULL THEN
          UPDATE chatwoot.conversations SET team_id = NULL WHERE team_id = v_team;
          DELETE FROM chatwoot.team_members WHERE team_id = v_team;
          DELETE FROM chatwoot.teams WHERE id = v_team;
        END IF;
        RETURN NULL;
      END IF;

      v_account := (SELECT id FROM chatwoot.accounts WHERE platform_organization_id = NEW.organization_id);
      IF v_account IS NULL THEN
        RETURN NULL;
      END IF;

      BEGIN
        UPDATE chatwoot.teams
           SET name = lower(NEW.name),
               account_id = v_account,
               updated_at = now()
         WHERE platform_team_id = NEW.id;
        IF NOT FOUND THEN
          INSERT INTO chatwoot.teams (name, account_id, platform_team_id, created_at, updated_at)
          VALUES (lower(NEW.name), v_account, NEW.id, NEW.created_at, now())
          ON CONFLICT (name, account_id) DO UPDATE
             SET platform_team_id = excluded.platform_team_id,
                 updated_at = now()
           WHERE chatwoot.teams.platform_team_id IS NULL;
        END IF;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
      RETURN NULL;
    END
  `,
};

/** A team member is a Chatwoot team member, once both the team and the agent exist there. */
export const TeamMemberChatwootSyncTrigger: TriggerDef = {
  name: CHATWOOT_SYNC_TRIGGER,
  timing: 'after',
  events: ['insert', 'update', 'delete'],
  forEach: 'row',
  body: /* sql */ `
    DECLARE
      v_team integer;
      v_agent integer;
    BEGIN
      IF TG_TABLE_SCHEMA <> '${SYSTEM_SCHEMA}' OR to_regclass('chatwoot.team_members') IS NULL THEN
        RETURN NULL;
      END IF;

      IF TG_OP = 'DELETE'
         OR (TG_OP = 'UPDATE' AND (OLD.team_id, OLD.user_id) IS DISTINCT FROM (NEW.team_id, NEW.user_id)) THEN
        DELETE FROM chatwoot.team_members
         WHERE team_id = (SELECT id FROM chatwoot.teams WHERE platform_team_id = OLD.team_id)
           AND user_id = (SELECT id FROM chatwoot.users WHERE platform_user_id = OLD.user_id);
      END IF;

      IF TG_OP = 'DELETE' THEN
        RETURN NULL;
      END IF;

      v_team := (SELECT id FROM chatwoot.teams WHERE platform_team_id = NEW.team_id);
      v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = NEW.user_id);
      IF v_team IS NOT NULL AND v_agent IS NOT NULL THEN
        INSERT INTO chatwoot.team_members (team_id, user_id, created_at, updated_at)
        VALUES (v_team, v_agent, coalesce(NEW.created_at, now()), now())
        ON CONFLICT (team_id, user_id) DO NOTHING;
      END IF;
      RETURN NULL;
    END
  `,
};
