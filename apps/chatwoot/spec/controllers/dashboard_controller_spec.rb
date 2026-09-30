require 'rails_helper'

describe '/app/login', type: :request do
  let(:agent) { create(:user, account: create(:account), role: :agent).tap { |user| user.update!(platform_user_id: 'platform-agent') } }

  def platform_cookie
    token = 'session-token'
    signature = Base64.strict_encode64(OpenSSL::HMAC.digest('SHA256', BetterAuth::SessionCookie.secret, token))
    "better-auth.session_token=#{CGI.escape("#{token}.#{signature}")}"
  end

  context 'without a platform session' do
    it 'sends the visitor to the platform sign-in' do
      with_modified_env PLATFORM_SIGN_IN_URL: 'https://platform.example/auth/sign-in' do
        get '/app/login'
        expect(response).to redirect_to('https://platform.example/auth/sign-in')
      end
    end
  end

  context 'with a platform session' do
    before do
      allow(BetterAuth::Platform).to receive(:session).and_return('platform_user_id' => agent.platform_user_id, 'organization_id' => nil)
    end

    it 'sends the agent past the login page, to the dashboard' do
      get '/app/login', headers: { 'Cookie' => platform_cookie }
      expect(response).to redirect_to('/app')
    end

    it 'still renders the auth pages of the dashboard' do
      get '/app/auth/password/edit', headers: { 'Cookie' => platform_cookie }
      expect(response).to have_http_status(:success)
    end

    it 'returns not acceptable for JSON with error message' do
      get '/app/auth/password/edit', headers: { 'Cookie' => platform_cookie, 'Accept' => 'application/json' }
      expect(response).to have_http_status(:not_acceptable)
      expect(response.parsed_body).to eq({ 'error' => 'Please use API routes instead of dashboard routes for JSON requests' })
    end
  end

  # Routes are loaded once on app start
  # hence Rails.application.reload_routes! is used in this spec
  # ref : https://stackoverflow.com/a/63584877/939299
  context 'with CW_API_ONLY_SERVER true' do
    it 'returns 404' do
      with_modified_env CW_API_ONLY_SERVER: 'true' do
        Rails.application.reload_routes!
        get '/app/login'
        expect(response).to have_http_status(:not_found)
      end
      Rails.application.reload_routes!
    end
  end
end
