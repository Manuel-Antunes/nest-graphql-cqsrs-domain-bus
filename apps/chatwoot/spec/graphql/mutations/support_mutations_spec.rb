# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'GraphQL support mutations', type: :request do
  def gql(query, user:, account:, variables: {})
    account_user = AccountUser.find_by(account_id: account.id, user_id: user.id)
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

  let(:account) { create(:account) }
  let(:other_account) { create(:account) }
  let(:admin) do
    create(:user).tap { |u| create(:account_user, account: account, user: u, role: :administrator) }
  end

  describe 'createNote' do
    let(:query) do
      'mutation($input: CreateNoteInput!) { createNote(input: $input) { note { content } } }'
    end

    it 'creates a note on a contact in the account' do
      contact = create(:contact, account: account, email: 'c@example.com')

      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'contactId' => contact.id.to_s, 'content' => 'Follow up next week' } })

      expect(res['errors']).to be_nil
      expect(res.dig('data', 'createNote', 'note', 'content')).to eq('Follow up next week')
      expect(contact.notes.pluck(:content)).to eq(['Follow up next week'])
    end

    it 'cannot create a note on a contact from another account' do
      foreign = create(:contact, account: other_account, email: 'x@example.com')

      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'contactId' => foreign.id.to_s, 'content' => 'x' } })

      expect(res['errors'].first['message']).to eq('Contact not found.')
      expect(foreign.notes.count).to eq(0)
    end
  end

  describe 'toggleConversationStatus' do
    it 'toggles an open conversation to resolved' do
      inbox = create(:inbox, account: account)
      conversation = create(:conversation, account: account, inbox: inbox, status: :open)

      query = 'mutation($input: ToggleConversationStatusInput!) {
        toggleConversationStatus(input: $input) { conversation { status } }
      }'
      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'conversationId' => conversation.display_id } })

      expect(res['errors']).to be_nil
      expect(conversation.reload.status).to eq('resolved')
    end
  end

  describe 'updateContactLabels' do
    it 'replaces the contact label set' do
      contact = create(:contact, account: account, email: 'c@example.com')

      query = 'mutation($input: UpdateContactLabelsInput!) {
        updateContactLabels(input: $input) { contact { labels } }
      }'
      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'contactId' => contact.id.to_s, 'labels' => %w[vip urgent] } })

      expect(res['errors']).to be_nil
      expect(res.dig('data', 'updateContactLabels', 'contact', 'labels')).to contain_exactly('vip', 'urgent')
      expect(contact.reload.label_list).to contain_exactly('vip', 'urgent')
    end
  end

  describe 'createContact' do
    it 'creates a contact in the current account' do
      query = 'mutation($input: CreateContactInput!) {
        createContact(input: $input) { contact { id name email } }
      }'
      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'name' => 'Jane', 'email' => 'jane@example.com' } })

      expect(res['errors']).to be_nil
      created = res.dig('data', 'createContact', 'contact')
      expect(created['name']).to eq('Jane')
      expect(account.contacts.find_by(email: 'jane@example.com')).to be_present
    end
  end

  describe 'assignConversationToTeam' do
    let(:query) do
      'mutation($input: AssignConversationToTeamInput!) {
        assignConversationToTeam(input: $input) { conversation { id } }
      }'
    end

    it 'assigns a conversation to a team in the account' do
      inbox = create(:inbox, account: account)
      conversation = create(:conversation, account: account, inbox: inbox)
      team = create(:team, account: account)

      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'conversationId' => conversation.display_id, 'teamId' => team.id.to_s } })

      expect(res['errors']).to be_nil
      expect(conversation.reload.team_id).to eq(team.id)
    end

    it 'rejects a team from another account' do
      inbox = create(:inbox, account: account)
      conversation = create(:conversation, account: account, inbox: inbox)
      foreign_team = create(:team, account: other_account)

      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'conversationId' => conversation.display_id, 'teamId' => foreign_team.id.to_s } })

      expect(res['errors'].first['message']).to eq('Team not found.')
    end

    # AI callers often pass the team NAME instead of an id (they never looked the
    # id up). Resolve by exact name and by a unique partial name.
    it 'assigns by team name (case-insensitive)' do
      inbox = create(:inbox, account: account)
      conversation = create(:conversation, account: account, inbox: inbox)
      team = create(:team, account: account, name: 'Time Priscila')

      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'conversationId' => conversation.display_id, 'teamId' => 'TIME PRISCILA' } })

      expect(res['errors']).to be_nil
      expect(conversation.reload.team_id).to eq(team.id)
    end

    it 'assigns by a unique partial team name' do
      inbox = create(:inbox, account: account)
      conversation = create(:conversation, account: account, inbox: inbox)
      team = create(:team, account: account, name: 'Time Priscila')

      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'conversationId' => conversation.display_id, 'teamId' => 'Priscila' } })

      expect(res['errors']).to be_nil
      expect(conversation.reload.team_id).to eq(team.id)
    end

    it 'does not route an ambiguous partial name to a team' do
      inbox = create(:inbox, account: account)
      conversation = create(:conversation, account: account, inbox: inbox)
      create(:team, account: account, name: 'Time Priscila')
      create(:team, account: account, name: 'Time Priscila Sul')

      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'conversationId' => conversation.display_id, 'teamId' => 'Priscila' } })

      expect(res['errors'].first['message']).to eq('Team not found.')
      expect(conversation.reload.team_id).to be_nil
    end
  end

  describe 'assignConversationToAgent' do
    it 'assigns a conversation to an agent in the account' do
      inbox = create(:inbox, account: account)
      conversation = create(:conversation, account: account, inbox: inbox)
      agent = create(:user).tap { |u| create(:account_user, account: account, user: u, role: :agent) }
      create(:inbox_member, inbox: inbox, user: agent)

      query = 'mutation($input: AssignConversationToAgentInput!) {
        assignConversationToAgent(input: $input) { conversation { id } }
      }'
      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'conversationId' => conversation.display_id, 'assigneeId' => agent.id.to_s } })

      expect(res['errors']).to be_nil
      expect(conversation.reload.assignee_id).to eq(agent.id)
    end
  end

  describe 'updateContactAttributes' do
    it 'merges attributes without touching other fields' do
      contact = create(:contact, account: account, name: 'Keep Me', email: 'c@example.com',
                                 custom_attributes: { 'a' => '1' })

      query = 'mutation($input: UpdateContactAttributesInput!) {
        updateContactAttributes(input: $input) { contact { id } }
      }'
      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'id' => contact.id.to_s, 'customAttributes' => { 'b' => '2' } } })

      expect(res['errors']).to be_nil
      contact.reload
      expect(contact.custom_attributes).to include('a' => '1', 'b' => '2')
      expect(contact.name).to eq('Keep Me')
    end

    # AI callers intermittently send the JSON arg as a stringified object; coerce
    # it instead of 500ing on Hash#merge ("no implicit conversion of String into Hash").
    it 'coerces a JSON-encoded string of attributes into an object' do
      contact = create(:contact, account: account, custom_attributes: { 'a' => '1' })

      query = 'mutation($input: UpdateContactAttributesInput!) {
        updateContactAttributes(input: $input) { contact { id } }
      }'
      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'id' => contact.id.to_s, 'customAttributes' => '{"b":"2"}' } })

      expect(res['errors']).to be_nil
      expect(contact.reload.custom_attributes).to include('a' => '1', 'b' => '2')
    end

    it 'returns a clean error (not a 500) when attributes are not an object' do
      contact = create(:contact, account: account, custom_attributes: { 'a' => '1' })

      query = 'mutation($input: UpdateContactAttributesInput!) {
        updateContactAttributes(input: $input) { contact { id } }
      }'
      res = gql(query, user: admin, account: account,
                       variables: { 'input' => { 'id' => contact.id.to_s, 'customAttributes' => %w[not an object] } })

      expect(res['errors'].first['message']).to eq('customAttributes must be a JSON object.')
      expect(contact.reload.custom_attributes).to eq('a' => '1') # unchanged
    end
  end
end
