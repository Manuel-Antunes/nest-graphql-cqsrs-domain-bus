# frozen_string_literal: true

# POST /api/v1/accounts/:account_id/conversations/:id/update_last_seen as a mutation: the same
# Conversations::LastSeenUpdater, marking the conversation seen now by the caller — and by its
# assignee, when the caller is the assignee.
class Mutations::UpdateConversationLastSeen < Mutations::SupportBase
  description 'Mark a conversation as seen now by the caller.'

  argument :conversation_id, Integer, required: true, description: 'Conversation display id (the per-account #123 number).'

  field :conversation, late('Conversation'), null: true

  def resolve(conversation_id:)
    conversation = find_conversation!(conversation_id)
    authorize!(conversation, :show?)

    { conversation: Conversations::LastSeenUpdater.new(conversation: conversation, user: current_user).perform }
  end
end
