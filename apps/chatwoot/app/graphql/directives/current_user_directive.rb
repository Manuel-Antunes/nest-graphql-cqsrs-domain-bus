# frozen_string_literal: true

module Directives
  # @currentUser — resolve the authenticated user.
  class CurrentUserDirective < Lighthouse::GraphQL::DirectiveResolvers::BaseDirectiveResolver
    def self.directive_name = 'currentUser'
    def self.definition = 'directive @currentUser on FIELD_DEFINITION'

    def define_resolver(target_type_class)
      method_name = "resolve_field_#{@field_def.name}"
      resolver = ->(_obj, _arguments, ctx) { GraphqlAuthorization.authenticate!(ctx) }

      target_type_class.define_singleton_method(method_name, &resolver)
      @field_def.resolve_proc = resolver if @field_def.respond_to?(:resolve_proc=)
    end
  end
end
