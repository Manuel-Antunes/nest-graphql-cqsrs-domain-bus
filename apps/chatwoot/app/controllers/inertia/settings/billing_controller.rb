module Inertia
  module Settings
    class BillingController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: nil, installation_types: ['cloud'])
      }

      def index
        render inertia: 'Settings/Billing/Index'
      end
    end
  end
end
