# frozen_string_literal: true

module Directives
  # @accountScope(of: "labels") — resolve a plain list field as an association on
  # the current account (account-scoped). For paginated lists use @paginate with
  # an account-scoping @builder instead.
  #
  #   labels: [Label!]! @accountScope(of: "labels")
  class AccountScopeDirective < Lighthouse::GraphQL::DirectiveResolvers::BaseDirectiveResolver
    def self.directive_name = 'accountScope'
    def self.definition = 'directive @accountScope(of: String!) on FIELD_DEFINITION'

    def define_resolver(target_type_class)
      method_name = "resolve_field_#{@field_def.name}"
      association = directive_arg('of')

      resolver = lambda do |_obj, _arguments, ctx|
        account = GraphqlAuthorization.current_account!(ctx)
        account.public_send(association)
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
