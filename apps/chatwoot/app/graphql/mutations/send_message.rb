# frozen_string_literal: true

module Mutations
  # Create a message on a conversation (reply or private note), via the same
  # Messages::MessageBuilder the REST API uses.
  class SendMessage < SupportBase
    description 'Send a message (or private note) on a conversation.'

    argument :conversation_id, Integer, required: true, description: 'Conversation display id (the per-account #123 number).'
    argument :content, String, required: true, description: 'The message text.'
    argument :private, Boolean, required: false, default_value: false, description: 'When true, create a private internal note instead of a customer-visible reply.'
    argument :message_type, String, required: false, description: 'incoming | outgoing (default: outgoing).'
    argument :content_type, String, required: false, description: 'Optional content type, e.g. text, input_select, cards, form.'

    field :message, late('Message'), null: true

    def resolve(conversation_id:, content:, private: false, message_type: nil, content_type: nil)
      conversation = find_conversation!(conversation_id)
      authorize!(conversation, :show?)

      builder_params = ActionController::Parameters.new(
        { content: content, private: private, message_type: message_type || 'outgoing', content_type: content_type }.compact
      )

      message = Messages::MessageBuilder.new(current_user, conversation, builder_params).perform
      { message: message }
    rescue ActiveRecord::RecordInvalid => e
      raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
    end
  end
end
