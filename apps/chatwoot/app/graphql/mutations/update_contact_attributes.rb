# frozen_string_literal: true

module Mutations
  # Merge only a contact's attribute JSON (custom and/or additional) into the
  # existing sets, leaving all other contact fields untouched. Thin wrapper over
  # the same merge logic as UpdateContact.
  class UpdateContactAttributes < SupportBase
    description "Merge attributes into a contact (without touching other fields)."

    argument :id, ID, required: true, description: 'Internal id of the contact to update.'
    argument :custom_attributes, late('JSON'), required: false, description: 'Custom attributes to merge into the existing set (JSON object).'
    argument :additional_attributes, late('JSON'), required: false, description: 'Additional attributes to merge into the existing set (JSON object).'

    field :contact, late('Contact'), null: true

    def resolve(id:, custom_attributes: nil, additional_attributes: nil)
      contact = find_contact!(id)
      authorize!(contact, :update?)

      custom = coerce_json_object!(custom_attributes, 'customAttributes')
      additional = coerce_json_object!(additional_attributes, 'additionalAttributes')

      update_attrs = {}
      update_attrs[:custom_attributes] = contact.custom_attributes.to_h.merge(custom) if custom
      update_attrs[:additional_attributes] = contact.additional_attributes.to_h.merge(additional) if additional

      contact.update!(update_attrs) if update_attrs.any?
      { contact: contact }
    rescue ActiveRecord::RecordInvalid => e
      raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
    end
  end
end
