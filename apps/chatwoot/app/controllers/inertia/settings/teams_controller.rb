module Inertia
  module Settings
    # Multi-route settings group: the team create/edit wizard. One controller,
    # seven pages (list + the new/agents/finish create flow + the edit/agents/finish
    # edit flow). The Teams components navigate internally via useAppNavigation
    # (dual-mode) and the wizard steps read the team id from the URL via
    # useAppNavigation().currentParams. All seven routes carried the same vue-router
    # meta gates (permissions: ['administrator'], featureFlag: 'team_management').
    class TeamsController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'team_management')
      }

      def list
        render inertia: 'Settings/Teams/Index'
      end

      def new
        render inertia: 'Settings/Teams/New'
      end

      def add_agents
        render inertia: 'Settings/Teams/AddAgents'
      end

      def finish
        render inertia: 'Settings/Teams/Finish'
      end

      def edit
        render inertia: 'Settings/Teams/Edit'
      end

      def edit_members
        render inertia: 'Settings/Teams/EditMembers'
      end

      def edit_finish
        render inertia: 'Settings/Teams/EditFinish'
      end
    end
  end
end
