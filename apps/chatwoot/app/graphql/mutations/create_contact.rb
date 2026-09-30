# frozen_string_literal: true

module Mutations
  # Create a contact in the current account.
  class CreateContact < SupportBase
    description 'Create a contact in the current account.'

    argument :name, String, required: false, description: "Contact's display name."
    argument :email, String, required: false, description: 'Primary email address.'
    argument :phone_number, String, required: false, description: 'Primary phone number in E.164 form.'
    argument :identifier, String, required: false, description: 'External unique identifier set by the integrating system.'
    argument :custom_attributes, late('JSON'), required: false, description: 'Account-defined custom attributes (JSON object).'
    argument :additional_attributes, late('JSON'), required: false, description: 'Additional system attributes (JSON object).'

    field :contact, late('Contact'), null: true

    def resolve(custom_attributes: nil, additional_attributes: nil, **attrs)
      account = current_account!
      authorize!(account.contacts.new, :create?)

      create_attrs = attrs.compact
      create_attrs[:custom_attributes] = custom_attributes if custom_attributes
      create_attrs[:additional_attributes] = additional_attributes if additional_attributes

      contact = account.contacts.create!(create_attrs)
      { contact: contact }
    rescue ActiveRecord::RecordInvalid => e
      raise ::GraphQL::ExecutionError, e.record.errors.full_messages.join(', ')
    end
  end
end
