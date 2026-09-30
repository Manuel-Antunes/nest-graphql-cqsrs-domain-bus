# frozen_string_literal: true

module Resolvers
  # Scopes the `conversations` query to the current account and applies the same
  # visibility rules as the REST API: administrators see every conversation,
  # agents only see conversations in inboxes they are assigned to
  # (Conversations::PermissionFilterService).
  class AccountConversationsBuilder
    def self.call(_relation, _args, ctx)
      account = GraphqlAuthorization.current_account!(ctx)
      GraphqlAuthorization.permission_filtered_conversations(ctx, account.conversations)
    end
  end
end
