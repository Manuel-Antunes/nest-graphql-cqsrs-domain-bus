require 'rails_helper'

RSpec.describe AgentBots::PlatformAccessToken do
  let(:account) { create(:account, platform_organization_id: 'org-acme') }
  let(:agent_bot) { create(:agent_bot, account: account) }
  let(:token_url) { 'http://localhost:4200/api/auth/oauth2/token' }
  let(:grant) do
    {
      'grant_type' => 'client_credentials',
      'client_id' => "chatwoot-agent-bot-#{agent_bot.id}",
      'client_secret' => agent_bot.access_token.token,
      'scope' => 'write:conversations',
      'resource' => 'http://localhost:4000/graphql'
    }
  end
  let(:environment) do
    { 'WEB_URL' => nil, 'AUTH_BASE_PATH' => nil, 'AUTH_TOKEN_URL' => nil, 'AUTH_OAUTH_RESOURCES' => nil, 'GATEWAY_URL' => nil }
  end

  def issues(access_token, expires_in: 3600, url: token_url, body: grant)
    stub_request(:post, url).with(body: body)
                            .to_return(status: 200, headers: { 'Content-Type' => 'application/json' },
                                       body: { access_token: access_token, token_type: 'Bearer', expires_in: expires_in,
                                               scope: 'write:conversations' }.to_json)
  end

  around do |example|
    with_modified_env(environment) { example.run }
  end

  before do
    allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::MemoryStore.new)
  end

  it "exchanges the bot's credentials for a platform token through the client credentials grant" do
    request = issues('jwt-1')

    expect(described_class.for(agent_bot)).to eq('jwt-1')
    expect(request).to have_been_requested.once
  end

  it 'answers from the cache until shortly before the token expires' do
    request = issues('jwt-1')

    described_class.for(agent_bot)
    expect(described_class.for(agent_bot)).to eq('jwt-1')
    expect(request).to have_been_requested.once

    travel(3600.seconds - described_class::EXPIRY_MARGIN + 1.second) do
      described_class.for(agent_bot)
      expect(request).to have_been_requested.twice
    end
  end

  it 'asks again once the token is rotated' do
    issues('jwt-1')
    described_class.for(agent_bot)

    agent_bot.access_token.regenerate_token
    issues('jwt-2', body: grant.merge('client_secret' => agent_bot.access_token.reload.token))

    expect(described_class.for(agent_bot)).to eq('jwt-2')
  end

  context 'with the endpoint configured' do
    let(:environment) do
      super().merge('WEB_URL' => 'https://web.example', 'AUTH_BASE_PATH' => '/auth', 'AUTH_OAUTH_RESOURCES' => 'https://gw.example/graphql, https://other')
    end

    it 'posts to WEB_URL under AUTH_BASE_PATH, for the first OAuth resource' do
      request = issues('jwt-1', url: 'https://web.example/auth/oauth2/token', body: grant.merge('resource' => 'https://gw.example/graphql'))

      expect(described_class.for(agent_bot)).to eq('jwt-1')
      expect(request).to have_been_requested
    end
  end

  context 'with AUTH_TOKEN_URL' do
    let(:environment) { super().merge('AUTH_TOKEN_URL' => 'https://idp.example/token', 'GATEWAY_URL' => 'https://gw.example/graphql') }

    it 'posts there, for the gateway' do
      request = issues('jwt-1', url: 'https://idp.example/token', body: grant.merge('resource' => 'https://gw.example/graphql'))

      expect(described_class.for(agent_bot)).to eq('jwt-1')
      expect(request).to have_been_requested
    end
  end

  it 'answers nil, and logs, when the platform refuses the credentials' do
    stub_request(:post, token_url).to_return(status: 401, body: { error: 'invalid_client' }.to_json)
    allow(Rails.logger).to receive(:warn)

    expect(described_class.for(agent_bot)).to be_nil
    expect(Rails.logger).to have_received(:warn).with(/no platform token for agent bot #{agent_bot.id}/)
  end

  it 'answers nil when the platform cannot be reached' do
    stub_request(:post, token_url).to_raise(Errno::ECONNREFUSED)

    expect(described_class.for(agent_bot)).to be_nil
  end

  it 'asks nothing for a system bot' do
    expect(described_class.for(create(:agent_bot, account: nil))).to be_nil
    expect(a_request(:post, token_url)).not_to have_been_made
  end

  it 'asks nothing for a bot of an account no organization is mirrored to' do
    expect(described_class.for(create(:agent_bot, account: create(:account)))).to be_nil
    expect(a_request(:post, token_url)).not_to have_been_made
  end
end
