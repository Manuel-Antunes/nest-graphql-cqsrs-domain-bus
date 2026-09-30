# frozen_string_literal: true

module Mutations
  class BaseMutation < GraphQL::Schema::RelayClassicMutation
    argument_class BaseArgument
    field_class BaseField
    input_object_class BaseInputObject
    object_class BaseObject

    # Reference an SDL-built type by name (e.g. "Contact") from a code-first
    # mutation payload. A plain string would be constantized to a Ruby model
    # class; a late-bound type resolves against the schema's type map at build
    # time, which is where SDL-first types live.
    def self.late(type_name)
      GraphQL::Schema::LateBoundType.new(type_name)
    end
  end
end
