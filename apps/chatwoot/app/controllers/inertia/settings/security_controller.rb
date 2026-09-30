module Inertia
  module Settings
    class SecurityController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'saml', installation_types: ['cloud', 'enterprise'])
      }

      def index
        render inertia: 'Settings/Security/Index'
      end
    end
  end
end
