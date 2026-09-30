# Server-side mirror of the SPA route guard — dashboard/helper/routeHelpers.js
# `routeIsAccessibleFor`, which gates route ACCESS on `meta.permissions` ONLY.
#
# The `featureFlag` and `installationTypes` in a route's meta govern sidebar VISIBILITY
# (client-side usePolicy.shouldShow, fed by the shared `permissions`/`installationType`
# props) — they were never hard route gates in the SPA. Enforcing them here as hard gates
# over-blocked pages the SPA allowed via direct URL: e.g. an admin opening audit-logs when
# the `audit_logs` feature is off renders in the SPA (permission passes) but got redirected
# under Inertia. So the hard gate checks permissions only; the feature/installation kwargs
# are still accepted (call-site compatibility) but not enforced for access.
module InertiaPageAuthorization
  extend ActiveSupport::Concern

  # True when the current user may ACCESS a page. Mirrors the SPA route guard: permissions
  # only. (feature_flag / installation_types drive visibility, not access — see above.)
  def page_accessible?(permissions: [], feature_flag: nil, installation_types: [])
    check_page_permissions(permissions)
  end

  # Enforce a page's gates; redirect (default: account dashboard) when denied.
  # This is the server analog of routeHelpers.js defaultRedirectPage().
  def authorize_page!(permissions: [], feature_flag: nil, installation_types: [], denied_redirect: nil)
    return if page_accessible?(
      permissions: permissions, feature_flag: feature_flag, installation_types: installation_types
    )

    redirect_to(denied_redirect || default_denied_redirect_path)
  end

  private

  # Matches AccountUser#permissions: ['administrator'] | ['agent'] | custom-role perms + ['custom_role'].
  def current_page_permissions
    Current.account_user&.permissions || []
  end

  # OR semantics: user passes if they hold ANY one required permission. Empty => allowed.
  def check_page_permissions(required)
    return true if required.blank?

    (required.map(&:to_s) & current_page_permissions.map(&:to_s)).any?
  end

  def check_installation_type(allowed)
    return true if allowed.blank?

    allowed.map(&:to_s).include?(current_installation_type)
  end

  def check_feature_flag(flag)
    return true if flag.blank?

    !!Current.account&.feature_enabled?(flag.to_s)
  end

  def current_installation_type
    return 'enterprise' if ChatwootApp.enterprise?

    ENV['DEPLOYMENT_ENV'].to_s == 'cloud' ? 'cloud' : 'community'
  end

  def default_denied_redirect_path
    "/app/accounts/#{params[:account_id]}/dashboard"
  end
end
