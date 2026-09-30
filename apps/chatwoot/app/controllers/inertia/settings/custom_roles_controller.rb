module Inertia
  module Settings
    class CustomRolesController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'custom_roles', installation_types: ['cloud', 'enterprise'])
      }

      def index
        render inertia: 'Settings/CustomRoles/Index'
      end
    end
  end
end
