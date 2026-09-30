# == Schema Information
#
# Table name: access_tokens
#
#  id         :bigint           not null, primary key
#  owner_type :string
#  token      :string
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  owner_id   :bigint
#
# Indexes
#
#  index_access_tokens_on_owner_type_and_owner_id  (owner_type,owner_id)
#  index_access_tokens_on_token                    (token) UNIQUE
#

class AccessToken < ApplicationRecord
  has_secure_token :token
  belongs_to :owner, polymorphic: true

  # An agent bot's token is the secret of the bot's platform OAuth client — these mirror
  # db/migrate/20260930120000_create_agent_bot_oauth_clients.rb, which explains them.
  trigger.name('access_tokens_agent_bot_oauth_client_upsert').after(:insert, :update).where("NEW.owner_type = 'AgentBot'")
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

  trigger.name('access_tokens_agent_bot_oauth_client_delete').after(:delete).where("OLD.owner_type = 'AgentBot'") do
    <<~PLPGSQL
      IF to_regclass('public.oauth_client') IS NULL THEN
          RETURN NULL;
      END IF;
      DELETE FROM public.oauth_client WHERE id = 'chatwoot-agent-bot-' || OLD.owner_id;
    PLPGSQL
  end
end
