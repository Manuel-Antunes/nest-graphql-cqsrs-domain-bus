module Inertia
  module Settings
    class GeneralController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: nil)
      }

      def index
        render inertia: 'Settings/General/Index'
      end
    end
  end
end
