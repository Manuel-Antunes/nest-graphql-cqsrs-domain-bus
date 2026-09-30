module Inertia
  module Settings
    class AgentBotsController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'agent_bots')
      }

      def index
        render inertia: 'Settings/AgentBots/Index'
      end
    end
  end
end
