# Base controller for Inertia-rendered dashboard pages (settings/CRUD migration).
#
# Auth (see docs §4): a single BetterAuth Rack strategy already resolves the user
# from the Better Auth cookie (microfrontend), a forwarded Better Auth JWT, or the
# DeviseTokenAuth token, and sets env['warden']. This controller ADOPTS that
# Warden user into Current.user — the same fix GraphqlController uses — so page
# loads authenticate identically standalone AND embedded in apps/web.
#
# Per the minimal-diff principle (docs §2.1): pages carry NO server-assembled data.
# They keep fetching via the existing REST/Vuex path; controllers only authorize +
# render the page shell and expose cross-cutting shared props.
class InertiaController < ApplicationController
  include SetGlobalConfig
  include InertiaPageAuthorization

  layout 'inertia'

  before_action :set_global_config
  before_action :set_dashboard_scripts
  before_action :authenticate_inertia_user!
  before_action :set_current_account_for_inertia

  inertia_share do
    {
      auth: { user: Current.user&.as_json(only: %i[id name email]) },
      account: {
        id: Current.account&.id,
        features: Current.account&.enabled_features
      },
      permissions: current_page_permissions,
      installationType: current_installation_type,
      platform: { organizationsUrl: ::BetterAuth::Platform.organizations_url }
    }
  end

  private

  # Custom scripts the admin injects (DASHBOARD_SCRIPTS), rendered in the layout —
  # parity with DashboardController. Settings pages are not sensitive paths.
  def set_dashboard_scripts
    @dashboard_scripts = GlobalConfig.get_value('DASHBOARD_SCRIPTS')
  end

  # Resolve Current.user from ANY source (docs §4):
  #   1. DeviseTokenAuth token headers — set by ApplicationController#set_current_user (XHR).
  #   2. Better Auth (Warden) — cookie or forwarded JWT, set by the BetterAuth Rack
  #      strategy on every request (the microfrontend path).
  #   3. The cw_d_session_info cookie — the standalone path: a full-page Inertia GET
  #      doesn't send DeviseTokenAuth headers, so authenticate from the cookie the SPA stores.
  def authenticate_inertia_user!
    Current.user ||= request.env['warden']&.user(scope: :user)
    Current.user ||= user_from_session_cookie
    return if Current.user

    redirect_to '/app/login'
  end

  # Standalone path: the SPA persists the DeviseTokenAuth headers as JSON in the
  # non-HttpOnly cw_d_session_info cookie. Parse it and authenticate.
  def user_from_session_cookie
    raw = cookies['cw_d_session_info']
    return if raw.blank?

    data = parse_session_cookie(raw)
    return if data.blank?

    uid = data['uid']
    client = data['client']
    token = data['access-token']
    return if uid.blank? || client.blank? || token.blank?

    user = User.find_by(uid: uid)
    user if user&.valid_token?(token, client)
  end

  def parse_session_cookie(raw)
    JSON.parse(raw)
  rescue JSON::ParserError
    begin
      JSON.parse(CGI.unescape(raw))
    rescue StandardError
      nil
    end
  end

  # Scope to the URL's account using the adopted Current.user (NOT DeviseTokenAuth's
  # current_user, which is nil on the Better Auth path). Sets Current.account +
  # Current.account_user so the authorization gate can read permissions.
  def set_current_account_for_inertia
    return if performed? # already redirected by authenticate_inertia_user!

    account = Account.find_by(id: params[:account_id])
    return redirect_to('/app/login') unless account

    Current.account = account
    Current.account_user = account.account_users.find_by(user_id: Current.user.id)
    redirect_to '/app/login' unless Current.account_user
  end
end
