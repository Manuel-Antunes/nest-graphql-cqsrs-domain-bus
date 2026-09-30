# frozen_string_literal: true

module Resolvers
  # Scopes the `accounts` query to only the accounts the authenticated user is a
  # member of (never every account in the system).
  class AccountsBuilder
    def self.call(_relation, _args, ctx)
      user = GraphqlAuthorization.authenticate!(ctx)
      Account.where(id: user.account_users.select(:account_id))
    end
  end
end
