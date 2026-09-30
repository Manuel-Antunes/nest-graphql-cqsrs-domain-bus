module Inertia
  module Settings
    class AgentsController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'agent_management')
      }

      def list
        render inertia: 'Settings/Agents/Index'
      end
    end
  end
end
