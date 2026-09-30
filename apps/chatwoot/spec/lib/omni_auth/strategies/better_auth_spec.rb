require 'rails_helper'

RSpec.describe OmniAuth::Strategies::BetterAuth, :platform_session, type: :request do
  let(:account) { create(:account) }
  let(:agent) { create(:user, account: account, role: :agent).tap { |user| user.update!(platform_user_id: 'platform-agent') } }
  let(:stranger) { create(:user, account: account, role: :agent).tap { |user| user.update!(platform_user_id: 'platform-stranger') } }

  def session_cookie(token, secret: BetterAuth::SessionCookie.secret)
    signature = Base64.strict_encode64(OpenSSL::HMAC.digest('SHA256', secret, token))
    "better-auth.session_token=#{CGI.escape("#{token}.#{signature}")}"
  end

  def platform_session_of(user)
    allow(BetterAuth::Platform).to receive(:session).and_return('platform_user_id' => user.platform_user_id, 'organization_id' => nil)
  end

  it 'refuses the native sign-in' do
    post '/auth/sign_in', params: { email: agent.email, password: 'Password1!' }, as: :json

    expect(response).to have_http_status(:forbidden)
  end

  it 'refuses a dashboard token with no platform session beside it' do
    get '/api/v1/profile', headers: agent.create_new_auth_token, as: :json

    expect(response).to have_http_status(:unauthorized)
    expect(response.parsed_body['errors']).to eq(['The platform session this token belongs to has ended'])
  end

  it 'honours a dashboard token beside the platform session of the same user' do
    platform_session_of(agent)

    get '/api/v1/profile', headers: agent.create_new_auth_token.merge('Cookie' => session_cookie('session-token')), as: :json

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['email']).to eq(agent.email)
  end

  context 'when the signature carries a plus sign' do
    let(:token) { (1..).lazy.map { |n| "session-#{n}" }.find { |candidate| signature_of(candidate).include?('+') } }

    def signature_of(token)
      Base64.strict_encode64(OpenSSL::HMAC.digest('SHA256', BetterAuth::SessionCookie.secret, token))
    end

    before { platform_session_of(agent) }

    it 'reads it percent-encoded, as a browser sends it' do
      get '/api/v1/profile', headers: agent.create_new_auth_token.merge('Cookie' => session_cookie(token)), as: :json

      expect(response).to have_http_status(:ok)
    end

    it 'reads it decoded, as a proxy that rebuilt the header sends it' do
      cookie = "better-auth.session_token=#{token}.#{signature_of(token)}"

      get '/api/v1/profile', headers: agent.create_new_auth_token.merge('Cookie' => cookie), as: :json

      expect(response).to have_http_status(:ok)
    end
  end

  it "refuses a dashboard token beside somebody else's platform session" do
    platform_session_of(stranger)

    get '/api/v1/profile', headers: agent.create_new_auth_token.merge('Cookie' => session_cookie('session-token')), as: :json

    expect(response).to have_http_status(:unauthorized)
  end

  describe 'a platform access token as a bearer', :platform_access_token do
    def call_graphql(bearer)
      post '/graphql', params: { query: '{ __typename }' }, headers: { 'Authorization' => "Bearer #{bearer}" }, as: :json
    end

    it 'resolves a user token to the user' do
      allow(BetterAuth::Platform).to receive(:user).with('platform-agent').and_return('platform_user_id' => agent.platform_user_id)

      call_graphql(platform_access_token(sub: 'platform-agent', scope: 'openid'))

      expect(request.env['warden'].user(scope: :user)).to eq(agent)
    end

    it "resolves nobody from an agent bot's token, which the gateway exchanges for the bot's own" do
      agent_bot = create(:agent_bot, account: create(:account, platform_organization_id: 'org-acme'))
      allow(BetterAuth::Platform).to receive(:user).and_return(nil)

      call_graphql(agent_bot_access_token(agent_bot))

      expect(request.env['warden'].user(scope: :user)).to be_nil
    end
  end

  it 'reads nothing from a session cookie whose signature does not match' do
    allow(BetterAuth::Platform).to receive(:session)

    get '/api/v1/profile', headers: agent.create_new_auth_token.merge('Cookie' => session_cookie('session-token', secret: 'forged')), as: :json

    expect(response).to have_http_status(:unauthorized)
    expect(BetterAuth::Platform).not_to have_received(:session)
  end
end
