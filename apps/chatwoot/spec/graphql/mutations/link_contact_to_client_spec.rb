# frozen_string_literal: true

require 'rails_helper'

# One link mutation covers both kinds of client now: an exequente and a herdeiro are
# both a `client` and share one id space, so there is nothing to branch on.
RSpec.describe 'Mutations::LinkContactToClient (Relay)', type: :request do
  let(:account) { create(:account) }
  let(:contact) { create(:contact, account: account) }
  let(:client_id) { SecureRandom.uuid }

  let(:query) do
    <<~GQL
      mutation Link($input: LinkContactToClientInput!) {
        linkContactToClient(input: $input) {
          contact { id }
        }
      }
    GQL
  end

  it 'links the contact via the Relay input/payload shape' do
    result = ChatwootSchema.execute(
      query,
      variables: { 'input' => { 'contactId' => contact.id.to_s, 'clientId' => client_id } }
    )

    expect(result['errors']).to be_nil
    expect(result.dig('data', 'linkContactToClient', 'contact', 'id').to_s).to eq(contact.id.to_s)
    expect(ContactLink.where(contact: contact, client_id: client_id)).to exist
  end

  it 'is idempotent — linking the same client twice does not duplicate the link' do
    2.times do
      ChatwootSchema.execute(
        query,
        variables: { 'input' => { 'contactId' => contact.id.to_s, 'clientId' => client_id } }
      )
    end

    expect(ContactLink.where(contact: contact, client_id: client_id).count).to eq(1)
  end

  it 'raises a GraphQL error when the contact does not exist' do
    result = ChatwootSchema.execute(
      query,
      variables: { 'input' => { 'contactId' => '0', 'clientId' => client_id } }
    )

    expect(result.dig('data', 'linkContactToClient')).to be_nil
    expect(result['errors']).to be_present
    expect(result['errors'].first['message']).to eq('Contact not found.')
  end
end
