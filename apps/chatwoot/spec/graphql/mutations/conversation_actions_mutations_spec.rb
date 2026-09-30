# frozen_string_literal: true

require 'rails_helper'

# createANewMessageInAConversation, toggleTypingStatusInConversation and updateConversationLastSeen: the
# REST conversation actions over the same services, for a user and for an agent bot.
RSpec.describe 'GraphQL conversation action mutations', type: :request do
  def gql(query, actor:, variables: {})
    account_user = actor.is_a?(User) ? AccountUser.find_by(account_id: account.id, user_id: actor.id) : nil
    context = {
      current_user: actor,
      current_account: account,
      current_account_user: account_user,
      pundit_user: { user: actor, account: account, account_user: account_user }
    }
    ChatwootSchema.execute(query, variables: variables, context: context)
  end

  let(:account) { create(:account) }
  let(:inbox) { create(:inbox, account: account) }
  let(:conversation) { create(:conversation, account: account, inbox: inbox) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:agent_bot) { create(:agent_bot, account: account) }

  describe 'createANewMessageInAConversation' do
    let(:query) do
      'mutation($input: CreateANewMessageInAConversationInput!) {
        createANewMessageInAConversation(input: $input) { message { id content private senderType senderId sourceId } }
      }'
    end

    it 'creates an outgoing message from a user' do
      res = gql(query, actor: admin, variables: { 'input' => { 'conversationId' => conversation.display_id, 'content' => 'Hi there' } })

      expect(res['errors']).to be_nil
      expect(res.dig('data', 'createANewMessageInAConversation', 'message')).to include(
        'content' => 'Hi there', 'private' => false, 'senderType' => 'User', 'senderId' => admin.id
      )
      expect(conversation.messages.last).to have_attributes(content: 'Hi there', message_type: 'outgoing', sender: admin)
    end

    it 'creates a private note from an agent bot, sent by the bot' do
      res = gql(query, actor: agent_bot,
                       variables: { 'input' => { 'conversationId' => conversation.display_id, 'content' => 'Summary', 'private' => true } })

      expect(res['errors']).to be_nil
      message = conversation.messages.last
      expect(message).to have_attributes(content: 'Summary', private: true, sender: agent_bot, message_type: 'outgoing')
    end

    it 'hands the builder every field the REST API takes' do
      replied = create(:message, conversation: conversation, account: account, inbox: inbox)
      input = {
        'conversationId' => conversation.display_id, 'content' => 'Pick one', 'messageType' => 'outgoing',
        'contentType' => 'input_select', 'echoId' => 'echo-1', 'sourceId' => 'wamid-1',
        'contentAttributes' => { 'items' => [{ 'title' => 'Yes', 'value' => 'yes' }], 'in_reply_to' => replied.id }
      }

      res = gql(query, actor: agent_bot, variables: { 'input' => input })

      expect(res['errors']).to be_nil
      message = conversation.messages.last
      expect(message).to have_attributes(content_type: 'input_select', source_id: 'wamid-1')
      expect(message.content_attributes).to include('items' => [{ 'title' => 'Yes', 'value' => 'yes' }], 'in_reply_to' => replied.id)
    end

    it 'accepts content attributes sent as a JSON string' do
      input = { 'conversationId' => conversation.display_id, 'content' => 'x', 'contentAttributes' => { 'items' => [] }.to_json }

      res = gql(query, actor: admin, variables: { 'input' => input })

      expect(res['errors']).to be_nil
    end

    it 'attaches base64 files as ActiveStorage blobs' do
      png = Rails.root.join('spec/assets/avatar.png').binread
      input = {
        'conversationId' => conversation.display_id, 'content' => 'See attached',
        'attachments' => [{ 'data' => Base64.strict_encode64(png), 'filename' => 'avatar.png', 'contentType' => 'image/png' }]
      }

      res = gql(query, actor: agent_bot, variables: { 'input' => input })

      expect(res['errors']).to be_nil
      attachment = conversation.messages.last.attachments.sole
      expect(attachment.file_type).to eq('image')
      expect(attachment.file.filename.to_s).to eq('avatar.png')
      expect(attachment.file.download).to eq(png)
    end

    it 'refuses an attachment that is not base64' do
      input = { 'conversationId' => conversation.display_id,
                'attachments' => [{ 'data' => 'not base64!', 'filename' => 'x.txt', 'contentType' => 'text/plain' }] }

      res = gql(query, actor: admin, variables: { 'input' => input })

      expect(res['errors'].first['message']).to eq('The attachment x.txt is not valid base64.')
      expect(conversation.messages.count).to eq(0)
    end

    it 'answers what the builder refuses as an error, as REST does' do
      input = { 'conversationId' => conversation.display_id, 'content' => 'x', 'messageType' => 'incoming' }

      res = gql(query, actor: admin, variables: { 'input' => input })

      expect(res['errors'].first['message']).to eq('Incoming messages are only allowed in Api inboxes')
    end

    it 'refuses an agent without access to the inbox' do
      res = gql(query, actor: agent, variables: { 'input' => { 'conversationId' => conversation.display_id, 'content' => 'x' } })

      expect(res['errors'].first['message']).to eq('You are not authorized to perform this action.')
    end

    it "cannot reach another account's conversation" do
      foreign = create(:conversation, account: create(:account))

      res = gql(query, actor: agent_bot, variables: { 'input' => { 'conversationId' => foreign.display_id, 'content' => 'x' } })

      expect(res['errors'].first['message']).to eq('Conversation not found.')
    end
  end

  describe 'toggleTypingStatusInConversation' do
    let(:query) do
      'mutation($input: ToggleTypingStatusInConversationInput!) {
        toggleTypingStatusInConversation(input: $input) { conversation { displayId } }
      }'
    end

    before { allow(Rails.configuration.dispatcher).to receive(:dispatch).and_call_original }

    it 'announces that a user is typing' do
      res = gql(query, actor: admin, variables: { 'input' => { 'conversationId' => conversation.display_id, 'typingStatus' => 'on' } })

      expect(res['errors']).to be_nil
      expect(res.dig('data', 'toggleTypingStatusInConversation', 'conversation', 'displayId')).to eq(conversation.display_id)
      expect(Rails.configuration.dispatcher).to have_received(:dispatch)
        .with(Conversation::CONVERSATION_TYPING_ON, kind_of(Time), { conversation: conversation, user: admin, is_private: false })
    end

    it 'announces that an agent bot stopped typing a private note' do
      res = gql(query, actor: agent_bot,
                       variables: { 'input' => { 'conversationId' => conversation.display_id, 'typingStatus' => 'off', 'isPrivate' => true } })

      expect(res['errors']).to be_nil
      expect(Rails.configuration.dispatcher).to have_received(:dispatch)
        .with(Conversation::CONVERSATION_TYPING_OFF, kind_of(Time), { conversation: conversation, user: agent_bot, is_private: true })
    end

    it 'takes only on and off' do
      res = gql(query, actor: admin, variables: { 'input' => { 'conversationId' => conversation.display_id, 'typingStatus' => 'maybe' } })

      expect(res['errors'].first['message']).to include('typingStatus')
    end
  end

  describe 'updateConversationLastSeen' do
    let(:query) do
      'mutation($input: UpdateConversationLastSeenInput!) {
        updateConversationLastSeen(input: $input) { conversation { displayId agentLastSeenAt } }
      }'
    end

    it 'marks the conversation seen by the user, and by the assignee when the user is the assignee' do
      conversation.update!(assignee: admin)

      res = gql(query, actor: admin, variables: { 'input' => { 'conversationId' => conversation.display_id } })

      expect(res['errors']).to be_nil
      expect(conversation.reload.agent_last_seen_at).not_to be_nil
      expect(conversation.assignee_last_seen_at).not_to be_nil
    end

    it 'marks the conversation seen by an agent bot' do
      res = gql(query, actor: agent_bot, variables: { 'input' => { 'conversationId' => conversation.display_id } })

      expect(res['errors']).to be_nil
      expect(conversation.reload.agent_last_seen_at).not_to be_nil
      expect(conversation.assignee_last_seen_at).to be_nil
    end

    it 'goes through the service the REST action uses' do
      allow(Conversations::LastSeenUpdater).to receive(:new).and_call_original

      gql(query, actor: admin, variables: { 'input' => { 'conversationId' => conversation.display_id } })

      expect(Conversations::LastSeenUpdater).to have_received(:new).with(conversation: conversation, user: admin)
    end
  end
end
