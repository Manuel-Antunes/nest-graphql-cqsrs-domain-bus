require 'rails_helper'

RSpec.describe 'Inertia no accounts page', :platform_session, type: :request do
  let(:user) { create(:user).tap { |orphan| orphan.update!(platform_user_id: 'platform-orphan') } }

  def session_cookie(token)
    signature = Base64.strict_encode64(OpenSSL::HMAC.digest('SHA256', BetterAuth::SessionCookie.secret, token))
    "better-auth.session_token=#{CGI.escape("#{token}.#{signature}")}"
  end

  def inertia_headers
    {
      'Cookie' => session_cookie('session-token'),
      'X-Inertia' => 'true',
      'X-Inertia-Version' => (defined?(GIT_HASH) ? GIT_HASH : nil).to_s
    }
  end

  before do
    allow(BetterAuth::Platform).to receive(:session).and_return('platform_user_id' => user.platform_user_id, 'organization_id' => nil)
  end

  it 'offers the platform page where an organization, and with it an account, is created' do
    with_modified_env WEB_URL: 'https://platform.example' do
      get '/app/no-accounts', headers: inertia_headers
    end

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['component']).to eq('NoAccounts/Index')
    expect(response.parsed_body.dig('props', 'platform', 'organizationsUrl')).to eq('https://platform.example/settings/organizations')
  end
end
