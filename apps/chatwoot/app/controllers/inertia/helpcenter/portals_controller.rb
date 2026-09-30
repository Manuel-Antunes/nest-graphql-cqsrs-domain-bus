module Inertia
  module Helpcenter
    # Multi-route help-center group: the ten named portal routes share one controller.
    # Every page component navigates internally via useAppNavigation (dual-mode) and
    # reads portalSlug/locale/categorySlug/tab/articleSlug/navigationPath from the URL
    # via useAppNavigation().currentParams — so NO data props here, just authorize +
    # render the page shell (docs §2.1). The pages self-fetch via the existing Vuex path.
    #
    # Gates mirror routes/registry.js EXACTLY (help center is full-bleed → AppShell alone,
    # never SettingsWrapper). Two of the routes (portals_index, portals_new) drop the
    # `agent` permission the rest carry, so authorization is resolved per action.
    class PortalsController < InertiaController
      # portals_articles_*, portals_categories_*, portals_locales_index, portals_settings_index
      BASE_PERMISSIONS = %w[administrator agent knowledge_base_manage].freeze
      # portals_index, portals_new
      MANAGE_PERMISSIONS = %w[administrator knowledge_base_manage].freeze
      MANAGE_ACTIONS = %w[index new].freeze

      before_action :authorize_help_center_page!

      # portals_index — landing/redirect shell (reads :navigationPath)
      def index
        render inertia: 'HelpCenter/Portals/Index'
      end

      # portals_new
      def new
        render inertia: 'HelpCenter/PortalNew/Index'
      end

      # portals_articles_index
      def articles_index
        render inertia: 'HelpCenter/Articles/Index'
      end

      # portals_categories_articles_index — same page component (route name drives the
      # isCategoryArticles branch client-side via currentRouteName).
      def categories_articles_index
        render inertia: 'HelpCenter/Articles/Index'
      end

      # portals_articles_new
      def articles_new
        render inertia: 'HelpCenter/ArticleNew/Index'
      end

      # portals_articles_edit
      def articles_edit
        render inertia: 'HelpCenter/ArticleEditor/Index'
      end

      # portals_categories_articles_edit — same editor page component.
      def categories_articles_edit
        render inertia: 'HelpCenter/ArticleEditor/Index'
      end

      # portals_categories_index
      def categories_index
        render inertia: 'HelpCenter/Categories/Index'
      end

      # portals_locales_index
      def locales_index
        render inertia: 'HelpCenter/Locales/Index'
      end

      # portals_settings_index
      def settings_index
        render inertia: 'HelpCenter/Settings/Index'
      end

      private

      def authorize_help_center_page!
        permissions = MANAGE_ACTIONS.include?(action_name) ? MANAGE_PERMISSIONS : BASE_PERMISSIONS
        authorize_page!(permissions: permissions, feature_flag: 'help_center')
      end
    end
  end
end
