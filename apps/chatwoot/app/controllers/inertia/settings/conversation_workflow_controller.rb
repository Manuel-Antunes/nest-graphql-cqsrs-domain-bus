module Inertia
  module Settings
    class ConversationWorkflowController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'])
      }

      def index
        render inertia: 'Settings/ConversationWorkflow/Index'
      end
    end
  end
end
