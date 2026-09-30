# frozen_string_literal: true

module Mutations
  # Update a contact's attributes (mirrors ContactsController#update, merging
  # custom/additional attributes rather than replacing them).
  class UpdateContact < SupportBase
    description "Update a contact's attributes."

    argument :id, ID, required: true, description: 'Internal id of the contact to update.'
    argument :name, String, required: false, description: "Contact's display name."
    argument :email, String, required: false, description: 'Primary email address.'
    argument :phone_number, String, required: false, description: 'Primary phone number in E.164 form.'
    argument :identifier, String, required: false, description: 'External unique identifier set by the integrating system.'
    argument :blocked, Boolean, required: false, description: 'Whether the contact is blocked.'
    argument :custom_attributes, late('JSON'), required: false, description: 'Custom attributes to merge into the existing set (JSON object).'
    argument :additional_attributes, late('JSON'), required: false, description: 'Additional attributes to merge into the existing set (JSON object).'

    field :contact, late('Contact'), null: true

    def resolve(id:, custom_attributes: nil, additional_attributes: nil, **attrs)
      contact = find_contact!(id)
      authorize!(contact, :update?)

      custom = coerce_json_object!(custom_attributes, 'customAttributes')
      additional = coerce_json_object!(additional_attributes, 'additionalAttributes')

      update_attrs = attrs.compact
      update_attrs[:custom_attributes] = contact.custom_attributes.to_h.merge(custom) if custom
      update_attrs[:additional_attributes] = contact.additional_attributes.to_h.merge(additional) if additional

      contact.update!(update_attrs)
      { contact: contact }
    rescue ActiveRecord::RecordInvalid => e
      raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
    end
  end
end
