module Inertia
  # Entry point for root "/" and "/app" (replaces the vue-router SPA's client-side
  # "redirect to my account dashboard" bootstrap). Reuses InertiaController's auth
  # resolution: authenticate_inertia_user! sets Current.user from Warden / the
  # cw_d_session_info cookie and redirects to /app/login when unauthenticated. There is
  # no :account_id in the URL, so the account-scoping gate is skipped.
  class LandingController < InertiaController
    skip_before_action :set_current_account_for_inertia

    def index
      account_id = Current.user.account_users.first&.account_id
      if account_id
        redirect_to "/app/accounts/#{account_id}/dashboard"
      else
        redirect_to '/app/no-accounts'
      end
    end
  end
end
