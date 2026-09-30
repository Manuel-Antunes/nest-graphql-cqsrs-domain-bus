# frozen_string_literal: true

module Mutations
  # Replace the set of labels on a conversation (Labelable#update_labels).
  class UpdateConversationLabels < SupportBase
    description "Replace a conversation's labels."

    argument :conversation_id, Integer, required: true, description: 'Conversation display id (the per-account #123 number).'
    argument :labels, [String], required: true, description: 'Full set of label titles to apply (replaces existing labels).'

    field :conversation, late('Conversation'), null: true

    def resolve(conversation_id:, labels:)
      conversation = find_conversation!(conversation_id)
      authorize!(conversation, :show?)

      conversation.update_labels(labels)
      { conversation: conversation }
    end
  end
end
