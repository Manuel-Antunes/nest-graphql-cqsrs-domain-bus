# frozen_string_literal: true

module Mutations
  class UpdateAccount < BaseMutation
    description "Updates an account"

    argument :id, ID, required: true
    argument :name, String, required: false
    argument :domain, String, required: false

    field :account, BaseObject, null: true
    field :errors, [String], null: false

    def resolve(id:, **attributes)
      account = ChatwootSchema.object_from_id(id, context)

      if account.nil?
        return { account: nil, errors: ["Account not found"] }
      end

      if account.update(attributes)
        { account: account, errors: [] }
      else
        { account: nil, errors: account.errors.full_messages }
      end
    end
  end
end
