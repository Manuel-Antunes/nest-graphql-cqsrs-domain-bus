require 'rails_helper'

RSpec.describe 'Inertia captain assistant pages', :platform_session, type: :request do
  let(:account) { create(:account) }
  let(:administrator) do
    create(:user, account: account, role: :administrator).tap { |admin| admin.update!(platform_user_id: 'platform-administrator') }
  end
  let(:agent) do
    create(:user, account: account, role: :agent).tap { |member| member.update!(platform_user_id: 'platform-agent') }
  end
  let(:assistant_path) { "/app/accounts/#{account.id}/captain/1" }

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

  {
    'overview' => 'Captain/Overview/Index',
    'faqs/suggestions' => 'Captain/FaqSuggestions/Index',
    'settings/system' => 'Captain/SystemSettings/Index',
    'settings/audience' => 'Captain/AudienceSettings/Index',
    'settings/schedule' => 'Captain/ScheduleSettings/Index'
  }.each do |page, component|
    it "renders #{component} for an administrator" do
      sign_in_as(administrator)

      get "#{assistant_path}/#{page}", headers: inertia_headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['component']).to eq(component)
    end

    it "renders #{component} for an agent" do
      sign_in_as(agent)

      get "#{assistant_path}/#{page}", headers: inertia_headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['component']).to eq(component)
    end
  end

  it 'sends the pending FAQs address to the FAQ suggestions screen, query included' do
    sign_in_as(administrator)

    get "#{assistant_path}/faqs/pending?page=2&search=refund", headers: inertia_headers

    expect(response).to redirect_to("#{assistant_path}/faqs/suggestions?page=2&search=refund")
  end
end
