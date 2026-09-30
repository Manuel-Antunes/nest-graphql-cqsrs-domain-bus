module Inertia
  module Settings
    class IntegrationsController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'integrations')
      }

      def index
        render inertia: 'Settings/Integrations/Index'
      end

      def dashboard_apps
        render inertia: 'Settings/Integrations/DashboardApps'
      end

      def webhook
        render inertia: 'Settings/Integrations/Webhook'
      end

      def slack
        render inertia: 'Settings/Integrations/Slack'
      end

      def linear
        render inertia: 'Settings/Integrations/Linear'
      end

      def notion
        render inertia: 'Settings/Integrations/Notion'
      end

      def shopify
        render inertia: 'Settings/Integrations/Shopify'
      end

      # settings_applications_integration — generic hooks page keyed by :integration_id.
      # IntegrationHooks.vue requires the integration id as a prop; pass it through.
      def show
        render inertia: 'Settings/Integrations/Hooks', props: { integrationId: params[:integration_id] }
      end
    end
  end
end
