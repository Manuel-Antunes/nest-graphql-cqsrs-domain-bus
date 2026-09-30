module Inertia
  module Campaigns
    # Live-chat campaigns list. Enforces the same gate the vue-router meta carried
    # (campaigns_livechat_index: permissions ['administrator'], featureFlag 'campaigns')
    # and renders the page shell. NO data props — the page dispatches campaigns/get +
    # labels/get (the job the CampaignsPageRouteView wrapper used to do), unchanged REST/Vuex.
    class LiveChatController < InertiaController
      before_action -> { authorize_page!(permissions: ['administrator'], feature_flag: 'campaigns') }

      def index
        render inertia: 'Campaigns/LiveChat/Index'
      end
    end
  end
end
