require 'rails_helper'

RSpec.describe 'Enterprise Passwords Controller', type: :request do
  let!(:account) { create(:account) }

  describe 'POST /auth/password' do
    def expect_platform_refusal
      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body['errors']).to eq(['Chatwoot is signed into through the platform'])
    end

    context 'with SAML user email' do
      let!(:saml_user) { create(:user, email: 'saml@example.com', provider: 'saml', account: account) }

      it 'is refused: a password is reset on the platform' do
        post user_password_path, params: { email: saml_user.email, redirect_url: 'http://test.host' }, as: :json

        expect_platform_refusal
      end
    end

    context 'with non-SAML user email' do
      let!(:regular_user) { create(:user, email: 'regular@example.com', provider: 'email', account: account) }

      it 'is refused the same way' do
        post user_password_path, params: { email: regular_user.email, redirect_url: 'http://test.host' }, as: :json

        expect_platform_refusal
      end
    end
  end
end
