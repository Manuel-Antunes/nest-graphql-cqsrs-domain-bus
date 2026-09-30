module Inertia
  module Settings
    # Multi-route settings group: list + new + edit share one controller, three pages.
    # The MacroEditor component navigates internally via useAppNavigation (dual-mode),
    # and reads the macro id from the URL via useAppNavigation().currentParams.
    class MacrosController < InertiaController
      MACRO_PERMISSIONS = %w[
        agent administrator conversation_manage
        conversation_unassigned_manage conversation_participating_manage
      ].freeze

      before_action lambda {
        authorize_page!(permissions: MACRO_PERMISSIONS, feature_flag: 'macros')
      }

      def index
        render inertia: 'Settings/Macros/Index'
      end

      def new
        render inertia: 'Settings/Macros/Editor'
      end

      def edit
        render inertia: 'Settings/Macros/Editor'
      end
    end
  end
end
