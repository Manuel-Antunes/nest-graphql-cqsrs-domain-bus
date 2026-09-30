# frozen_string_literal: true

# Lighthouse::ReferenceResolver is provided by the lighthouse-graphql gem. The entities
# the `posts` subgraph owns are resolved here within the account the request is scoped
# to (GraphqlController#set_graphql_current_account): the gateway reaches `_entities`
# with the caller's credentials and tenant, and nothing outside that account answers.
Rails.application.config.to_prepare do
  # A client is only an id here: the contacts linked to it.
  Lighthouse::ReferenceResolver.register('Client') do |reference, context|
    client_id = reference['id'] || reference[:id]
    account = context[:current_account]
    contacts = account ? account.contacts.joins(:contact_links).where(contact_links: { client_id: client_id }) : Contact.none

    OpenStruct.new(id: client_id, contacts: contacts)
  end

  # A platform team is the Chatwoot team mirrored for it.
  Lighthouse::ReferenceResolver.register('Team') do |reference, context|
    context[:current_account]&.teams&.find_by(platform_team_id: reference['id'] || reference[:id])
  end
end
