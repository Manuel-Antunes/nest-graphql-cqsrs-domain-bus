# frozen_string_literal: true

# POST /api/v1/accounts/:account_id/conversations/:id/toggle_typing_status as a mutation: the same
# Conversations::TypingStatusManager, announcing that the caller — a user or an agent bot — is typing.
class Mutations::ToggleTypingStatusInConversation < Mutations::SupportBase
  description 'Tell the agents and the contact of a conversation that the caller started or stopped typing.'

  argument :conversation_id, Integer, required: true, description: 'Conversation display id (the per-account #123 number).'
  argument :typing_status, ConversationTypingStatus, required: true, description: 'on when typing starts, off when it stops.'
  argument :is_private, Boolean, required: false, default_value: false,
                                 description: 'When true, the caller is typing a private note, which the contact is not told about.'

  field :conversation, late('Conversation'), null: true

  def resolve(conversation_id:, typing_status:, is_private:)
    conversation = find_conversation!(conversation_id)
    authorize!(conversation, :show?)

    Conversations::TypingStatusManager.new(
      conversation, current_user, { typing_status: typing_status, is_private: is_private }.with_indifferent_access
    ).toggle_typing_status
    { conversation: conversation }
  end
end
