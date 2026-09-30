require 'rails_helper'

# The triggers of db/migrate/20260930120000_create_agent_bot_oauth_clients.rb, against a minimal
# `public.oauth_client` shaped like the platform's (Better Auth's oauth-provider table). The test
# database has no platform tables, so each example builds it inside its own transaction.
RSpec.describe AgentBot do
  let(:connection) { ActiveRecord::Base.connection }
  let(:account) { create(:account, platform_organization_id: 'org-acme') }

  def client_of(agent_bot)
    connection.select_one("SELECT * FROM public.oauth_client WHERE id = 'chatwoot-agent-bot-#{agent_bot.id}'")
  end

  def hashed(secret)
    Base64.urlsafe_encode64(Digest::SHA256.digest(secret), padding: false)
  end

  context 'with the platform table' do
    before do
      connection.execute(<<~SQL.squish)
        CREATE TABLE IF NOT EXISTS public.oauth_client (
          id varchar(64) PRIMARY KEY, client_id varchar(255) NOT NULL UNIQUE, client_secret text, disabled boolean,
          skip_consent boolean, scopes text, client_credentials_scopes text, user_id varchar(255),
          created_at timestamptz, updated_at timestamptz, name varchar(255), redirect_uris text NOT NULL,
          token_endpoint_auth_method text, application_type varchar(255), grant_types text, response_types text,
          require_pkce boolean, reference_id varchar(255), metadata jsonb
        )
      SQL
    end

    it 'registers a bot of an organization as a client credentials client whose secret is its hashed token' do
      agent_bot = create(:agent_bot, account: account, name: 'Natasha')
      client = client_of(agent_bot)

      expect(client).to include(
        'client_id' => "chatwoot-agent-bot-#{agent_bot.id}",
        'client_secret' => hashed(agent_bot.access_token.token),
        'name' => 'Natasha',
        'disabled' => false,
        'skip_consent' => true,
        'grant_types' => '["client_credentials"]',
        'scopes' => '["write:conversations"]',
        'client_credentials_scopes' => '["write:conversations"]',
        'redirect_uris' => '[]',
        'response_types' => '[]',
        'token_endpoint_auth_method' => 'client_secret_post',
        'application_type' => 'web',
        'require_pkce' => false,
        'reference_id' => 'org-acme'
      )
      expect(JSON.parse(client['metadata'])).to eq('claims' => { 'agent_bot_id' => agent_bot.id })
    end

    it 'rotates the secret with the token' do
      agent_bot = create(:agent_bot, account: account)
      previous = agent_bot.access_token.token

      agent_bot.access_token.regenerate_token

      expect(client_of(agent_bot)['client_secret']).to eq(hashed(agent_bot.access_token.reload.token))
      expect(client_of(agent_bot)['client_secret']).not_to eq(hashed(previous))
    end

    it 'removes the client with the token' do
      agent_bot = create(:agent_bot, account: account)

      agent_bot.access_token.destroy!

      expect(client_of(agent_bot)).to be_nil
    end

    it 'removes the client with the bot, before its token is destroyed asynchronously' do
      agent_bot = create(:agent_bot, account: account)

      agent_bot.destroy!

      expect(client_of(agent_bot)).to be_nil
    end

    it 'follows a rename' do
      agent_bot = create(:agent_bot, account: account, name: 'Natasha')

      agent_bot.update!(name: 'Natasha 2')

      expect(client_of(agent_bot)['name']).to eq('Natasha 2')
    end

    it 'follows the bot to the organization of another account' do
      agent_bot = create(:agent_bot, account: account)

      agent_bot.update!(account: create(:account, platform_organization_id: 'org-globex'))

      expect(client_of(agent_bot)['reference_id']).to eq('org-globex')
    end

    it 'removes the client when the bot leaves every organization' do
      agent_bot = create(:agent_bot, account: account)

      agent_bot.update!(account: create(:account))

      expect(client_of(agent_bot)).to be_nil
    end

    it 'registers no client for a system bot' do
      expect(client_of(create(:agent_bot, account: nil))).to be_nil
    end

    it 'registers no client for a bot of an account no organization is mirrored to' do
      expect(client_of(create(:agent_bot, account: create(:account)))).to be_nil
    end

    it 'leaves the tokens of users alone' do
      create(:user, account: account).access_token.regenerate_token

      expect(connection.select_value('SELECT count(*) FROM public.oauth_client')).to eq(0)
    end
  end

  context 'without the platform table' do
    it 'creates, rotates and deletes a bot as before' do
      expect(connection.select_value("SELECT to_regclass('public.oauth_client')::text")).to be_nil

      agent_bot = create(:agent_bot, account: account)
      agent_bot.access_token.regenerate_token
      agent_bot.update!(name: 'Renamed')
      agent_bot.destroy!

      expect(described_class.exists?(agent_bot.id)).to be(false)
    end
  end
end
