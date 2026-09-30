module Inertia
  module Campaigns
    # Redirect-only route (no page component), mirroring the vue-router
    # campaigns_one_off_index redirect -> campaigns_sms_index. Keeps the same gate
    # the vue-router meta carried (permissions ['administrator'], featureFlag 'campaigns').
    class OneOffController < InertiaController
      before_action -> { authorize_page!(permissions: ['administrator'], feature_flag: 'campaigns') }

      def index
        redirect_to "/app/accounts/#{params[:account_id]}/campaigns/sms"
      end
    end
  end
end
