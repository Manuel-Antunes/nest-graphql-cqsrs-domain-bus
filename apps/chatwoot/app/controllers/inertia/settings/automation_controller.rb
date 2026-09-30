module Inertia
  module Settings
    class AutomationController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'automations')
      }

      def index
        render inertia: 'Settings/Automation/Index'
      end
    end
  end
end
