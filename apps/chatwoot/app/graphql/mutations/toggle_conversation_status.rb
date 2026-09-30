# frozen_string_literal: true

module Mutations
  # Toggle a conversation's status (open <-> resolved; pending/snoozed -> open),
  # matching Conversation#toggle_status.
  class ToggleConversationStatus < SupportBase
    description "Toggle a conversation's status."

    argument :conversation_id, Integer, required: true, description: 'Conversation display id (the per-account #123 number).'

    field :conversation, late('Conversation'), null: true

    def resolve(conversation_id:)
      conversation = find_conversation!(conversation_id)
      authorize!(conversation, :show?)

      conversation.toggle_status
      { conversation: conversation }
    end
  end
end
