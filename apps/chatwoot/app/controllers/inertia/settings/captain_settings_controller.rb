module Inertia
  module Settings
    class CaptainSettingsController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'captain_integration', installation_types: ['enterprise', 'cloud'])
      }

      def index
        render inertia: 'Settings/CaptainSettings/Index'
      end
    end
  end
end
