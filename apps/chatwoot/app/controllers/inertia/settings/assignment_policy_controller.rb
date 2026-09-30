module Inertia
  module Settings
    # Multi-route settings group: the assignment-policy landing page plus the
    # agent-assignment and agent-capacity list/create/edit flows share one
    # controller and seven pages. The AssignmentPolicy components navigate
    # internally via useAppNavigation (dual-mode) and the Edit pages read the
    # policy id from the URL via useAppNavigation().currentParams. All seven
    # routes carried the same vue-router meta gates
    # (permissions: ['administrator'], featureFlag: 'assignment_v2').
    class AssignmentPolicyController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'assignment_v2')
      }

      def index
        render inertia: 'Settings/AssignmentPolicy/Index'
      end

      def agent_index
        render inertia: 'Settings/AssignmentPolicy/AgentAssignmentIndex'
      end

      def agent_create
        render inertia: 'Settings/AssignmentPolicy/AgentAssignmentCreate'
      end

      def agent_edit
        render inertia: 'Settings/AssignmentPolicy/AgentAssignmentEdit'
      end

      def capacity_index
        render inertia: 'Settings/AssignmentPolicy/AgentCapacityIndex'
      end

      def capacity_create
        render inertia: 'Settings/AssignmentPolicy/AgentCapacityCreate'
      end

      def capacity_edit
        render inertia: 'Settings/AssignmentPolicy/AgentCapacityEdit'
      end
    end
  end
end
