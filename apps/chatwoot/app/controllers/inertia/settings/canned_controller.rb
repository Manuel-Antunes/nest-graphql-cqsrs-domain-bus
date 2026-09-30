module Inertia
  module Settings
    class CannedController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage', 'conversation_participating_manage'], feature_flag: 'canned_responses')
      }

      def index
        render inertia: 'Settings/Canned/Index'
      end
    end
  end
end
