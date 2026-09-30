require 'rails_helper'

RSpec.describe 'Enterprise Audit API', type: :request do
  let!(:account) { create(:account) }
  let!(:user) { create(:user, password: 'Password1!', account: account) }

  describe 'POST /sign_in' do
    def expect_platform_refusal
      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body['errors']).to eq(['Chatwoot is signed into through the platform'])
    end

    context 'with SAML user attempting password login' do
      let(:saml_settings) { create(:account_saml_settings, account: account) }
      let(:saml_user) { create(:user, email: 'saml@example.com', provider: 'saml', account: account) }

      before do
        saml_settings
        saml_user
      end

      it 'is refused before SAML is consulted: signing in is the platform\'s' do
        post new_user_session_url, params: { email: saml_user.email, password: 'Password1!' }, as: :json

        expect_platform_refusal
      end

      it 'refuses an SSO token too, and audits nothing' do
        params = { email: saml_user.email, sso_auth_token: saml_user.generate_sso_auth_token, password: 'Password1!' }

        expect do
          post new_user_session_url, params: params, as: :json
        end.not_to change(Enterprise::AuditLog, :count)

        expect_platform_refusal
      end
    end

    context 'with regular user credentials' do
      it 'refuses valid credentials and audits no sign_in' do
        expect do
          post new_user_session_url, params: { email: user.email, password: 'Password1!' }, as: :json
        end.not_to change(Enterprise::AuditLog, :count)

        expect_platform_refusal
      end

      it 'will not create a sign_in audit event with invalid credentials' do
        expect do
          post new_user_session_url, params: { email: user.email, password: 'invalid' }, as: :json
        end.not_to change(Enterprise::AuditLog, :count)
      end
    end

    context 'with blank email' do
      it 'is refused like any other attempt' do
        post new_user_session_url, params: { email: '', password: 'Password1!' }, as: :json

        expect_platform_refusal
      end
    end
  end

  describe 'DELETE /sign_out' do
    context 'when it is an authenticated user' do
      it 'signs out the user and creates an audit event' do
        expect do
          delete '/auth/sign_out', headers: user.create_new_auth_token
        end.to change(Enterprise::AuditLog, :count).by(1)
        expect(response).to have_http_status(:success)

        user.reload

        expect(user.audits.last.action).to eq('sign_out')
        expect(user.audits.last.associated_id).to eq(account.id)
        expect(user.audits.last.associated_type).to eq('Account')
      end
    end
  end
end
