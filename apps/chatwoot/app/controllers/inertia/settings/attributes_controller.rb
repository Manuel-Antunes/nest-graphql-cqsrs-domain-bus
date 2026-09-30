module Inertia
  module Settings
    # Second migrated page (custom attributes). Same thin-shell pattern as labels:
    # authorize with the route's original gates, render the existing component
    # (which fetches its own data via REST). Exists to demonstrate Inertia-native
    # navigation between two Inertia pages (no vue-router, no full reload).
    class AttributesController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'custom_attributes')
      }

      def index
        render inertia: 'Settings/Attributes/Index'
      end
    end
  end
end
