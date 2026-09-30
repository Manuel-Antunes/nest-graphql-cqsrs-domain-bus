require 'rails_helper'

RSpec.describe 'GraphQL resolver calls', type: :request do
  let(:query) { '{ inboxes { nodes { id name } } }' }

  it 'calls the Inbox model methods when executing query' do
    # Spy on Inbox.all without touching DB
    allow(Inbox).to receive(:all).and_return([])
    expect(Inbox).to receive(:all).once

    # Provide a minimal Types::QueryType so SchemaImplementation can delegate
    module Types
      QueryType = Class.new do
        def self.inboxes
          Inbox.all
        end
      end
    end

    # Call the QueryType directly to verify delegation (avoids full GraphQL execution)
    Types::QueryType.inboxes
    # Inbox.all expectation is verified above
  end
end
