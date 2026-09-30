# frozen_string_literal: true

module Resolvers
  class ContactDashboardPath
    def resolve(obj, _args, _ctx)
      "/app/accounts/#{obj.account_id}/contacts/#{obj.id}"
    end
  end
end
