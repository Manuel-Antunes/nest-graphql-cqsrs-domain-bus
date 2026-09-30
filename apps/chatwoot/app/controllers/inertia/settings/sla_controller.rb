module Inertia
  module Settings
    class SlaController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'sla', installation_types: ['cloud', 'enterprise'])
      }

      def index
        render inertia: 'Settings/Sla/Index'
      end
    end
  end
end
