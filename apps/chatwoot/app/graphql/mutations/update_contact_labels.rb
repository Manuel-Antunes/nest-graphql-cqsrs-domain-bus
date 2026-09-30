# frozen_string_literal: true

module Mutations
  # Replace the set of labels on a contact (Labelable#update_labels).
  class UpdateContactLabels < SupportBase
    description "Replace a contact's labels."

    argument :contact_id, ID, required: true, description: 'Internal id of the contact.'
    argument :labels, [String], required: true, description: 'Full set of label titles to apply (replaces existing labels).'

    field :contact, late('Contact'), null: true

    def resolve(contact_id:, labels:)
      contact = find_contact!(contact_id)
      authorize!(contact, :update?)

      contact.update_labels(labels)
      { contact: contact }
    end
  end
end
