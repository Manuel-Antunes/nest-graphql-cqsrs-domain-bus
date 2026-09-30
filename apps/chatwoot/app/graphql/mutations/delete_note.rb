# frozen_string_literal: true

module Mutations
  # Delete a contact note. Returns the contact it belonged to.
  class DeleteNote < SupportBase
    description 'Delete a note.'

    argument :id, ID, required: true, description: 'Internal id of the note to delete.'

    field :contact, late('Contact'), null: true

    def resolve(id:)
      account = current_account!
      note = Note.where(account_id: account.id).find_by(id: id)
      raise ::GraphQL::ExecutionError, 'Note not found.' unless note

      contact = note.contact
      authorize!(contact, :update?)
      note.destroy!
      { contact: contact }
    end
  end
end
