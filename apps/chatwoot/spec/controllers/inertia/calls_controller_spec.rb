require 'rails_helper'

RSpec.describe 'Inertia calls page', :platform_session, type: :request do
  let(:account) { create(:account) }

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

  def signed_in_as(role)
    create(:user, account: account, role: role).tap do |user|
      user.update!(platform_user_id: "platform-#{role}-#{user.id}")
      allow(BetterAuth::Platform).to receive(:session).and_return('platform_user_id' => user.platform_user_id, 'organization_id' => nil)
    end
  end

  it 'serves the calls dashboard to an administrator' do
    signed_in_as(:administrator)

    get "/app/accounts/#{account.id}/calls", headers: inertia_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['component']).to eq('Calls/Index')
  end

  it 'serves the calls dashboard to an agent, whose list the API scopes to the calls they handled' do
    signed_in_as(:agent)

    get "/app/accounts/#{account.id}/calls", headers: inertia_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['component']).to eq('Calls/Index')
  end
end
