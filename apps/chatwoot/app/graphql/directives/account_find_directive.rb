# frozen_string_literal: true

module Directives
  # @accountFind(in: "contacts", by: "id", arg: "id")
  #
  # Resolve a single record from an association on the current account, by a
  # column matched to a field argument. Raises a "<Type> not found." error when
  # absent. Componentizes the account-scoped lookup shared by the contact /
  # conversation / inbox queries. Pair with @can for authorization.
  #
  #   contact(id: ID!): Contact @accountFind(in: "contacts") @can(ability: "show")
  #   conversation(displayId: Int!): Conversation
  #     @accountFind(in: "conversations", by: "display_id", arg: "displayId") @can(ability: "show")
  class AccountFindDirective < Lighthouse::GraphQL::DirectiveResolvers::BaseDirectiveResolver
    def self.directive_name = 'accountFind'
    def self.definition = 'directive @accountFind(in: String!, by: String, arg: String) on FIELD_DEFINITION'

    def define_resolver(target_type_class)
      method_name = "resolve_field_#{@field_def.name}"
      association = directive_arg('in')
      column = directive_arg('by') || 'id'
      arg_name = directive_arg('arg') || 'id'
      not_found = "#{@field_def.name.to_s.humanize} not found."

      resolver = lambda do |_obj, arguments, ctx|
        account = GraphqlAuthorization.current_account!(ctx)
        args_h = arguments.respond_to?(:to_h) ? arguments.to_h : {}
        value = Lighthouse::Support::Naming.fetch_arg(args_h, arg_name)

        record = account.public_send(association).find_by(column => value)
        raise(::GraphQL::ExecutionError, not_found) unless record

        record
      end

      target_type_class.define_singleton_method(method_name, &resolver)
      @field_def.resolve_proc = resolver if @field_def.respond_to?(:resolve_proc=)
    end

    private

    def directive_arg(name)
      Lighthouse::Support::DirectiveArgs.literal(@directive_node, name)
    end
  end
end
