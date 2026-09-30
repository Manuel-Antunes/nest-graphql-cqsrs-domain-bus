module Inertia
  module Settings
    class TemplatesController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'])
      }

      def index
        render inertia: 'Settings/Templates/Index'
      end
    end
  end
end
