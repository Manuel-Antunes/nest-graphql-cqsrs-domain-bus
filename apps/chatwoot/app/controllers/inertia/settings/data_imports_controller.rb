module Inertia
  module Settings
    class DataImportsController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'data_import')
      }

      def index
        render inertia: 'Settings/DataImports/Index'
      end

      def show
        render inertia: 'Settings/DataImports/Show'
      end
    end
  end
end
