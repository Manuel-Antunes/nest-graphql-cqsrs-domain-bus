# frozen_string_literal: true

module Mutations
  # Start a conversation with a contact on an inbox, mirroring the REST create
  # flow: build (or reuse) the ContactInbox, build the conversation, and
  # optionally send an initial message.
  class CreateConversation < SupportBase
    description 'Create a conversation for a contact on an inbox.'

    argument :inbox_id, ID, required: true, description: 'Internal id of the inbox to open the conversation on.'
    argument :contact_id, ID, required: true, description: 'Internal id of the contact to converse with.'
    argument :source_id, String, required: false, description: 'Channel-specific source id; auto-resolved from the contact inbox when omitted.'
    argument :content, String, required: false, description: 'Optional initial outgoing message.'
    argument :status, String, required: false, description: 'Initial status: open, resolved, pending or snoozed (default: open).'
    argument :assignee_id, ID, required: false, description: 'Internal id of the agent (User) to assign.'
    argument :team_id, ID, required: false, description: 'Internal id of the team to assign.'

    field :conversation, late('Conversation'), null: true

    def resolve(inbox_id:, contact_id:, source_id: nil, content: nil, status: nil, assignee_id: nil, team_id: nil)
      inbox = find_inbox!(inbox_id)
      authorize!(inbox, :show?)
      contact = find_contact!(contact_id)

      contact_inbox = ContactInboxBuilder.new(contact: contact, inbox: inbox, source_id: source_id).perform
      raise ::GraphQL::ExecutionError, 'Could not resolve a contact inbox for this channel.' if contact_inbox.blank?

      conversation_params = ActionController::Parameters.new(
        { status: status, assignee_id: assignee_id, team_id: team_id }.compact
      )
      conversation = ConversationBuilder.new(params: conversation_params, contact_inbox: contact_inbox).perform

      if content.present?
        Messages::MessageBuilder.new(
          current_user, conversation,
          ActionController::Parameters.new(content: content, message_type: 'outgoing')
        ).perform
      end

      { conversation: conversation }
    rescue ActiveRecord::RecordInvalid => e
      raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
    rescue ActionController::ParameterMissing => e
      raise ::GraphQL::ExecutionError, e.message
    end
  end
end
