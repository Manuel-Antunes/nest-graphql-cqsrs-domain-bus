# frozen_string_literal: true

module Mutations
  # Assign a conversation to a team (mirrors AssignmentsController#set_team).
  class AssignConversationToTeam < SupportBase
    description 'Assign a conversation to a team.'

    argument :conversation_id, Integer, required: true, description: 'Conversation display id (the per-account #123 number).'
    argument :team_id, ID, required: false,
                           description: 'The NUMERIC Chatwoot team id to assign — the `chatwootTeamId` returned by ListTeamsWithLaborUnions. NEVER the team name (a name returns "Team not found"). Omit or null to unassign.'

    field :conversation, late('Conversation'), null: true

    def resolve(conversation_id:, team_id: nil)
      conversation = find_conversation!(conversation_id)
      authorize!(conversation, :update?)

      team = team_id ? find_team!(team_id) : nil
      conversation.update!(team: team)
      { conversation: conversation }
    end
  end
end
