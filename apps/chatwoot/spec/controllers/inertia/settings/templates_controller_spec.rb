require 'rails_helper'

RSpec.describe 'Inertia templates settings page', :platform_session, type: :request do
  let(:account) { create(:account).tap { |record| record.update!(platform_organization_id: 'platform-organization') } }
  let(:administrator) { create(:user, account: account, role: :administrator).tap { |user| user.update!(platform_user_id: 'platform-admin') } }
  let(:agent) { create(:user, account: account, role: :agent).tap { |user| user.update!(platform_user_id: 'platform-agent') } }

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

  def platform_session_of(user)
    allow(BetterAuth::Platform).to receive(:session)
      .and_return('platform_user_id' => user.platform_user_id, 'organization_id' => account.platform_organization_id)
  end

  it 'renders the templates page for an administrator' do
    platform_session_of(administrator)

    get "/app/accounts/#{account.id}/settings/templates", headers: inertia_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['component']).to eq('Settings/Templates/Index')
  end

  it 'sends an agent to the dashboard' do
    platform_session_of(agent)

    get "/app/accounts/#{account.id}/settings/templates", headers: inertia_headers

    expect(response).to redirect_to("/app/accounts/#{account.id}/dashboard")
  end
end
