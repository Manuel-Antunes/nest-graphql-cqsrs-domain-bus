# frozen_string_literal: true

module Types
  # Code-first Mutation root mounted onto the SDL-first schema. All mutations
  # follow the Relay pattern (input object + payload with `clientMutationId`),
  # provided by Mutations::BaseMutation.
  class MutationType < BaseObject
    graphql_name 'Mutation'

    field :create_private_message, mutation: Mutations::CreatePrivateMessage

    # One link mutation, not one per kind of client: exequentes and herdeiros now
    # share a single id space (`person`), so the caller no longer has to know which
    # of the two it is holding.
    field :link_contact_to_client, mutation: Mutations::LinkContactToClient
    field :unlink_contact_from_client, mutation: Mutations::UnlinkContactFromClient

    # Core customer-support mutations (account-scoped + Pundit-authorized).
    field :send_message, mutation: Mutations::SendMessage
    field :create_conversation, mutation: Mutations::CreateConversation
    field :toggle_conversation_status, mutation: Mutations::ToggleConversationStatus
    field :toggle_conversation_priority, mutation: Mutations::ToggleConversationPriority
    field :update_conversation_labels, mutation: Mutations::UpdateConversationLabels
    field :assign_conversation_to_team, mutation: Mutations::AssignConversationToTeam
    field :assign_conversation_to_agent, mutation: Mutations::AssignConversationToAgent
    field :set_team_working_hours, mutation: Mutations::SetTeamWorkingHours
    field :create_note, mutation: Mutations::CreateNote
    field :update_note, mutation: Mutations::UpdateNote
    field :delete_note, mutation: Mutations::DeleteNote
    field :create_contact, mutation: Mutations::CreateContact
    field :update_contact, mutation: Mutations::UpdateContact
    field :update_contact_labels, mutation: Mutations::UpdateContactLabels
    field :update_contact_attributes, mutation: Mutations::UpdateContactAttributes
  end
end
