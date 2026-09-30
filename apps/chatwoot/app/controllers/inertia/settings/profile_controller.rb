module Inertia
  module Settings
    class ProfileController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator', 'agent', 'custom_role'], feature_flag: nil)
      }

      def index
        render inertia: 'Settings/Profile/Index'
      end

      def mfa
        render inertia: 'Settings/Profile/Mfa'
      end
    end
  end
end
