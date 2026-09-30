# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Resolvers::ContactClient do
  subject(:resolver) { described_class.new }

  let(:contact) { create(:contact) }
  let(:client_id) { SecureRandom.uuid }

  # The reference deliberately says `Client`, not `JudgmentCreditor`/`Heir`: the `main`
  # subgraph collapsed those into one flat entity with one id space, so the bare id we
  # store resolves on its own. Chatwoot no longer stores — or needs to know — that
  # taxonomy; over there it is just `Client.kind`.
  it 'emits a federated Client reference for the linked client' do
    ContactLink.create!(contact: contact, client_id: client_id)

    expect(resolver.resolve(contact, {}, nil)).to eq(
      '__typename' => 'Client',
      'id' => client_id
    )
  end

  it 'returns nil when the contact is not linked' do
    expect(resolver.resolve(contact, {}, nil)).to be_nil
  end
end
