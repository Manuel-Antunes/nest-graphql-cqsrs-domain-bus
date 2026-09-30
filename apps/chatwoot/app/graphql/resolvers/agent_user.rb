# frozen_string_literal: true

module Resolvers
  # The platform user an agent is, as a reference the gateway resolves through the
  # `posts` subgraph: `IUser` is an @interfaceObject here, so the id is all it takes.
  class AgentUser
    def resolve(obj, _args, _ctx)
      return nil if obj.platform_user_id.blank?

      { '__typename' => 'IUser', 'id' => obj.platform_user_id }
    end
  end
end
