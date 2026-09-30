module Inertia
  module Settings
    class NotificationsController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator', 'agent', 'custom_role'], feature_flag: nil)
      }

      def index
        render inertia: 'Settings/Notifications/Index'
      end
    end
  end
end
