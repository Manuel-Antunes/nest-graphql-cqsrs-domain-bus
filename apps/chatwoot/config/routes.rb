Rails.application.routes.draw do
  # TODO: add authorization to this route and expose it in production
  # See https://graphql-ruby.org/pro/dashboard.html#authorizing-the-dashboard
  if Rails.env.development?
    mount GraphQL::Dashboard, at: "/graphql/dashboard", schema: "ChatwootSchema"
  end

  if Rails.env.development?
    mount GraphiQL::Rails::Engine, at: "/graphiql", graphql_path: "/graphql"
  end
  post "/graphql", to: "graphql#execute"
  # AUTH STARTS
  mount_devise_token_auth_for 'User', at: 'auth', controllers: {
    confirmations: 'devise_overrides/confirmations',
    passwords: 'devise_overrides/passwords',
    sessions: 'devise_overrides/sessions',
    token_validations: 'devise_overrides/token_validations',
    omniauth_callbacks: 'devise_overrides/omniauth_callbacks'
  }, via: [:get, :post]

  ## renders the frontend paths only if its not an api only server
  if ActiveModel::Type::Boolean.new.cast(ENV.fetch('CW_API_ONLY_SERVER', false))
    root to: 'api#index'
  else
    root to: 'inertia/landing#index'

    # --- Inertia-migrated dashboard pages (must precede the /app catch-all) ---
    # See docs/chatwoot-inertia-migration-plan.md. Each migrated path is listed
    # here; everything else falls through to the vue-router SPA below.
    get '/app/accounts/:account_id/settings/labels/list', to: 'inertia/settings/labels#index'
    get '/app/accounts/:account_id/settings/custom-attributes/list', to: 'inertia/settings/attributes#index'
    get '/app/accounts/:account_id/settings/automation/list', to: 'inertia/settings/automation#index'
    get '/app/accounts/:account_id/settings/agent-bots', to: 'inertia/settings/agent_bots#index'
    get '/app/accounts/:account_id/settings/canned-response/list', to: 'inertia/settings/canned#index'
    get '/app/accounts/:account_id/settings/general', to: 'inertia/settings/general#index'
    get '/app/accounts/:account_id/settings/audit-logs/list', to: 'inertia/settings/audit_logs#index'
    get '/app/accounts/:account_id/settings/sla/list', to: 'inertia/settings/sla#index'
    get '/app/accounts/:account_id/settings/custom-roles/list', to: 'inertia/settings/custom_roles#index'
    get '/app/accounts/:account_id/settings/security', to: 'inertia/settings/security#index'
    get '/app/accounts/:account_id/notifications', to: 'inertia/settings/notifications#index'
    get '/app/accounts/:account_id/profile/settings', to: 'inertia/settings/profile#index'
    get '/app/accounts/:account_id/profile/mfa', to: 'inertia/settings/profile#mfa'
    get '/app/accounts/:account_id/settings/agents', to: redirect('/app/accounts/%{account_id}/settings/agents/list')
    get '/app/accounts/:account_id/settings/agents/list', to: 'inertia/settings/agents#list'
    get '/app/accounts/:account_id/settings/integrations', to: 'inertia/settings/integrations#index'
    # Integration sub-pages — named ones must precede the generic :integration_id route.
    get '/app/accounts/:account_id/settings/integrations/dashboard_apps', to: 'inertia/settings/integrations#dashboard_apps'
    get '/app/accounts/:account_id/settings/integrations/webhook', to: 'inertia/settings/integrations#webhook'
    get '/app/accounts/:account_id/settings/integrations/slack', to: 'inertia/settings/integrations#slack'
    get '/app/accounts/:account_id/settings/integrations/linear', to: 'inertia/settings/integrations#linear'
    get '/app/accounts/:account_id/settings/integrations/notion', to: 'inertia/settings/integrations#notion'
    get '/app/accounts/:account_id/settings/integrations/shopify', to: 'inertia/settings/integrations#shopify'
    get '/app/accounts/:account_id/settings/integrations/:integration_id', to: 'inertia/settings/integrations#show'
    get '/app/accounts/:account_id/settings/captain', to: 'inertia/settings/captain_settings#index'
    get '/app/accounts/:account_id/settings/billing', to: 'inertia/settings/billing#index'
    get '/app/accounts/:account_id/settings/macros', to: 'inertia/settings/macros#index'
    get '/app/accounts/:account_id/settings/macros/new', to: 'inertia/settings/macros#new'
    get '/app/accounts/:account_id/settings/macros/:macro_id/edit', to: 'inertia/settings/macros#edit'
    get '/app/accounts/:account_id/settings/assignment-policy/index', to: 'inertia/settings/assignment_policy#index'
    get '/app/accounts/:account_id/settings/assignment-policy/assignment', to: 'inertia/settings/assignment_policy#agent_index'
    get '/app/accounts/:account_id/settings/assignment-policy/assignment/create', to: 'inertia/settings/assignment_policy#agent_create'
    get '/app/accounts/:account_id/settings/assignment-policy/assignment/edit/:id', to: 'inertia/settings/assignment_policy#agent_edit'
    get '/app/accounts/:account_id/settings/assignment-policy/capacity', to: 'inertia/settings/assignment_policy#capacity_index'
    get '/app/accounts/:account_id/settings/assignment-policy/capacity/create', to: 'inertia/settings/assignment_policy#capacity_create'
    get '/app/accounts/:account_id/settings/assignment-policy/capacity/edit/:id', to: 'inertia/settings/assignment_policy#capacity_edit'
    get '/app/accounts/:account_id/campaigns/live_chat', to: 'inertia/campaigns/live_chat#index'
    get '/app/accounts/:account_id/campaigns/sms', to: 'inertia/campaigns/sms#index'
    get '/app/accounts/:account_id/campaigns/whatsapp', to: 'inertia/campaigns/whatsapp#index'
    get '/app/accounts/:account_id/campaigns/ongoing', to: 'inertia/campaigns/ongoing#index'
    get '/app/accounts/:account_id/campaigns/one_off', to: 'inertia/campaigns/one_off#index'
    get '/app/accounts/:account_id/companies', to: 'inertia/companies/index#index'
    get '/app/accounts/:account_id/search/:tab', to: 'inertia/search/index#index'
    get '/app/accounts/:account_id/search', to: 'inertia/search/index#index'
    get '/app/accounts/:account_id/contacts', to: 'inertia/contacts/index#index'
    get '/app/accounts/:account_id/contacts/active', to: 'inertia/contacts/index#active'
    get '/app/accounts/:account_id/contacts/segments/:segment_id', to: 'inertia/contacts/index#segments'
    get '/app/accounts/:account_id/contacts/labels/:label', to: 'inertia/contacts/index#labels'
    get '/app/accounts/:account_id/contacts/:contact_id', to: 'inertia/contacts/manage_view#edit'
    get '/app/accounts/:account_id/contacts/:contact_id/segments/:segment_id', to: 'inertia/contacts/manage_view#edit_segment'
    get '/app/accounts/:account_id/contacts/:contact_id/labels/:label', to: 'inertia/contacts/manage_view#edit_label'
    get '/app/accounts/:account_id/settings/teams/list', to: 'inertia/settings/teams#list'
    get '/app/accounts/:account_id/settings/teams/new', to: 'inertia/settings/teams#new'
    get '/app/accounts/:account_id/settings/teams/new/:team_id/agents', to: 'inertia/settings/teams#add_agents'
    get '/app/accounts/:account_id/settings/teams/new/:team_id/finish', to: 'inertia/settings/teams#finish'
    get '/app/accounts/:account_id/settings/teams/:team_id/edit', to: 'inertia/settings/teams#edit'
    get '/app/accounts/:account_id/settings/teams/:team_id/edit/agents', to: 'inertia/settings/teams#edit_members'
    get '/app/accounts/:account_id/settings/teams/:team_id/edit/finish', to: 'inertia/settings/teams#edit_finish'
    get '/app/accounts/:account_id/portals/new', to: 'inertia/helpcenter/portals#new'
    get '/app/accounts/:account_id/portals/:portal_slug/locales', to: 'inertia/helpcenter/portals#locales_index'
    get '/app/accounts/:account_id/portals/:portal_slug/settings', to: 'inertia/helpcenter/portals#settings_index'
    get '/app/accounts/:account_id/portals/:portal_slug/:locale/categories/:category_slug/articles/:article_slug', to: 'inertia/helpcenter/portals#categories_articles_edit'
    get '/app/accounts/:account_id/portals/:portal_slug/:locale/categories/:category_slug/articles', to: 'inertia/helpcenter/portals#categories_articles_index'
    get '/app/accounts/:account_id/portals/:portal_slug/:locale/categories', to: 'inertia/helpcenter/portals#categories_index'
    get '/app/accounts/:account_id/portals/:portal_slug/:locale(/:category_slug)/articles/new', to: 'inertia/helpcenter/portals#articles_new'
    get '/app/accounts/:account_id/portals/:portal_slug/:locale(/:category_slug)/articles(/:tab)/edit/:article_slug', to: 'inertia/helpcenter/portals#articles_edit'
    get '/app/accounts/:account_id/portals/:portal_slug/:locale(/:category_slug)/articles(/:tab)', to: 'inertia/helpcenter/portals#articles_index'
    get '/app/accounts/:account_id/portals/:navigation_path', to: 'inertia/helpcenter/portals#index'
    get '/app/accounts/:account_id/reports/overview', to: 'inertia/reports#account_overview'
    get '/app/accounts/:account_id/reports/conversation', to: 'inertia/reports#conversation'
    get '/app/accounts/:account_id/reports/agent', to: 'inertia/reports#agent'
    get '/app/accounts/:account_id/reports/inboxes', to: 'inertia/reports#inbox'
    get '/app/accounts/:account_id/reports/label', to: 'inertia/reports#label'
    get '/app/accounts/:account_id/reports/teams', to: 'inertia/reports#team'
    get '/app/accounts/:account_id/reports/sla', to: 'inertia/reports#sla'
    get '/app/accounts/:account_id/reports/csat', to: 'inertia/reports#csat'
    get '/app/accounts/:account_id/reports/bot', to: 'inertia/reports#bot'
    get '/app/accounts/:account_id/reports/agents_overview', to: 'inertia/reports#agent_overview'
    get '/app/accounts/:account_id/reports/agents/:id', to: 'inertia/reports#agent_show'
    get '/app/accounts/:account_id/reports/inboxes_overview', to: 'inertia/reports#inbox_overview'
    get '/app/accounts/:account_id/reports/inboxes/:id', to: 'inertia/reports#inbox_show'
    get '/app/accounts/:account_id/reports/teams_overview', to: 'inertia/reports#team_overview'
    get '/app/accounts/:account_id/reports/teams/:id', to: 'inertia/reports#team_show'
    get '/app/accounts/:account_id/reports/labels_overview', to: 'inertia/reports#label_overview'
    get '/app/accounts/:account_id/reports/labels/:id', to: 'inertia/reports#label_show'
    get '/app/accounts/:account_id/captain/assistants', to: 'inertia/captain/assistants#new_assistant'
    get '/app/accounts/:account_id/captain/:assistant_id/faqs/pending', to: 'inertia/captain/assistants#responses_pending'
    get '/app/accounts/:account_id/captain/:assistant_id/faqs', to: 'inertia/captain/assistants#responses'
    get '/app/accounts/:account_id/captain/:assistant_id/documents', to: 'inertia/captain/assistants#documents'
    get '/app/accounts/:account_id/captain/:assistant_id/tools', to: 'inertia/captain/assistants#tools'
    get '/app/accounts/:account_id/captain/:assistant_id/scenarios', to: 'inertia/captain/assistants#scenarios'
    get '/app/accounts/:account_id/captain/:assistant_id/playground', to: 'inertia/captain/assistants#playground'
    get '/app/accounts/:account_id/captain/:assistant_id/inboxes', to: 'inertia/captain/assistants#inboxes'
    get '/app/accounts/:account_id/captain/:assistant_id/settings/guardrails', to: 'inertia/captain/assistants#guardrails'
    get '/app/accounts/:account_id/captain/:assistant_id/settings/guidelines', to: 'inertia/captain/assistants#guidelines'
    get '/app/accounts/:account_id/captain/:assistant_id/settings', to: 'inertia/captain/assistants#settings'
    get '/app/accounts/:account_id/captain/:navigation_path', to: 'inertia/captain/assistants#index'
    get '/app/accounts/:account_id/settings/inboxes/list', to: 'inertia/settings/inbox#list'
    get '/app/accounts/:account_id/settings/inboxes/new', to: 'inertia/settings/inbox#new'
    get '/app/accounts/:account_id/settings/inboxes/new/:inbox_id/agents', to: 'inertia/settings/inbox#add_agents'
    get '/app/accounts/:account_id/settings/inboxes/new/:inbox_id/finish', to: 'inertia/settings/inbox#finish'
    get '/app/accounts/:account_id/settings/inboxes/new/:sub_page', to: 'inertia/settings/inbox#page_channel'
    get '/app/accounts/:account_id/settings/inboxes/:inbox_id(/:tab)', to: 'inertia/settings/inbox#show'
    # Conversation / inbox real-time views (ConversationView verified rendering under Inertia).
    get '/app/accounts/:account_id/dashboard', to: 'inertia/conversations#home'
    get '/app/accounts/:account_id/conversations/:conversation_id', to: 'inertia/conversations#inbox_conversation'
    get '/app/accounts/:account_id/inbox/:inbox_id/conversations/:conversation_id', to: 'inertia/conversations#conversation_through_inbox'
    get '/app/accounts/:account_id/inbox/:inbox_id', to: 'inertia/conversations#inbox_dashboard'
    get '/app/accounts/:account_id/label/:label/conversations/:conversation_id', to: 'inertia/conversations#conversations_through_label'
    get '/app/accounts/:account_id/label/:label', to: 'inertia/conversations#label_conversations'
    get '/app/accounts/:account_id/team/:teamId/conversations/:conversationId', to: 'inertia/conversations#conversations_through_team'
    get '/app/accounts/:account_id/team/:teamId', to: 'inertia/conversations#team_conversations'
    get '/app/accounts/:account_id/custom_view/:id/conversations/:conversation_id', to: 'inertia/conversations#conversations_through_folders'
    get '/app/accounts/:account_id/custom_view/:id', to: 'inertia/conversations#folder_conversations'
    get '/app/accounts/:account_id/mentions/conversations/:conversationId', to: 'inertia/conversations#conversation_through_mentions'
    get '/app/accounts/:account_id/mentions/conversations', to: 'inertia/conversations#conversation_mentions'
    get '/app/accounts/:account_id/unattended/conversations/:conversationId', to: 'inertia/conversations#conversation_through_unattended'
    get '/app/accounts/:account_id/unattended/conversations', to: 'inertia/conversations#conversation_unattended'
    get '/app/accounts/:account_id/participating/conversations/:conversationId', to: 'inertia/conversations#conversation_through_participating'
    get '/app/accounts/:account_id/participating/conversations', to: 'inertia/conversations#conversation_participating'
    get '/app/accounts/:account_id/inbox-view', to: 'inertia/inbox_view#index'
    get '/app/accounts/:account_id/inbox-view/:type/:id', to: 'inertia/inbox_view#conversation'

    get '/app/accounts/:account_id/suspended', to: 'inertia/suspended#index'
    get '/app/no-accounts', to: 'inertia/no_accounts#index'

    # Help Center (portals) — controller: inertia/helpcenter/portals_controller.rb.
    # Order matters (Rails matches top-down): the more specific/literal paths must precede
    # the single-segment :navigation_path catch-all, and articles/new + .../edit/:slug must
    # precede the generic articles(/:tab) index. Optional vue-router `:x?` → Rails `(/:x)`.
    scope '/app/accounts/:account_id/portals', controller: 'inertia/helpcenter/portals' do
      get '/new', action: :new
      get '/:portal_slug/:locale(/:category_slug)/articles/new', action: :articles_new
      get '/:portal_slug/:locale(/:category_slug)/articles(/:tab)/edit/:article_slug', action: :articles_edit
      get '/:portal_slug/:locale/categories/:category_slug/articles/:article_slug', action: :categories_articles_edit
      get '/:portal_slug/:locale/categories/:category_slug/articles', action: :categories_articles_index
      get '/:portal_slug/:locale/categories', action: :categories_index
      get '/:portal_slug/:locale(/:category_slug)/articles(/:tab)', action: :articles_index
      get '/:portal_slug/locales', action: :locales_index
      get '/:portal_slug/settings', action: :settings_index
      get '/:navigation_path', action: :index
    end

    # Parent "wrapper" routes that only redirect to their (Inertia) child page — the SPA
    # did these client-side; server redirects replace them so nothing needs the SPA.
    get '/app/accounts/:account_id/settings/labels', to: redirect('/app/accounts/%{account_id}/settings/labels/list')
    get '/app/accounts/:account_id/settings/sla', to: redirect('/app/accounts/%{account_id}/settings/sla/list')
    get '/app/accounts/:account_id/profile', to: redirect('/app/accounts/%{account_id}/profile/settings')
    # settings home redirect is role-conditional (admin -> general, else -> canned) so it
    # needs a controller, not a static redirect.
    get '/app/accounts/:account_id/settings', to: 'inertia/settings/home#index'

    get '/app', to: 'inertia/landing#index'
    get '/app/*params', to: 'dashboard#index'
    get '/app/accounts/:account_id/settings/inboxes/new/twitter', to: 'dashboard#index', as: 'app_new_twitter_inbox'
    get '/app/accounts/:account_id/settings/inboxes/new/microsoft', to: 'dashboard#index', as: 'app_new_microsoft_inbox'
    get '/app/accounts/:account_id/settings/inboxes/new/instagram', to: 'dashboard#index', as: 'app_new_instagram_inbox'
    get '/app/accounts/:account_id/settings/inboxes/new/tiktok', to: 'dashboard#index', as: 'app_new_tiktok_inbox'
    get '/app/accounts/:account_id/settings/inboxes/new/:inbox_id/agents', to: 'dashboard#index', as: 'app_twitter_inbox_agents'
    get '/app/accounts/:account_id/settings/inboxes/new/:inbox_id/agents', to: 'dashboard#index', as: 'app_email_inbox_agents'
    get '/app/accounts/:account_id/settings/inboxes/new/:inbox_id/agents', to: 'dashboard#index', as: 'app_instagram_inbox_agents'
    get '/app/accounts/:account_id/settings/inboxes/new/:inbox_id/agents', to: 'dashboard#index', as: 'app_tiktok_inbox_agents'
    get '/app/accounts/:account_id/settings/inboxes/:inbox_id', to: 'dashboard#index', as: 'app_instagram_inbox_settings'
    get '/app/accounts/:account_id/settings/inboxes/:inbox_id', to: 'dashboard#index', as: 'app_tiktok_inbox_settings'
    get '/app/accounts/:account_id/settings/inboxes/:inbox_id', to: 'dashboard#index', as: 'app_email_inbox_settings'

    resource :widget, only: [:show]
    namespace :survey do
      resources :responses, only: [:show]
    end
    resource :slack_uploads, only: [:show]
  end

  get '/api', to: 'api#index'
  namespace :api, defaults: { format: 'json' } do
    namespace :v1 do
      # ----------------------------------
      # start of account scoped api routes
      resources :accounts, only: [:create, :show, :update] do
        member do
          post :update_active_at
          get :cache_keys
        end

        scope module: :accounts do
          namespace :actions do
            resource :contact_merge, only: [:create]
          end
          resource :bulk_actions, only: [:create]
          resources :agents, only: [:index, :create, :update, :destroy] do
            post :bulk_create, on: :collection
          end
          namespace :captain do
            resource :preferences, only: [:show, :update]
            resources :assistants do
              member do
                post :playground
              end
              collection do
                get :tools
              end
              resources :inboxes, only: [:index, :create, :destroy], param: :inbox_id
              resources :scenarios
            end
            resources :assistant_responses
            resources :bulk_actions, only: [:create]
            resources :copilot_threads, only: [:index, :create] do
              resources :copilot_messages, only: [:index, :create]
            end
            resources :custom_tools
            resources :documents, only: [:index, :show, :create, :destroy]
          end
          resource :saml_settings, only: [:show, :create, :update, :destroy]
          resources :agent_bots, only: [:index, :create, :show, :update, :destroy] do
            delete :avatar, on: :member
            post :reset_access_token, on: :member
          end
          resources :contact_inboxes, only: [] do
            collection do
              post :filter
            end
          end
          resources :assignable_agents, only: [:index]
          resource :audit_logs, only: [:show]
          resources :callbacks, only: [] do
            collection do
              post :register_facebook_page
              get :register_facebook_page
              post :facebook_pages
              post :reauthorize_page
            end
          end
          resources :canned_responses, only: [:index, :create, :update, :destroy]
          resources :automation_rules, only: [:index, :create, :show, :update, :destroy] do
            post :clone
          end
          resources :macros, only: [:index, :create, :show, :update, :destroy] do
            post :execute, on: :member
          end
          resources :sla_policies, only: [:index, :create, :show, :update, :destroy]
          resources :custom_roles, only: [:index, :create, :show, :update, :destroy]
          resources :agent_capacity_policies, only: [:index, :create, :show, :update, :destroy] do
            scope module: :agent_capacity_policies do
              resources :users, only: [:index, :create, :destroy]
              resources :inbox_limits, only: [:create, :update, :destroy]
            end
          end
          resources :campaigns, only: [:index, :create, :show, :update, :destroy]
          resources :dashboard_apps, only: [:index, :show, :create, :update, :destroy]
          namespace :channels do
            resource :twilio_channel, only: [:create]
          end
          resources :conversations, only: [:index, :create, :show, :update, :destroy] do
            collection do
              get :meta
              get :search
              post :filter
            end
            scope module: :conversations do
              resources :messages, only: [:index, :create, :destroy, :update] do
                member do
                  post :translate
                  post :retry
                end
              end
              resources :assignments, only: [:create]
              resources :labels, only: [:create, :index]
              resource :participants, only: [:show, :create, :update, :destroy]
              resource :direct_uploads, only: [:create]
              resource :draft_messages, only: [:show, :update, :destroy]
            end
            member do
              post :mute
              post :unmute
              post :transcript
              post :toggle_status
              post :toggle_priority
              post :toggle_typing_status
              post :update_last_seen
              post :unread
              post :custom_attributes
              get :attachments
              get :inbox_assistant
              get :reporting_events if ChatwootApp.enterprise?
            end
          end

          resources :search, only: [:index] do
            collection do
              get :conversations
              get :messages
              get :contacts
              get :articles
            end
          end

          resources :companies, only: [:index, :show, :create, :update, :destroy] do
            collection do
              get :search
            end
          end
          resources :contacts, only: [:index, :show, :update, :create, :destroy] do
            collection do
              get :active
              get :search
              post :filter
              post :import
              post :export
            end
            member do
              get :contactable_inboxes
              post :destroy_custom_attributes
              delete :avatar
            end
            scope module: :contacts do
              resources :conversations, only: [:index]
              resources :contact_inboxes, only: [:create]
              resources :labels, only: [:create, :index]
              resources :notes
              post :call, on: :member, to: 'calls#create' if ChatwootApp.enterprise?
            end
          end
          resources :csat_survey_responses, only: [:index] do
            collection do
              get :metrics
              get :download
            end
            member do
              patch :update if ChatwootApp.enterprise?
            end
          end
          resources :applied_slas, only: [:index] do
            collection do
              get :metrics
              get :download
            end
          end
          resources :reporting_events, only: [:index] if ChatwootApp.enterprise?
          resources :custom_attribute_definitions, only: [:index, :show, :create, :update, :destroy]
          resources :custom_filters, only: [:index, :show, :create, :update, :destroy]
          resources :inboxes, only: [:index, :show, :create, :update, :destroy] do
            get :assignable_agents, on: :member
            get :campaigns, on: :member
            get :agent_bot, on: :member
            post :set_agent_bot, on: :member
            delete :avatar, on: :member
            post :sync_templates, on: :member
            post :resync_evolution_api, on: :member
            post :evolution_connect, on: :member
            get :evolution_connection_state, on: :member
            get :health, on: :member
            if ChatwootApp.enterprise?
              resource :conference, only: %i[create destroy], controller: 'conference' do
                get :token, on: :member
              end
            end

            resource :csat_template, only: [:show, :create], controller: 'inbox_csat_templates'
          end

          resources :inbox_members, only: [:create, :show], param: :inbox_id do
            collection do
              delete :destroy
              patch :update
            end
          end
          resources :labels, only: [:index, :show, :create, :update, :destroy]

          resources :notifications, only: [:index, :update, :destroy] do
            collection do
              post :read_all
              get :unread_count
              post :destroy_all
            end
            member do
              post :snooze
              post :unread
            end
          end
          resource :notification_settings, only: [:show, :update]

          resources :teams do
            resources :team_members, only: [:index, :create] do
              collection do
                delete :destroy
                patch :update
              end
            end
          end

          # Assignment V2 Routes
          resources :assignment_policies do
            resources :inboxes, only: [:index, :create, :destroy], module: :assignment_policies
          end

          resources :inboxes, only: [] do
            resource :assignment_policy, only: [:show, :create, :destroy], module: :inboxes
          end

          namespace :twitter do
            resource :authorization, only: [:create]
          end

          namespace :microsoft do
            resource :authorization, only: [:create]
          end

          namespace :google do
            resource :authorization, only: [:create]
          end

          namespace :instagram do
            resource :authorization, only: [:create]
          end

          namespace :tiktok do
            resource :authorization, only: [:create]
          end

          namespace :notion do
            resource :authorization, only: [:create]
          end

          namespace :whatsapp do
            resource :authorization, only: [:create]
          end

          resources :webhooks, only: [:index, :create, :update, :destroy]
          namespace :integrations do
            resources :apps, only: [:index, :show]
            resources :hooks, only: [:show, :create, :update, :destroy] do
              member do
                post :process_event
              end
            end
            resource :slack, only: [:create, :update, :destroy], controller: 'slack' do
              member do
                get :list_all_channels
              end
            end
            resource :dyte, controller: 'dyte', only: [] do
              collection do
                post :create_a_meeting
                post :add_participant_to_meeting
              end
            end
            resource :shopify, controller: 'shopify', only: [:destroy] do
              collection do
                post :auth
                get :orders
              end
            end
            resource :linear, controller: 'linear', only: [] do
              collection do
                delete :destroy
                get :teams
                get :team_entities
                post :create_issue
                post :link_issue
                post :unlink_issue
                get :search_issue
                get :linked_issues
              end
            end
            resource :notion, controller: 'notion', only: [] do
              collection do
                delete :destroy
              end
            end
          end
          resources :working_hours, only: [:update]

          resources :portals do
            member do
              patch :archive
              delete :logo
              post :send_instructions
              get :ssl_status
            end
            resources :categories
            resources :articles do
              post :reorder, on: :collection
            end
          end

          resources :upload, only: [:create]
        end
      end
      # end of account scoped api routes
      # ----------------------------------

      namespace :integrations do
        resources :webhooks, only: [:create]
      end

      # Frontend API endpoint to trigger SAML authentication flow
      post 'auth/saml_login', to: 'auth#saml_login'

      resource :profile, only: [:show, :update] do
        delete :avatar, on: :collection
        member do
          post :availability
          post :auto_offline
          put :set_active_account
          post :resend_confirmation
          post :reset_access_token
        end

        # MFA routes
        scope module: 'profile' do
          resource :mfa, controller: 'mfa', only: [:show, :create, :destroy] do
            post :verify
            post :backup_codes
          end
        end
      end

      resource :notification_subscriptions, only: [:create, :destroy]

      namespace :widget do
        resource :direct_uploads, only: [:create]
        resource :config, only: [:create]
        resources :campaigns, only: [:index]
        resources :events, only: [:create]
        resources :messages, only: [:index, :create, :update]
        resources :conversations, only: [:index, :create] do
          collection do
            post :destroy_custom_attributes
            post :set_custom_attributes
            post :update_last_seen
            post :toggle_typing
            post :transcript
            get  :toggle_status
          end
        end
        resource :contact, only: [:show, :update] do
          collection do
            post :destroy_custom_attributes
            patch :set_user
          end
        end
        resources :inbox_members, only: [:index]
        resources :labels, only: [:create, :destroy]
        namespace :integrations do
          resource :dyte, controller: 'dyte', only: [] do
            collection do
              post :add_participant_to_meeting
            end
          end
        end
      end
    end

    namespace :v2 do
      resources :accounts, only: [:create] do
        scope module: :accounts do
          resources :summary_reports, only: [] do
            collection do
              get :agent
              get :team
              get :inbox
              get :label
              get :channel
            end
          end
          resources :reports, only: [:index] do
            collection do
              get :summary
              get :bot_summary
              get :agents
              get :inboxes
              get :labels
              get :teams
              get :conversations
              get :conversations_summary
              get :conversation_traffic
              get :bot_metrics
            end
          end
          resource :year_in_review, only: [:show]
          resources :live_reports, only: [] do
            collection do
              get :conversation_metrics
              get :grouped_conversation_metrics
            end
          end
        end
      end
    end
  end

  if ChatwootApp.enterprise?
    namespace :enterprise, defaults: { format: 'json' } do
      namespace :api do
        namespace :v1 do
          resources :accounts do
            member do
              post :checkout
              post :subscription
              get :limits
              post :toggle_deletion
              post :topup_checkout
            end
          end
        end
      end

      post 'webhooks/stripe', to: 'webhooks/stripe#process_payload'
      post 'webhooks/firecrawl', to: 'webhooks/firecrawl#process_payload'
    end
  end

  # ----------------------------------------------------------------------
  # Routes for platform APIs
  namespace :platform, defaults: { format: 'json' } do
    namespace :api do
      namespace :v1 do
        resources :users, only: [:create, :show, :update, :destroy] do
          member do
            get :login
            post :token
          end
        end
        resources :agent_bots, only: [:index, :create, :show, :update, :destroy] do
          delete :avatar, on: :member
        end
        resources :accounts, only: [:index, :create, :show, :update, :destroy] do
          resources :account_users, only: [:index, :create] do
            collection do
              delete :destroy
            end
          end
        end
      end
    end
  end

  # ----------------------------------------------------------------------
  # Routes for inbox APIs Exposed to contacts
  namespace :public, defaults: { format: 'json' } do
    namespace :api do
      namespace :v1 do
        resources :inboxes do
          scope module: :inboxes do
            resources :contacts, only: [:create, :show, :update] do
              resources :conversations, only: [:index, :create, :show] do
                member do
                  post :toggle_status
                  post :toggle_typing
                  post :update_last_seen
                end

                resources :messages, only: [:index, :create, :update]
              end
            end
          end
        end

        resources :csat_survey, only: [:show, :update]
      end
    end
  end

  get 'hc/:slug', to: 'public/api/v1/portals#show'
  get 'hc/:slug/sitemap.xml', to: 'public/api/v1/portals#sitemap'
  get 'hc/:slug/:locale', to: 'public/api/v1/portals#show'
  get 'hc/:slug/:locale/articles', to: 'public/api/v1/portals/articles#index'
  get 'hc/:slug/:locale/categories', to: 'public/api/v1/portals/categories#index'
  get 'hc/:slug/:locale/categories/:category_slug', to: 'public/api/v1/portals/categories#show'
  get 'hc/:slug/:locale/categories/:category_slug/articles', to: 'public/api/v1/portals/articles#index'
  get 'hc/:slug/articles/:article_slug.png', to: 'public/api/v1/portals/articles#tracking_pixel'
  get 'hc/:slug/articles/:article_slug', to: 'public/api/v1/portals/articles#show'

  # ----------------------------------------------------------------------
  # Used in mailer templates
  resource :app, only: [:index] do
    resources :accounts do
      resources :conversations, only: [:show]
    end
  end

  # ----------------------------------------------------------------------
  # Routes for channel integrations
  mount Facebook::Messenger::Server, at: 'bot'
  get 'webhooks/twitter', to: 'api/v1/webhooks#twitter_crc'
  post 'webhooks/twitter', to: 'api/v1/webhooks#twitter_events'
  post 'webhooks/line/:line_channel_id', to: 'webhooks/line#process_payload'
  post 'webhooks/telegram/:bot_token', to: 'webhooks/telegram#process_payload'
  post 'webhooks/sms/:phone_number', to: 'webhooks/sms#process_payload'
  get 'webhooks/whatsapp/:phone_number', to: 'webhooks/whatsapp#verify'
  post 'webhooks/whatsapp/:phone_number', to: 'webhooks/whatsapp#process_payload'
  get 'webhooks/instagram', to: 'webhooks/instagram#verify'
  post 'webhooks/instagram', to: 'webhooks/instagram#events'
  post 'webhooks/tiktok', to: 'webhooks/tiktok#events'

  namespace :twitter do
    resource :callback, only: [:show]
  end

  namespace :linear do
    resource :callback, only: [:show]
  end

  namespace :shopify do
    resource :callback, only: [:show]
  end

  namespace :twilio do
    resources :callback, only: [:create]
    resources :delivery_status, only: [:create]

    if ChatwootApp.enterprise?
      post 'voice/call/:phone', to: 'voice#call_twiml', as: :voice_call
      post 'voice/status/:phone', to: 'voice#status', as: :voice_status
      post 'voice/conference_status/:phone', to: 'voice#conference_status', as: :voice_conference_status
    end
  end

  get 'microsoft/callback', to: 'microsoft/callbacks#show'
  get 'google/callback', to: 'google/callbacks#show'
  get 'instagram/callback', to: 'instagram/callbacks#show'
  get 'tiktok/callback', to: 'tiktok/callbacks#show'
  get 'notion/callback', to: 'notion/callbacks#show'
  # ----------------------------------------------------------------------
  # Routes for external service verifications
  get '.well-known/assetlinks.json' => 'android_app#assetlinks'
  get '.well-known/apple-app-site-association' => 'apple_app#site_association'
  get '.well-known/microsoft-identity-association.json' => 'microsoft#identity_association'
  get '.well-known/cf-custom-hostname-challenge/:id', to: 'custom_domains#verify'

  # ----------------------------------------------------------------------
  # Internal Monitoring Routes
  require 'sidekiq/web'
  require 'sidekiq/cron/web'

  devise_for :super_admins, path: 'super_admin', controllers: { sessions: 'super_admin/devise/sessions' }
  devise_scope :super_admin do
    get 'super_admin/logout', to: 'super_admin/devise/sessions#destroy'
    namespace :super_admin do
      root to: 'dashboard#index'

      resource :app_config, only: [:show, :create]

      # order of resources affect the order of sidebar navigation in super admin
      resources :accounts, only: [:index, :new, :create, :show, :edit, :update, :destroy] do
        post :seed, on: :member
        post :reset_cache, on: :member
      end
      resources :users, only: [:index, :new, :create, :show, :edit, :update, :destroy] do
        delete :avatar, on: :member, action: :destroy_avatar
      end

      resources :access_tokens, only: [:index, :show]
      resources :installation_configs, only: [:index, :new, :create, :show, :edit, :update]
      resources :agent_bots, only: [:index, :new, :create, :show, :edit, :update, :destroy] do
        delete :avatar, on: :member, action: :destroy_avatar
      end
      resources :platform_apps, only: [:index, :new, :create, :show, :edit, :update, :destroy]
      resource :instance_status, only: [:show]

      resource :settings, only: [:show] do
        get :refresh, on: :collection
      end

      # resources that doesn't appear in primary navigation in super admin
      resources :account_users, only: [:new, :create, :show, :destroy]
    end
    authenticated :super_admin do
      mount Sidekiq::Web => '/monitoring/sidekiq'
    end
  end

  namespace :installation do
    get 'onboarding', to: 'onboarding#index'
    post 'onboarding', to: 'onboarding#create'
  end

  # ---------------------------------------------------------------------
  # Routes for swagger docs
  get '/swagger/*path', to: 'swagger#respond'
  get '/swagger', to: 'swagger#respond'

  # ----------------------------------------------------------------------
  # Routes for testing
  resources :widget_tests, only: [:index] unless Rails.env.production?
end
