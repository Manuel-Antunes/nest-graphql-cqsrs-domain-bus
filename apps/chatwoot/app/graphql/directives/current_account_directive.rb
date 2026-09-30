# frozen_string_literal: true

module Directives
  # @currentAccount — resolve the account the request is scoped to.
  class CurrentAccountDirective < Lighthouse::GraphQL::DirectiveResolvers::BaseDirectiveResolver
    def self.directive_name = 'currentAccount'
    def self.definition = 'directive @currentAccount on FIELD_DEFINITION'

    def define_resolver(target_type_class)
      method_name = "resolve_field_#{@field_def.name}"
      resolver = ->(_obj, _arguments, ctx) { GraphqlAuthorization.current_account!(ctx) }

      target_type_class.define_singleton_method(method_name, &resolver)
      @field_def.resolve_proc = resolver if @field_def.respond_to?(:resolve_proc=)
    end
  end
end
