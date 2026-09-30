# frozen_string_literal: true

module Mutations
  class UnlinkContactFromClient < BaseMutation
    description 'Unlinks a contact from a Client.'

    argument :contact_id, ID, required: true, description: 'Internal id of the contact to unlink.'
    argument :client_id, ID, required: true, description: 'Internal id of the Client to unlink the contact from.'

    field :contact, late('Contact'), null: true

    def resolve(contact_id:, client_id:)
      contact = Contact.find_by(id: contact_id)
      raise ::GraphQL::ExecutionError, 'Contact not found.' unless contact

      ContactLink.find_by(contact: contact, client_id: client_id)&.destroy

      { contact: contact }
    end
  end
end
