# frozen_string_literal: true

module Mutations
  # Set (or clear) a conversation's priority, matching Conversation#toggle_priority.
  class ToggleConversationPriority < SupportBase
    description "Set a conversation's priority (low|medium|high|urgent, or null to clear)."

    argument :conversation_id, Integer, required: true, description: 'Conversation display id (the per-account #123 number).'
    argument :priority, String, required: false, description: 'New priority: low, medium, high or urgent. Omit or pass null to clear priority.'

    field :conversation, late('Conversation'), null: true

    def resolve(conversation_id:, priority: nil)
      conversation = find_conversation!(conversation_id)
      authorize!(conversation, :show?)

      conversation.toggle_priority(priority)
      { conversation: conversation }
    end
  end
end
