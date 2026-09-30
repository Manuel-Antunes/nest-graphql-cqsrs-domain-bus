# frozen_string_literal: true

module Mutations
  # Update a contact note's content.
  class UpdateNote < SupportBase
    description "Update a note's content."

    argument :id, ID, required: true, description: 'Internal id of the note to update.'
    argument :content, String, required: true, description: 'New note text.'

    field :note, late('Note'), null: true

    def resolve(id:, content:)
      account = current_account!
      note = Note.where(account_id: account.id).find_by(id: id)
      raise ::GraphQL::ExecutionError, 'Note not found.' unless note

      authorize!(note.contact, :update?)
      note.update!(content: content)
      { note: note }
    rescue ActiveRecord::RecordInvalid => e
      raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
    end
  end
end
