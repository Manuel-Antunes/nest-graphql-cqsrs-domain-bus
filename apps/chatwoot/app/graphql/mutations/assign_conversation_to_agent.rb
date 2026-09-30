# frozen_string_literal: true

module Mutations
  # Assign a conversation to an agent (mirrors AssignmentsController#set_agent,
  # delegating to Conversations::AssignmentService). Pass a null assignee_id to
  # unassign.
  class AssignConversationToAgent < SupportBase
    description 'Assign a conversation to an agent.'

    argument :conversation_id, Integer, required: true, description: 'Conversation display id (the per-account #123 number).'
    argument :assignee_id, ID, required: false, description: 'Agent (User) id to assign; omit or null to unassign.'
    argument :assignee_type, String, required: false, description: "Assignee type: 'User' (default) or 'AgentBot'."

    field :conversation, late('Conversation'), null: true

    def resolve(conversation_id:, assignee_id: nil, assignee_type: 'User')
      conversation = find_conversation!(conversation_id)
      authorize!(conversation, :update?)

      Conversations::AssignmentService.new(
        conversation: conversation,
        assignee_id: assignee_id,
        assignee_type: assignee_type
      ).perform

      { conversation: conversation.reload }
    end
  end
end
