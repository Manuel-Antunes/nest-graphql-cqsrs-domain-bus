module Inertia
  class InboxViewController < InertiaController
    CONVERSATION_PERMISSIONS = %w[
      agent administrator conversation_manage
      conversation_unassigned_manage conversation_participating_manage
    ].freeze

    before_action lambda {
      authorize_page!(permissions: CONVERSATION_PERMISSIONS)
    }

    def index
      render inertia: 'InboxView/Index'
    end

    def conversation
      render inertia: 'InboxView/Conversation'
    end
  end
end
