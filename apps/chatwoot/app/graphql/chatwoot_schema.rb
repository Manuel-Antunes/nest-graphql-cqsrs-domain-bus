# frozen_string_literal: true

require 'active_support/core_ext/string'
require 'lighthouse-graphql'

class BaseArgument < GraphQL::Schema::Argument
  include ApolloFederation::Argument
end

class BaseField < GraphQL::Schema::Field
  include ApolloFederation::Field
  argument_class BaseArgument

  # Lighthouse's SchemaImplementation only dispatches to singleton resolvers
  # defined under its own `/lib/lighthouse/`; the app's directives
  # (app/graphql/directives) reach the runtime through this proc instead.
  attr_accessor :resolve_proc
end

class BaseObject < GraphQL::Schema::Object
  include ApolloFederation::Object
  field_class BaseField

  def self.resolve_reference(reference, context)
    type_name = graphql_name
    model = type_name.safe_constantize

    return nil unless model && model.respond_to?(:find_by)

    # `_entities` answers only within the account the request is scoped to.
    account = context[:current_account]
    return nil unless account

    model = model.where(account_id: account.id) if model.column_names.include?('account_id')
    id_value = reference[:id] || reference['id']
    if id_value
      # Chatwoot's ids are integers: ActiveRecord would cast "12abc" to 12, so an
      # id of another subgraph (a platform id) must never reach this lookup.
      id_value.to_s.match?(/\A\d+\z/) ? model.find_by(id: id_value) : nil
    else
      # Lookup by arbitrary @key fields. GraphQL `@key` fields are camelCase
      # (e.g. `platformTeamId`); map them to the snake_case columns before
      # querying, else find_by raises (unknown attribute) → null entity.
      conditions = reference
                   .except(:__typename, :id, '__typename')
                   .transform_keys { |key| key.to_s.underscore }
      model.find_by(conditions)
    end
  rescue StandardError
    nil
  end
end

module BaseInterface
  include GraphQL::Schema::Interface
  include ApolloFederation::Interface
  field_class BaseField
end

class BaseUnion < GraphQL::Schema::Union
  include ApolloFederation::Union
end

class BaseEnumValue < GraphQL::Schema::EnumValue
  include ApolloFederation::EnumValue
end

class BaseEnum < GraphQL::Schema::Enum
  include ApolloFederation::Enum
  enum_value_class BaseEnumValue
end

class BaseInputObject < GraphQL::Schema::InputObject
  include ApolloFederation::InputObject
  argument_class BaseArgument
end

class BaseScalar < GraphQL::Schema::Scalar
  include ApolloFederation::Scalar
end


BaseChatwootSchema = Lighthouse::GraphQL::RbLightHouse.get_schema(
  sdl_folder: File.expand_path('../../graphql', __dir__),
  options: {
    federation: true,
    base_types: {
      object: BaseObject,
      interface: BaseInterface,
      union: BaseUnion,
      enum: BaseEnum,
      input_object: BaseInputObject,
      scalar: BaseScalar,
    },
  }
)

class ChatwootSchema < BaseChatwootSchema
  include ApolloFederation::Schema
  federation(version: "2.3")
  query(superclass.query)
  mutation(Types::MutationType)


  use GraphQL::Tracing::DetailedTrace, limit: 50

  def self.detailed_trace?(_query)
    rand <= 0.000_1
  end

  use GraphQL::Dataloader
  def self.type_error(err, context)
    super
  end

  max_query_string_tokens(5000)
  validate_max_errors(100)

  def self.to_definition(*args)
    context = args.first.is_a?(Hash) ? args.first : {}
    GraphQL::Schema::Printer.print_schema(self, context: context)
  end

  def self.resolve_type(abstract_type, obj, ctx)
    if obj.is_a?(Hash)
      type_name = obj['__typename'] || obj[:__typename]
      candidate = types[type_name] if type_name
      return candidate if candidate
    end

    type_name = obj.class.name.demodulize
    candidate = types[type_name]
    return candidate if candidate

    if abstract_type.respond_to?(:types)
      possible_type = abstract_type.types.find { |t| t.name == type_name }
      return possible_type if possible_type
    end

    types[obj.class.name]
  end

  def self.id_from_object(object, _type_definition, _query_ctx)
    object.to_gid_param
  end

  def self.object_from_id(global_id, _query_ctx)
    GlobalID.find(global_id)
  end
end
