module Inertia
  module Companies
    # Inertia-served companies dashboard. Enforces the same gates the vue-router meta
    # carried for `companies_dashboard_index` (see routes/registry.js). NO data props —
    # the page keeps fetching via the companies Pinia store (REST), unchanged.
    class IndexController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator', 'agent'], feature_flag: 'companies', installation_types: ['cloud', 'enterprise'])
      }

      def index
        render inertia: 'Companies/Index'
      end
    end
  end
end
