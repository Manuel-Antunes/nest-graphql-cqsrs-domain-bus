# frozen_string_literal: true

# Shared authentication / account-scoping / authorization helpers for the GraphQL
# layer. Resolvers, @builder classes and mutations all route through here so the
# GraphQL API enforces the SAME multi-tenancy and Pundit rules as the REST API.
#
# The GraphQL context carries:
#   :current_user, :current_account, :current_account_user, :pundit_user
# (set in GraphqlController from the user's active account_user).
module GraphqlAuthorization
  module_function

  # Ensure there is an authenticated user; returns it.
  def authenticate!(context)
    user = context[:current_user]
    raise ::GraphQL::ExecutionError, 'Unauthenticated.' if user.blank?

    user
  end

  # Ensure there is an authenticated user AND an active account context; returns
  # the account. Every account-scoped query/mutation should start here.
  def current_account!(context)
    authenticate!(context)
    account = context[:current_account]
    raise ::GraphQL::ExecutionError, 'No active account for the current user.' if account.blank?

    account
  end

  # Authorize a record against a Pundit policy query (e.g. :show?, :update?).
  # Returns the record on success, raises a client-safe error otherwise.
  def authorize!(context, record, query)
    policy = ::Pundit.policy!(context[:pundit_user], record)
    return record if policy.public_send(query)

    raise ::GraphQL::ExecutionError, 'You are not authorized to perform this action.'
  rescue ::Pundit::NotDefinedError => e
    raise ::GraphQL::ExecutionError, e.message
  end

  # Resolve a Pundit policy scope (e.g. InboxPolicy::Scope -> assigned inboxes).
  def policy_scope(context, scope)
    ::Pundit.policy_scope!(context[:pundit_user], scope)
  end

  # Apply the REST conversation-visibility rules (admins: all; agents: only
  # conversations in their inboxes) to a Conversation relation.
  def permission_filtered_conversations(context, relation)
    account = current_account!(context)
    Conversations::PermissionFilterService.new(relation, context[:current_user], account).perform
  end
end
