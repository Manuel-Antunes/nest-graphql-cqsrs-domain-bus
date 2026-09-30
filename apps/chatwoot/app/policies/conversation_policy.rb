class ConversationPolicy < ApplicationPolicy
  def index?
    true
  end

  def destroy?
    administrator?
  end

  def show?
    administrator? || agent_bot? || agent_can_view_conversation?
  end

  # Write-access to a conversation (assign team/agent) mirrors view-access: an
  # admin, an agent bot, or an agent who can see the conversation (its inbox or
  # team) may act on it — the same bar the REST AssignmentsController enforces
  # via conversation scoping, and the same bar the toggle mutations use.
  #
  # Defined explicitly because the GraphQL assign mutations authorize against
  # `:update?` and ApplicationPolicy#update? defaults to `false` — without this
  # `assignConversationToTeam` / `assignConversationToAgent` were denied for
  # everyone (incl. admins). Delegating to `show?` keeps it consistent and lets
  # the Enterprise custom-role overrides of `show?` apply here too.
  def update?
    show?
  end

  private

  def agent_can_view_conversation?
    inbox_access? || team_access?
  end

  def administrator?
    account_user&.administrator?
  end

  def agent_bot?
    user.is_a?(AgentBot)
  end

  def inbox_access?
    user.inboxes.where(account_id: account&.id).exists?(id: record.inbox_id)
  end

  def team_access?
    return false if record.team_id.blank?

    user.teams.where(account_id: account&.id).exists?(id: record.team_id)
  end

  def assigned_to_user?
    record.assignee_id == user.id
  end

  def participant?
    record.conversation_participants.exists?(user_id: user.id)
  end
end

ConversationPolicy.prepend_mod_with('ConversationPolicy')
