module Inertia
  module Settings
    # Multi-route settings group: the inbox (channels) group. One controller, six
    # pages — the inbox list plus the channel-setup wizard (ChannelList → ChannelFactory
    # → AddAgents → FinishSetup) and the per-inbox settings/tabs page. The inbox
    # components navigate internally via useAppNavigation (dual-mode) and the wizard
    # steps read inbox_id / sub_page / tab from the URL via
    # useAppNavigation().currentParams. All six routes carried the same vue-router meta
    # gates (permissions: ['administrator'], featureFlag: 'inbox_management').
    class InboxController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'inbox_management')
      }

      def list
        render inertia: 'Settings/Inbox/Index'
      end

      def new
        render inertia: 'Settings/Inbox/ChannelList'
      end

      def page_channel
        render inertia: 'Settings/Inbox/PageChannel'
      end

      def add_agents
        render inertia: 'Settings/Inbox/AddAgents'
      end

      def finish
        render inertia: 'Settings/Inbox/FinishSetup'
      end

      def show
        render inertia: 'Settings/Inbox/Show'
      end
    end
  end
end
