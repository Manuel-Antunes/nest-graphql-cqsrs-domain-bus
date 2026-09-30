# frozen_string_literal: true

module Mutations
  # Links a contact to a client, by client id alone.
  #
  # Replaces LinkContactToJudgmentCreditor + LinkContactToHeir. Those existed only
  # because exequentes and herdeiros lived in separate id spaces, so the caller had
  # to know which kind it held and pick the matching mutation. They are now one flat
  # `client` row in one id space, so there is one mutation and the kind (`Client.kind`)
  # is just a field.
  class LinkContactToClient < BaseMutation
    description 'Links a contact to a Client (an exequente or a herdeiro).'

    argument :contact_id, ID, required: true, description: 'Internal id of the contact to link.'
    argument :client_id, ID, required: true, description: 'Internal id of the Client to link the contact to.'

    field :contact, late('Contact'), null: true

    def resolve(contact_id:, client_id:)
      contact = Contact.find_by(id: contact_id)
      raise ::GraphQL::ExecutionError, 'Contact not found.' unless contact

      begin
        ContactLink.find_or_create_by!(contact: contact, client_id: client_id)
      rescue ActiveRecord::RecordInvalid => e
        raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
      rescue ActiveRecord::RecordNotUnique
        raise ::GraphQL::ExecutionError, 'Contact is already assigned to another client.'
      end

      { contact: contact }
    end
  end
end
