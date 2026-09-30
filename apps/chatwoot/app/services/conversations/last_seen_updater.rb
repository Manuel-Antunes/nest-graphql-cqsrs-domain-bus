# Marks a conversation as seen by an actor — a user or an agent bot — for the REST action and the GraphQL
# mutation alike. The assignee's mark moves too when the actor is the conversation's assignee, or when the
# caller says so (`unread` moves both back to before the last incoming message).
class Conversations::LastSeenUpdater
  pattr_initialize [:conversation!, :user]

  def perform(last_seen_at = DateTime.now.utc, update_assignee: assignee?)
    # rubocop:disable Rails/SkipsModelValidations
    conversation.update_column(:agent_last_seen_at, last_seen_at)
    conversation.update_column(:assignee_last_seen_at, last_seen_at) if update_assignee.present?
    # rubocop:enable Rails/SkipsModelValidations
    conversation
  end

  private

  def assignee?
    conversation.assignee_id? && user == conversation.assignee
  end
end
