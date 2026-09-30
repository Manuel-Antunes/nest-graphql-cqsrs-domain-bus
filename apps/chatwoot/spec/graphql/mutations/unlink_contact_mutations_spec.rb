# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Mutations::UnlinkContactFromClient (Relay)', type: :request do
  let(:account) { create(:account) }
  let(:contact) { create(:contact, account: account) }
  let(:client_id) { SecureRandom.uuid }

  let(:query) do
    <<~GQL
      mutation Unlink($input: UnlinkContactFromClientInput!) {
        unlinkContactFromClient(input: $input) {
          contact { id }
        }
      }
    GQL
  end

  it 'removes the link and returns the contact' do
    ContactLink.create!(contact: contact, client_id: client_id)

    result = ChatwootSchema.execute(
      query, variables: { 'input' => { 'contactId' => contact.id.to_s, 'clientId' => client_id } }
    )

    expect(result['errors']).to be_nil
    expect(result.dig('data', 'unlinkContactFromClient', 'contact', 'id').to_s).to eq(contact.id.to_s)
    expect(ContactLink.where(contact: contact, client_id: client_id)).not_to exist
  end

  it 'leaves a link to a different client alone' do
    other_client_id = SecureRandom.uuid
    ContactLink.create!(contact: contact, client_id: other_client_id)

    ChatwootSchema.execute(
      query, variables: { 'input' => { 'contactId' => contact.id.to_s, 'clientId' => client_id } }
    )

    expect(ContactLink.where(contact: contact, client_id: other_client_id)).to exist
  end
end
