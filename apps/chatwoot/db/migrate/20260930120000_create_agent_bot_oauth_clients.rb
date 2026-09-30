# An agent bot of an account mirrored from a platform organization is an OAuth client of the platform
# (`public.oauth_client`, Better Auth's oauth-provider table), so it can exchange its credentials for a
# platform access token through the client credentials grant:
#
#   * client_id `chatwoot-agent-bot-<bot id>`, and its secret the bot's Chatwoot access token, stored the
#     way the platform stores a secret: base64url(sha256(secret)), unpadded. Rotating the token rotates it.
#   * `reference_id` is the organization the bot's account is mirrored from, and the platform binds every
#     token the client is issued for itself to it (`organization_id`), from the client and not from here.
#   * `metadata.claims` is what the platform copies into every token the client is issued: `agent_bot_id`,
#     which is what the gateway reads the bot back from before it hands Chatwoot the bot's own access token.
#   * a bot with no organization — a system bot, or one whose account is not mirrored — has no client.
#
# The array columns are TEXT holding JSON, as Better Auth writes them. Every trigger returns at once when
# `public.oauth_client` does not exist, so a Chatwoot database without the platform's tables is unaffected.
# Renaming a bot or moving it to another account touches its access token, which is what re-runs the upsert.
class CreateAgentBotOauthClients < ActiveRecord::Migration[7.1]
  # hairtrigger reads the literal create_trigger calls of `up` to dump them, so they stay here.
  def up # rubocop:disable Metrics/MethodLength
    create_trigger('access_tokens_agent_bot_oauth_client_upsert', generated: true, compatibility: 1)
      .on('access_tokens').after(:insert, :update).where("NEW.owner_type = 'AgentBot'")
      .declare('bot_name text; organization_id text') do
      <<~PLPGSQL
        IF to_regclass('public.oauth_client') IS NULL THEN
            RETURN NULL;
        END IF;
        EXECUTE format('SELECT b.name, a.platform_organization_id FROM %I.agent_bots b LEFT JOIN %I.accounts a ON a.id = b.account_id WHERE b.id = $1', TG_TABLE_SCHEMA, TG_TABLE_SCHEMA)
            INTO bot_name, organization_id
            USING NEW.owner_id;
        IF organization_id IS NULL THEN
            DELETE FROM public.oauth_client WHERE id = 'chatwoot-agent-bot-' || NEW.owner_id;
            RETURN NULL;
        END IF;
        INSERT INTO public.oauth_client (
            id, client_id, client_secret, name, disabled, skip_consent, grant_types, response_types, redirect_uris,
            scopes, client_credentials_scopes, token_endpoint_auth_method, application_type, require_pkce,
            reference_id, metadata, created_at, updated_at
        ) VALUES (
            'chatwoot-agent-bot-' || NEW.owner_id,
            'chatwoot-agent-bot-' || NEW.owner_id,
            rtrim(translate(encode(sha256(convert_to(NEW.token, 'UTF8')), 'base64'), '+/', '-_'), '='),
            left(bot_name, 255), false, true, '["client_credentials"]', '[]', '[]',
            '["write:conversations"]', '["write:conversations"]', 'client_secret_post', 'web', false,
            organization_id,
            jsonb_build_object('claims', jsonb_build_object('agent_bot_id', NEW.owner_id)),
            now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
            client_secret = EXCLUDED.client_secret,
            name = EXCLUDED.name,
            disabled = EXCLUDED.disabled,
            skip_consent = EXCLUDED.skip_consent,
            grant_types = EXCLUDED.grant_types,
            response_types = EXCLUDED.response_types,
            redirect_uris = EXCLUDED.redirect_uris,
            scopes = EXCLUDED.scopes,
            client_credentials_scopes = EXCLUDED.client_credentials_scopes,
            token_endpoint_auth_method = EXCLUDED.token_endpoint_auth_method,
            application_type = EXCLUDED.application_type,
            require_pkce = EXCLUDED.require_pkce,
            reference_id = EXCLUDED.reference_id,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at;
      PLPGSQL
    end

    create_trigger('access_tokens_agent_bot_oauth_client_delete', generated: true, compatibility: 1)
      .on('access_tokens').after(:delete).where("OLD.owner_type = 'AgentBot'") do
      <<~PLPGSQL
        IF to_regclass('public.oauth_client') IS NULL THEN
            RETURN NULL;
        END IF;
        DELETE FROM public.oauth_client WHERE id = 'chatwoot-agent-bot-' || OLD.owner_id;
      PLPGSQL
    end

    create_trigger('agent_bots_oauth_client_refresh', generated: true, compatibility: 1)
      .on('agent_bots').after(:update).of(:name, :account_id) do
      <<~PLPGSQL
        IF to_regclass('public.oauth_client') IS NULL THEN
            RETURN NULL;
        END IF;
        EXECUTE format('UPDATE %I.access_tokens SET updated_at = now() WHERE owner_type = $1 AND owner_id = $2', TG_TABLE_SCHEMA)
            USING 'AgentBot', NEW.id;
      PLPGSQL
    end

    create_trigger('agent_bots_oauth_client_delete', generated: true, compatibility: 1)
      .on('agent_bots').after(:delete) do
      <<~PLPGSQL
        IF to_regclass('public.oauth_client') IS NULL THEN
            RETURN NULL;
        END IF;
        DELETE FROM public.oauth_client WHERE id = 'chatwoot-agent-bot-' || OLD.id;
      PLPGSQL
    end

    execute("UPDATE access_tokens SET updated_at = updated_at WHERE owner_type = 'AgentBot'")
  end

  def down
    drop_trigger('access_tokens_agent_bot_oauth_client_upsert', 'access_tokens', generated: true)
    drop_trigger('access_tokens_agent_bot_oauth_client_delete', 'access_tokens', generated: true)
    drop_trigger('agent_bots_oauth_client_refresh', 'agent_bots', generated: true)
    drop_trigger('agent_bots_oauth_client_delete', 'agent_bots', generated: true)

    execute(<<~SQL.squish)
      DO $$
      BEGIN
        IF to_regclass('public.oauth_client') IS NOT NULL THEN
          DELETE FROM public.oauth_client WHERE id LIKE 'chatwoot-agent-bot-%';
        END IF;
      END $$;
    SQL
  end
end
