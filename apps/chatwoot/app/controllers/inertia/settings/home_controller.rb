module Inertia
  module Settings
    # Bare /settings landing. Mirrors the SPA settings_home redirect: a non-custom-role
    # administrator lands on general settings, everyone else on canned responses.
    class HomeController < InertiaController
      def index
        account_id = params[:account_id]
        if Current.account_user&.administrator? && Current.account_user.custom_role_id.nil?
          redirect_to "/app/accounts/#{account_id}/settings/general"
        else
          redirect_to "/app/accounts/#{account_id}/settings/canned-response/list"
        end
      end
    end
  end
end
