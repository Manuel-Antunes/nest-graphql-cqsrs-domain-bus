module Inertia
  class ConversationsController < InertiaController
    before_action lambda {
      authorize_page!(permissions: %w[administrator agent conversation_manage conversation_unassigned_manage conversation_participating_manage])
    }

      def home
        render inertia: 'Conversation/Index', props: { inboxId: 0 }
      end

      def inbox_conversation
        render inertia: 'Conversation/Index', props: { inboxId: 0, conversationId: params[:conversation_id] }
      end

      def inbox_dashboard
        render inertia: 'Conversation/Index', props: { inboxId: params[:inbox_id] }
      end

      def conversation_through_inbox
        render inertia: 'Conversation/Index', props: { conversationId: params[:conversation_id], inboxId: params[:inbox_id] }
      end

      def label_conversations
        render inertia: 'Conversation/Index', props: { label: params[:label] }
      end

      def conversations_through_label
        render inertia: 'Conversation/Index', props: { conversationId: params[:conversation_id], label: params[:label] }
      end

      def team_conversations
        render inertia: 'Conversation/Index', props: { teamId: params[:teamId] }
      end

      def conversations_through_team
        render inertia: 'Conversation/Index', props: { conversationId: params[:conversationId], teamId: params[:teamId] }
      end

      def folder_conversations
        render inertia: 'Conversation/Index', props: { foldersId: params[:id] }
      end

      def conversations_through_folders
        render inertia: 'Conversation/Index', props: { conversationId: params[:conversation_id], foldersId: params[:id] }
      end

      def conversation_mentions
        render inertia: 'Conversation/Index', props: { conversationType: 'mention' }
      end

      def conversation_through_mentions
        render inertia: 'Conversation/Index', props: { conversationId: params[:conversationId], conversationType: 'mention' }
      end

      def conversation_unattended
        render inertia: 'Conversation/Index', props: { conversationType: 'unattended' }
      end

      def conversation_through_unattended
        render inertia: 'Conversation/Index', props: { conversationId: params[:conversationId], conversationType: 'unattended' }
      end

      def conversation_participating
        render inertia: 'Conversation/Index', props: { conversationType: 'participating' }
      end

      def conversation_through_participating
        render inertia: 'Conversation/Index', props: { conversationId: params[:conversationId], conversationType: 'participating' }
      end
  end
end
