require 'rails_helper'

RSpec.describe 'Inertia help center article pages', :platform_session, type: :request do
  let(:account) { create(:account) }
  let(:administrator) do
    create(:user, account: account, role: :administrator).tap { |admin| admin.update!(platform_user_id: 'platform-administrator') }
  end
  let(:agent) do
    create(:user, account: account, role: :agent).tap { |member| member.update!(platform_user_id: 'platform-agent') }
  end
  let(:category_articles_path) { "/app/accounts/#{account.id}/portals/handbook/en/categories/billing/articles" }

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

  def sign_in_as(user)
    allow(BetterAuth::Platform).to receive(:session).and_return('platform_user_id' => user.platform_user_id, 'organization_id' => nil)
  end

  it 'opens the new article editor inside a category for an administrator' do
    sign_in_as(administrator)

    get "#{category_articles_path}/new", headers: inertia_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['component']).to eq('HelpCenter/ArticleNew/Index')
  end

  it 'opens the new article editor inside a category for an agent' do
    sign_in_as(agent)

    get "#{category_articles_path}/new", headers: inertia_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['component']).to eq('HelpCenter/ArticleNew/Index')
  end

  it 'still opens an article of the category in the editor' do
    sign_in_as(administrator)

    get "#{category_articles_path}/getting-started", headers: inertia_headers

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body['component']).to eq('HelpCenter/ArticleEditor/Index')
  end
end
