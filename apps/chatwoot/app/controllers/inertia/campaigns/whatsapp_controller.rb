module Inertia
  module Campaigns
    # WhatsApp campaigns list. NOTE the distinct feature flag the vue-router meta carried
    # (campaigns_whatsapp_index: permissions ['administrator'], featureFlag 'whatsapp_campaign').
    class WhatsappController < InertiaController
      before_action -> { authorize_page!(permissions: ['administrator'], feature_flag: 'whatsapp_campaign') }

      def index
        render inertia: 'Campaigns/WhatsApp/Index'
      end
    end
  end
end
