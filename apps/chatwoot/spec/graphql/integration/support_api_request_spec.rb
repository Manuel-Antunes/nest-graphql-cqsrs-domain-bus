# frozen_string_literal: true

require 'rails_helper'

# Full-stack integration tests: they POST to the real `/graphql` endpoint with
# devise-token-auth headers (exactly like the REST request specs), so they also
# exercise the controller's account resolution (Current.account from the user's
# active account_user), routing, and JSON response — not just schema execution.
RSpec.describe 'GraphQL Support API', type: :request do
  let(:account) { create(:account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }

  def graphql(query, user: nil, variables: {})
    headers = user ? user.create_new_auth_token : {}
    post '/graphql', params: { query: query, variables: variables }, headers: headers, as: :json
    response.parsed_body
  end

  describe 'authentication' do
    it 'rejects an unauthenticated query' do
      body = graphql('{ contacts(first: 5) { data { id } } }')

      expect(response).to have_http_status(:success) # GraphQL transport always 200
      expect(body.dig('data', 'contacts')).to be_nil
      expect(body['errors'].first['message']).to eq('Unauthenticated.')
    end
  end

  describe 'queries' do
    describe '{ contacts }' do
      let!(:contact) { create(:contact, :with_email, account: account) }
      let!(:foreign_contact) { create(:contact, :with_email, account: create(:account)) }

      it 'returns the account contacts and never another account\'s' do
        body = graphql('{ contacts(first: 50) { data { id email } } }', user: admin)

        emails = body.dig('data', 'contacts', 'data').pluck('email')
        expect(body['errors']).to be_nil
        expect(emails).to include(contact.email)
        expect(emails).not_to include(foreign_contact.email)
      end
    end

    describe '{ inboxes }' do
      let!(:inbox_a) { create(:inbox, account: account) }
      let!(:inbox_b) { create(:inbox, account: account) }

      it 'returns all inboxes for an administrator' do
        ids = graphql('{ inboxes(first: 50) { data { id } } }', user: admin)
              .dig('data', 'inboxes', 'data').pluck('id').map(&:to_i)
        expect(ids).to contain_exactly(inbox_a.id, inbox_b.id)
      end

      it 'returns only assigned inboxes for an agent' do
        create(:inbox_member, user: agent, inbox: inbox_a)

        ids = graphql('{ inboxes(first: 50) { data { id } } }', user: agent)
              .dig('data', 'inboxes', 'data').pluck('id').map(&:to_i)
        expect(ids).to contain_exactly(inbox_a.id)
      end
    end

    describe '{ conversations }' do
      let!(:inbox_a) { create(:inbox, account: account) }
      let!(:inbox_b) { create(:inbox, account: account) }
      let!(:conv_a) { create(:conversation, account: account, inbox: inbox_a) }
      let!(:conv_b) { create(:conversation, account: account, inbox: inbox_b) }

      it 'permission-filters conversations for an agent (only their inboxes)' do
        create(:inbox_member, user: agent, inbox: inbox_a)

        display_ids = graphql('{ conversations(first: 50) { data { displayId } } }', user: agent)
                      .dig('data', 'conversations', 'data').pluck('displayId')

        expect(display_ids).to include(conv_a.display_id)
        expect(display_ids).not_to include(conv_b.display_id)
      end

      it 'returns all account conversations for an administrator' do
        display_ids = graphql('{ conversations(first: 50) { data { displayId } } }', user: admin)
                      .dig('data', 'conversations', 'data').pluck('displayId')
        expect(display_ids).to include(conv_a.display_id, conv_b.display_id)
      end
    end

    describe '{ conversation(displayId) }' do
      let(:inbox) { create(:inbox, account: account) }
      let(:conversation) { create(:conversation, account: account, inbox: inbox) }

      it 'returns the conversation with nested relations for an authorized user' do
        body = graphql(
          "{ conversation(displayId: #{conversation.display_id}) {
             displayId status inbox { name } contact { id } messages(first: 5) { nodes { id } }
           } }",
          user: admin
        )
        expect(body['errors']).to be_nil
        expect(body.dig('data', 'conversation', 'displayId')).to eq(conversation.display_id)
        expect(body.dig('data', 'conversation', 'inbox', 'name')).to eq(inbox.name)
      end

      it 'is forbidden for an agent without inbox access' do
        body = graphql("{ conversation(displayId: #{conversation.display_id}) { id } }", user: agent)
        expect(body.dig('data', 'conversation')).to be_nil
        expect(body['errors'].first['message']).to eq('You are not authorized to perform this action.')
      end
    end
  end

  describe 'mutations' do
    describe 'createNote' do
      let(:contact) { create(:contact, :with_email, account: account) }
      let(:query) { 'mutation($input: CreateNoteInput!){ createNote(input: $input){ note { content } } }' }

      it 'creates a note on a contact' do
        body = graphql(query, user: admin, variables: { input: { contactId: contact.id.to_s, content: 'Called the client' } })

        expect(body['errors']).to be_nil
        expect(body.dig('data', 'createNote', 'note', 'content')).to eq('Called the client')
        expect(contact.notes.pluck(:content)).to eq(['Called the client'])
      end

      it 'cannot target a contact from another account' do
        foreign = create(:contact, :with_email, account: create(:account))
        body = graphql(query, user: admin, variables: { input: { contactId: foreign.id.to_s, content: 'x' } })

        expect(body['errors'].first['message']).to eq('Contact not found.')
        expect(foreign.notes.count).to eq(0)
      end
    end

    describe 'sendMessage' do
      let(:inbox) { create(:inbox, account: account) }
      let(:conversation) { create(:conversation, account: account, inbox: inbox) }

      it 'creates an outgoing message on the conversation' do
        query = 'mutation($input: SendMessageInput!){ sendMessage(input: $input){ message { content messageType } } }'
        body = graphql(query, user: admin, variables: { input: { conversationId: conversation.display_id, content: 'Hi there' } })

        expect(body['errors']).to be_nil
        expect(body.dig('data', 'sendMessage', 'message', 'content')).to eq('Hi there')
        expect(conversation.messages.outgoing.last.content).to eq('Hi there')
      end
    end

    describe 'toggleConversationStatus' do
      let(:inbox) { create(:inbox, account: account) }
      let(:conversation) { create(:conversation, account: account, inbox: inbox, status: :open) }

      it 'resolves an open conversation' do
        query = 'mutation($input: ToggleConversationStatusInput!){ toggleConversationStatus(input: $input){ conversation { status } } }'
        body = graphql(query, user: admin, variables: { input: { conversationId: conversation.display_id } })

        expect(body['errors']).to be_nil
        expect(conversation.reload.status).to eq('resolved')
      end
    end

    describe 'updateContactLabels' do
      let(:contact) { create(:contact, :with_email, account: account) }

      it 'replaces the contact labels' do
        query = 'mutation($input: UpdateContactLabelsInput!){ updateContactLabels(input: $input){ contact { labels } } }'
        body = graphql(query, user: admin, variables: { input: { contactId: contact.id.to_s, labels: %w[vip lead] } })

        expect(body['errors']).to be_nil
        expect(body.dig('data', 'updateContactLabels', 'contact', 'labels')).to contain_exactly('vip', 'lead')
        expect(contact.reload.label_list).to contain_exactly('vip', 'lead')
      end
    end

    describe 'createContact' do
      it 'creates a contact in the current account' do
        query = 'mutation($input: CreateContactInput!){ createContact(input: $input){ contact { name email } } }'
        body = graphql(query, user: admin, variables: { input: { name: 'Jane Roe', email: 'jane.roe@example.com' } })

        expect(body['errors']).to be_nil
        expect(body.dig('data', 'createContact', 'contact', 'name')).to eq('Jane Roe')
        expect(account.contacts.find_by(email: 'jane.roe@example.com')).to be_present
      end
    end

    describe 'createConversation' do
      let(:inbox) { create(:inbox, account: account) }
      let(:contact) { create(:contact, :with_email, account: account) }

      it 'starts a conversation (and optional first message) for a contact on an inbox' do
        query = 'mutation($input: CreateConversationInput!){
          createConversation(input: $input){ conversation { displayId inbox { id } messages(first: 5) { nodes { content } } } }
        }'
        body = graphql(query, user: admin,
                              variables: { input: { inboxId: inbox.id.to_s, contactId: contact.id.to_s, content: 'First message' } })

        expect(body['errors']).to be_nil
        conv = body.dig('data', 'createConversation', 'conversation')
        expect(conv['inbox']['id'].to_i).to eq(inbox.id)
        expect(conv.dig('messages', 'nodes').pluck('content')).to include('First message')
      end
    end
  end

  describe 'multi-tenant isolation across two authenticated users' do
    it 'each user only sees their own account through the same endpoint' do
      account_two = create(:account)
      admin_two = create(:user, account: account_two, role: :administrator)
      create(:contact, :with_email, account: account, email: 'one@example.com')
      create(:contact, :with_email, account: account_two, email: 'two@example.com')

      emails_one = graphql('{ contacts(first: 50) { data { email } } }', user: admin)
                   .dig('data', 'contacts', 'data').pluck('email')
      emails_two = graphql('{ contacts(first: 50) { data { email } } }', user: admin_two)
                   .dig('data', 'contacts', 'data').pluck('email')

      expect(emails_one).to include('one@example.com')
      expect(emails_one).not_to include('two@example.com')
      expect(emails_two).to include('two@example.com')
      expect(emails_two).not_to include('one@example.com')
    end
  end
end
