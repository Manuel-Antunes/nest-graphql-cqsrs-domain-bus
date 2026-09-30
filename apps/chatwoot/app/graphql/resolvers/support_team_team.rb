# frozen_string_literal: true

module Resolvers
  # The platform team a Chatwoot team is: the same record, typed as the federated
  # `Team`, whose `id` is `platform_team_id` — so a team created in Chatwoot alone
  # has none.
  class SupportTeamTeam
    def resolve(obj, _args, _ctx)
      obj.platform_team_id.present? ? obj : nil
    end
  end
end
