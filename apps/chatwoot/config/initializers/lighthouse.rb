# frozen_string_literal: true

# Single wiring point for the Lighthouse GraphQL library. Keeping all app-specific
# configuration here (rather than inside the gem) means the library holds no app
# constants — the gem (lighthouse-graphql) is consumed as a clean dependency.
require 'lighthouse-graphql'

Lighthouse.configure do |config|
  # Namespaces tried (in order) when resolving a class name referenced by a
  # directive argument, e.g. `@field(resolver: "ContactClient")`,
  # `@all(model: "Contact")`, `@builder(class: "ContactsBuilder")`.
  # Fully-qualified names (containing "::") bypass these.
  config.resolver_namespaces = ['App::Graphql', 'Resolvers']

  # How swallowed directive/resolver errors are surfaced. Defaults to raising in
  # test and logging otherwise; override here to integrate with your error
  # reporter, e.g.:
  #   config.on_error = ->(error, _context) { Sentry.capture_exception(error) }
end

# Register app-defined custom directives with the library's registry. These
# componentize Chatwoot-specific rules (account scoping / lookups) so they can be
# declared in the schema instead of re-implemented in a resolver per field.
# Registered in `to_prepare` so they are in place before the schema is built.
Rails.application.config.to_prepare do
  [
    Directives::CurrentAccountDirective,
    Directives::CurrentUserDirective,
    Directives::AccountFindDirective,
    Directives::AccountScopeDirective
  ].each { |directive| Lighthouse::DirectiveRegistry.register(directive) }
end

# Federation reference resolvers are registered in config/initializers/federation.rb.
