# frozen_string_literal: true

module Mutations
  # Create a private (internal) note on a conversation, addressed by its internal
  # id. Account-scoped and authorized (ConversationPolicy#show? — agent bots and
  # members of the conversation's inbox are allowed). Used by the conversation
  # summarizer (libs/chat) running as an inner-queue agent bot.
  class CreatePrivateMessage < SupportBase
    description 'Create a private (internal) note message on a conversation (by internal id).'

    argument :conversation_id, ID, required: true, description: 'Internal id of the conversation (the Conversation.id, not the display number).'
    argument :content, String, required: true, description: 'The private note text.'

    field :message, late('Message'), null: true

    def resolve(conversation_id:, content:)
      account = current_account!
      conversation = account.conversations.find_by(id: conversation_id)
      raise ::GraphQL::ExecutionError, 'Conversation not found.' unless conversation

      authorize!(conversation, :show?)

      message = Messages::MessageBuilder.new(
        current_user,
        conversation,
        ActionController::Parameters.new(content: content, private: true, message_type: 'outgoing', content_type: 'text')
      ).perform

      { message: message }
    rescue ActiveRecord::RecordInvalid => e
      raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
    end
  end
end
