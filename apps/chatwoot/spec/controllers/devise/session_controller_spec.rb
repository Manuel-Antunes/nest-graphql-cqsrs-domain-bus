require 'rails_helper'

RSpec.describe 'Session', type: :request do
  describe 'POST /auth/sign_in' do
    let!(:account) { create(:account) }
    let!(:user) { create(:user, password: 'Password1!', account: account) }

    def expect_platform_refusal
      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body['errors']).to eq(['Chatwoot is signed into through the platform'])
    end

    it 'refuses valid credentials: Chatwoot is signed into through the platform' do
      post new_user_session_url, params: { email: user.email, password: 'Password1!' }, as: :json

      expect_platform_refusal
    end

    it 'refuses invalid credentials the same way' do
      post new_user_session_url, params: { email: 'invalid@invalid.com', password: 'invalid' }, as: :json

      expect_platform_refusal
    end

    it 'refuses an sso auth token' do
      post new_user_session_url, params: { email: user.email, sso_auth_token: user.generate_sso_auth_token }, as: :json

      expect_platform_refusal
    end
  end

  describe 'GET /auth/sign_in' do
    it 'redirects to the frontend login page with error' do
      get new_user_session_url

      expect(response).to redirect_to(%r{/app/login\?error=access-denied$})
    end
  end
end
