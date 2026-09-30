import type { TriggerDef } from '@nestposts/database';
import { SYSTEM_SCHEMA } from '@nestposts/database';

export const CHATWOOT_SYNC_TRIGGER = 'chatwoot_sync';

const CHATWOOT_USER_TYPE = /* sql */ `CASE WHEN 'admin' = ANY (string_to_array(replace(coalesce(NEW.role, ''), ' ', ''), ',')) THEN 'SuperAdmin' END`;

export const UserChatwootSyncTrigger: TriggerDef = {
  name: CHATWOOT_SYNC_TRIGGER,
  timing: 'after',
  events: ['insert', 'update', 'delete'],
  forEach: 'row',
  body: /* sql */ `
    DECLARE
      v_agent integer;
    BEGIN
      IF TG_TABLE_SCHEMA <> '${SYSTEM_SCHEMA}' OR to_regclass('chatwoot.users') IS NULL THEN
        RETURN NULL;
      END IF;

      IF TG_OP = 'DELETE' THEN
        v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = OLD.id);
      ELSIF NEW.deleted_at IS NOT NULL THEN
        v_agent := (SELECT id FROM chatwoot.users WHERE platform_user_id = NEW.id);
      ELSE
        UPDATE chatwoot.users
           SET name = NEW.name,
               email = lower(NEW.email),
               uid = lower(NEW.email),
               type = ${CHATWOOT_USER_TYPE},
               updated_at = now()
         WHERE platform_user_id = NEW.id;
        IF NOT FOUND THEN
          INSERT INTO chatwoot.users
            (name, email, uid, provider, encrypted_password, confirmed_at, type, platform_user_id, created_at, updated_at)
          VALUES
            (NEW.name, lower(NEW.email), lower(NEW.email), 'email', '', now(), ${CHATWOOT_USER_TYPE}, NEW.id, NEW.created_at, now())
          ON CONFLICT (uid, provider) DO UPDATE
             SET name = excluded.name,
                 email = excluded.email,
                 type = excluded.type,
                 platform_user_id = excluded.platform_user_id,
                 updated_at = now();
        END IF;
        RETURN NULL;
      END IF;

      IF v_agent IS NOT NULL THEN
        DELETE FROM chatwoot.team_members WHERE user_id = v_agent;
        DELETE FROM chatwoot.account_users WHERE user_id = v_agent;
        DELETE FROM chatwoot.users WHERE id = v_agent;
      END IF;
      RETURN NULL;
    END
  `,
};
