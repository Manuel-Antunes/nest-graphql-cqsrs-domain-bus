module Inertia
  module Campaigns
    # SMS campaigns list. Same gate as the vue-router meta
    # (campaigns_sms_index: permissions ['administrator'], featureFlag 'campaigns').
    class SmsController < InertiaController
      before_action -> { authorize_page!(permissions: ['administrator'], feature_flag: 'campaigns') }

      def index
        render inertia: 'Campaigns/SMS/Index'
      end
    end
  end
end
