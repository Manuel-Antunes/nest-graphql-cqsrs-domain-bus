module Inertia
  module Campaigns
    # Redirect-only route (no page component), mirroring the vue-router
    # campaigns_ongoing_index redirect -> campaigns_livechat_index. Keeps the same gate
    # the vue-router meta carried (permissions ['administrator'], featureFlag 'campaigns').
    class OngoingController < InertiaController
      before_action -> { authorize_page!(permissions: ['administrator'], feature_flag: 'campaigns') }

      def index
        redirect_to "/app/accounts/#{params[:account_id]}/campaigns/live_chat"
      end
    end
  end
end
