# frozen_string_literal: true

module Resolvers
  # Scopes the `inboxes` query via InboxPolicy::Scope — administrators get every
  # inbox in the account, agents get only their assigned inboxes.
  class AccountInboxesBuilder
    def self.call(_relation, _args, ctx)
      GraphqlAuthorization.current_account!(ctx)
      GraphqlAuthorization.policy_scope(ctx, Inbox)
    end
  end
end
