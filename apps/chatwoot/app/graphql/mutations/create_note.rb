# frozen_string_literal: true

module Mutations
  # Add an internal note to a contact (mirrors Contacts::NotesController#create).
  class CreateNote < SupportBase
    description 'Create a note on a contact.'

    argument :contact_id, ID, required: true, description: 'Internal id of the contact to attach the note to.'
    argument :content, String, required: true, description: 'The note text.'

    field :note, late('Note'), null: true

    def resolve(contact_id:, content:)
      contact = find_contact!(contact_id)
      authorize!(contact, :update?)

      note = contact.notes.create!(content: content, user_id: current_user&.id)
      { note: note }
    rescue ActiveRecord::RecordInvalid => e
      raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
    end
  end
end
