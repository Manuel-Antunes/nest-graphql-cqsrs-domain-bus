# frozen_string_literal: true
require 'rails_helper'

# `Client` is a plain federated entity in this subgraph: the gateway enters with
# `__typename: 'Client'` and a bare id, and Chatwoot answers with the contacts linked
# to it — without knowing whether that id is an exequente or a herdeiro. There used to
# be one entity per concrete kind here, and each looked its contacts up by id while
# ignoring the type, so two clients sharing an id string would cross-match.
RSpec.describe 'Lighthouse Federation Integration', type: :request do
  let!(:contact) { create(:contact, account: create(:account)) }
  let!(:contact2) { create(:contact, account: contact.account) }
  let!(:user) { create(:user, account: contact.account) }

  let(:creditor_client_id) { SecureRandom.uuid }
  let(:heir_client_id) { SecureRandom.uuid }

  before do
    ContactLink.create!(contact: contact, client_id: creditor_client_id)
    ContactLink.create!(contact: contact2, client_id: heir_client_id)

    Lighthouse::ReferenceResolver.register('Client') do |reference, _context|
      client_id = reference[:id] || reference['id']

      OpenStruct.new(
        id: client_id,
        contacts: Contact.joins(:contact_links).where(contact_links: { client_id: client_id })
      )
    end
  end

  after do
    Lighthouse::ReferenceResolver.clear!
  end

  it 'resolves federated Client entities via _entities, whatever kind of client they are' do
    query = <<~GQL
      query($representations: [_Any!]!) {
        _entities(representations: $representations) {
          ... on Client {
            id
            contacts {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
    GQL

    variables = {
      representations: [
        { __typename: 'Client', id: creditor_client_id },
        { __typename: 'Client', id: heir_client_id }
      ]
    }

    post '/graphql', params: { query: query, variables: variables }, headers: user.create_new_auth_token, as: :json

    json = JSON.parse(response.body)

    expect(json['errors']).to be_nil
    entities = json.dig('data', '_entities')
    expect(entities.length).to eq(2)

    # Each client resolves to exactly the contact linked to it — no cross-matching.
    expect(entities[0].dig('contacts', 'edges').map { |e| e.dig('node', 'id').to_s })
      .to eq([contact.id.to_s])
    expect(entities[1].dig('contacts', 'edges').map { |e| e.dig('node', 'id').to_s })
      .to eq([contact2.id.to_s])
  end
end
