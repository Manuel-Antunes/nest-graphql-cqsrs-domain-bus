# frozen_string_literal: true

require 'rails_helper'

# An agent bot calling the real `/graphql` endpoint the way the gateway forwards it: the gateway verifies the
# platform access token the bot's OAuth client was issued and hands Chatwoot the bot's own access token instead.
RSpec.describe 'GraphQL as an agent bot, as the gateway forwards it', :platform_access_token, type: :request do
  let(:account) { create(:account, platform_organization_id: 'org-acme') }
  let(:agent_bot) { create(:agent_bot, account: account) }
  let(:conversation) { create(:conversation, account: account, inbox: create(:inbox, account: account)) }
  let(:create_message) do
    'mutation($input: CreateANewMessageInAConversationInput!) {
      createANewMessageInAConversation(input: $input) { message { content senderType senderId } }
    }'
  end
  let(:message_input) { { input: { conversationId: conversation.display_id, content: 'Hello from the bot' } } }

  def graphql(query, headers:, variables: {})
    post '/graphql', params: { query: query, variables: variables }, headers: headers, as: :json
    response.parsed_body
  end

  def as_the_bot
    { 'api_access_token' => agent_bot.access_token.token, 'x-tenant' => 'acme' }
  end

  it 'creates a message in a conversation of its account, sent by the bot' do
    body = graphql(create_message, headers: as_the_bot, variables: message_input)

    expect(body['errors']).to be_nil
    expect(body.dig('data', 'createANewMessageInAConversation', 'message'))
      .to eq('content' => 'Hello from the bot', 'senderType' => 'AgentBot', 'senderId' => agent_bot.id)
  end

  it 'toggles its typing status and marks the conversation seen' do
    typing = graphql('mutation($input: ToggleTypingStatusInConversationInput!) {
                        toggleTypingStatusInConversation(input: $input) { conversation { displayId } } }',
                     headers: as_the_bot, variables: { input: { conversationId: conversation.display_id, typingStatus: 'on' } })
    seen = graphql('mutation($input: UpdateConversationLastSeenInput!) {
                      updateConversationLastSeen(input: $input) { conversation { displayId } } }',
                   headers: as_the_bot, variables: { input: { conversationId: conversation.display_id } })

    expect(typing['errors']).to be_nil
    expect(seen['errors']).to be_nil
    expect(conversation.reload.agent_last_seen_at).not_to be_nil
  end

  it "cannot reach another account's conversation" do
    foreign = create(:conversation, account: create(:account, platform_organization_id: 'org-globex'))
    input = { input: { conversationId: foreign.display_id, content: 'x' } }

    body = graphql(create_message, headers: as_the_bot, variables: input)

    expect(body['errors'].first['message']).to eq('Conversation not found.')
    expect(foreign.messages.count).to eq(0)
  end

  it 'is nobody with only the platform access token, which the gateway never forwards to Chatwoot' do
    allow(BetterAuth::Platform).to receive(:user).and_return(nil)

    body = graphql(create_message, headers: { 'Authorization' => "Bearer #{agent_bot_access_token(agent_bot)}" },
                                   variables: message_input)

    expect(body['errors'].first['message']).to eq('Unauthenticated.')
    expect(conversation.messages.count).to eq(0)
  end
end
