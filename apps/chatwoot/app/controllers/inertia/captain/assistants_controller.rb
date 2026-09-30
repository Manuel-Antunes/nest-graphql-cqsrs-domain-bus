module Inertia
  module Captain
    # Multi-route captain (AI assistants) group: the named captain routes share
    # one controller. Every page component navigates internally via useAppNavigation
    # (dual-mode) and reads :assistantId / :navigationPath from the URL via
    # useAppNavigation().currentParams — so NO data props here, just authorize + render
    # the page shell (docs §2.1). The pages self-fetch via the existing Vuex path.
    #
    # Captain is a full-bleed view → AppShell ALONE (never SettingsWrapper).
    #
    # Gates mirror routes/registry.js EXACTLY. All routes carry
    # permissions: ['administrator', 'agent'] + installationTypes: ['cloud', 'enterprise'],
    # but the feature flag differs per route:
    #   - captain_integration    → overview, responses, faq suggestions, documents,
    #                              playground, inboxes, settings (basic, system, audience,
    #                              schedule), and the :navigationPath landing.
    #   - captain_integration_v2 → scenarios, guardrails, guidelines.
    #   - custom_tools           → custom tools.
    #   - (no flag)              → the assistants empty-state / create page.
    # So authorization is resolved per action.
    class AssistantsController < InertiaController
      CAPTAIN_PERMISSIONS = %w[administrator agent].freeze
      FAQ_SUGGESTIONS_PERMISSIONS = %w[
        agent administrator conversation_manage conversation_unassigned_manage conversation_participating_manage
      ].freeze
      CAPTAIN_INSTALLATION_TYPES = %w[cloud enterprise].freeze
      # captain_integration_v2-gated pages.
      V2_ACTIONS = %w[scenarios guardrails guidelines].freeze
      CUSTOM_TOOLS_ACTIONS = %w[tools].freeze
      # captain_assistants_create_index carries NO feature flag.
      NO_FLAG_ACTIONS = %w[new_assistant].freeze

      before_action :authorize_captain_page!, except: :responses_pending

      # captain_assistants_index — landing/redirect shell (reads :navigationPath)
      def index
        render inertia: 'Captain/Assistants/Index'
      end

      # captain_assistants_create_index — empty-state / create assistant page
      def new_assistant
        render inertia: 'Captain/AssistantsEmptyState/Index'
      end

      def overview
        render inertia: 'Captain/Overview/Index'
      end

      # captain_assistants_responses_index
      def responses
        render inertia: 'Captain/Responses/Index'
      end

      def faq_suggestions
        render inertia: 'Captain/FaqSuggestions/Index'
      end

      def responses_pending
        path = "/app/accounts/#{params[:account_id]}/captain/#{params[:assistant_id]}/faqs/suggestions"
        redirect_to request.query_string.present? ? "#{path}?#{request.query_string}" : path
      end

      # captain_assistants_documents_index
      def documents
        render inertia: 'Captain/Documents/Index'
      end

      # captain_tools_index
      def tools
        render inertia: 'Captain/Tools/Index'
      end

      # captain_assistants_scenarios_index
      def scenarios
        render inertia: 'Captain/Scenarios/Index'
      end

      # captain_assistants_playground_index
      def playground
        render inertia: 'Captain/Playground/Index'
      end

      # captain_assistants_inboxes_index
      def inboxes
        render inertia: 'Captain/Inboxes/Index'
      end

      # captain_assistants_settings_index
      def settings
        render inertia: 'Captain/Settings/Index'
      end

      def settings_system
        render inertia: 'Captain/SystemSettings/Index'
      end

      def settings_audience
        render inertia: 'Captain/AudienceSettings/Index'
      end

      def settings_schedule
        render inertia: 'Captain/ScheduleSettings/Index'
      end

      # captain_assistants_guardrails_index
      def guardrails
        render inertia: 'Captain/Guardrails/Index'
      end

      # captain_assistants_guidelines_index
      def guidelines
        render inertia: 'Captain/Guidelines/Index'
      end

      private

      def authorize_captain_page!
        authorize_page!(
          permissions: action_name == 'faq_suggestions' ? FAQ_SUGGESTIONS_PERMISSIONS : CAPTAIN_PERMISSIONS,
          feature_flag: feature_flag_for_action,
          installation_types: CAPTAIN_INSTALLATION_TYPES
        )
      end

      def feature_flag_for_action
        return nil if NO_FLAG_ACTIONS.include?(action_name)
        return 'captain_integration_v2' if V2_ACTIONS.include?(action_name)
        return 'custom_tools' if CUSTOM_TOOLS_ACTIONS.include?(action_name)

        'captain_integration'
      end
    end
  end
end
