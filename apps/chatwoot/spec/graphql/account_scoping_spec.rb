# frozen_string_literal: true

require 'rails_helper'

# Verifies the GraphQL API enforces the same multi-tenancy and Pundit rules as
# the REST API: queries are account-scoped, unauthenticated requests are
# rejected, and per-record visibility (inbox/team) is honored.
RSpec.describe 'GraphQL account scoping & authorization', type: :request do
  def gql(query, user: nil, account: nil, variables: {})
    account_user = user && account ? AccountUser.find_by(account_id: account.id, user_id: user.id) : nil
    Current.account = account
    Current.account_user = account_user
    Current.user = user
    context = {
      current_user: user,
      current_account: account,
      current_account_user: account_user,
      pundit_user: { user: user, account: account, account_user: account_user }
    }
    ChatwootSchema.execute(query, variables: variables, context: context)
  ensure
    Current.reset
  end

  let(:account_a) { create(:account) }
  let(:account_b) { create(:account) }
  let(:admin_a) do
    create(:user).tap { |u| create(:account_user, account: account_a, user: u, role: :administrator) }
  end

  describe 'contacts query' do
    it 'returns only the current account contacts (no cross-tenant leak)' do
      create(:contact, account: account_a, email: 'a@example.com')
      create(:contact, account: account_b, email: 'b@example.com')

      res = gql('{ contacts(first: 50) { data { email } } }', user: admin_a, account: account_a)

      expect(res['errors']).to be_nil
      emails = res.dig('data', 'contacts', 'data').map { |c| c['email'] }
      expect(emails).to include('a@example.com')
      expect(emails).not_to include('b@example.com')
    end

    it 'rejects unauthenticated requests' do
      res = gql('{ contacts(first: 5) { data { id } } }')
      expect(res.dig('data', 'contacts')).to be_nil
      expect(res['errors'].first['message']).to eq('Unauthenticated.')
    end
  end

  describe 'inboxes query (InboxPolicy::Scope)' do
    it 'gives admins all account inboxes and agents only their assigned inboxes' do
      inbox1 = create(:inbox, account: account_a)
      inbox2 = create(:inbox, account: account_a)
      agent = create(:user)
      create(:account_user, account: account_a, user: agent, role: :agent)
      create(:inbox_member, user: agent, inbox: inbox1)

      admin_ids = gql('{ inboxes(first: 50) { data { id } } }', user: admin_a, account: account_a)
               .dig('data', 'inboxes', 'data').map { |i| i['id'].to_i }
      expect(admin_ids).to contain_exactly(inbox1.id, inbox2.id)

      agent_ids = gql('{ inboxes(first: 50) { data { id } } }', user: agent, account: account_a)
               .dig('data', 'inboxes', 'data').map { |i| i['id'].to_i }
      expect(agent_ids).to contain_exactly(inbox1.id)
    end
  end

  describe 'conversations query (PermissionFilterService)' do
    it 'limits agents to conversations in their inboxes' do
      inbox1 = create(:inbox, account: account_a)
      inbox2 = create(:inbox, account: account_a)
      conv1 = create(:conversation, account: account_a, inbox: inbox1)
      conv2 = create(:conversation, account: account_a, inbox: inbox2)
      agent = create(:user)
      create(:account_user, account: account_a, user: agent, role: :agent)
      create(:inbox_member, user: agent, inbox: inbox1)

      display_ids = gql('{ conversations(first: 50) { data { displayId } } }', user: agent, account: account_a)
                 .dig('data', 'conversations', 'data').map { |c| c['displayId'] }

      expect(display_ids).to include(conv1.display_id)
      expect(display_ids).not_to include(conv2.display_id)
    end
  end

  describe 'single-record authorization' do
    it 'does not leak a contact from another account' do
      contact_b = create(:contact, account: account_b, email: 'b@example.com')

      res = gql("{ contact(id: #{contact_b.id}) { id } }", user: admin_a, account: account_a)

      expect(res.dig('data', 'contact')).to be_nil
      expect(res['errors'].first['message']).to eq('Contact not found.')
    end

    it 'enforces ConversationPolicy#show? for agents without inbox access' do
      inbox = create(:inbox, account: account_a)
      conv = create(:conversation, account: account_a, inbox: inbox)
      agent = create(:user)
      create(:account_user, account: account_a, user: agent, role: :agent)

      res = gql("{ conversation(displayId: #{conv.display_id}) { id } }", user: agent, account: account_a)

      expect(res.dig('data', 'conversation')).to be_nil
      expect(res['errors'].first['message']).to eq('You are not authorized to perform this action.')
    end
  end
end
