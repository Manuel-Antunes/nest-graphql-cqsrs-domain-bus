require 'rails_helper'
describe AgentBotListener do
  let(:listener) { described_class.instance }
  let!(:account) { create(:account) }
  let!(:user) { create(:user, account: account) }
  let!(:inbox) { create(:inbox, account: account) }
  let!(:agent_bot) { create(:agent_bot) }
  let!(:conversation) { create(:conversation, account: account, inbox: inbox, assignee: user) }

  describe '#message_created' do
    let(:event_name) { 'message.created' }
    let!(:event) { Events::Base.new(event_name, Time.zone.now, message: message) }
    let!(:message) do
      create(:message, message_type: 'outgoing',
                       account: account, inbox: inbox, conversation: conversation)
    end

    context 'when agent bot is not configured' do
      it 'does not send message to agent bot' do
        expect(AgentBots::WebhookJob).to receive(:perform_later).exactly(0).times
        listener.message_created(event)
      end
    end

    context 'when agent bot is configured' do
      it 'sends message to agent bot' do
        create(:agent_bot_inbox, inbox: inbox, agent_bot: agent_bot)
        expect(AgentBots::WebhookJob).to receive(:perform_later).with(agent_bot.outgoing_url,
                                                                      message.webhook_data.merge(event: 'message_created')).once
        listener.message_created(event)
      end

      it 'does not send message to agent bot if url is empty' do
        agent_bot = create(:agent_bot, outgoing_url: '')
        create(:agent_bot_inbox, inbox: inbox, agent_bot: agent_bot)
        expect(AgentBots::WebhookJob).not_to receive(:perform_later)
        listener.message_created(event)
      end

      context 'when conversation has a different assignee agent bot' do
        let!(:conversation_bot) { create(:agent_bot) }

        before do
          create(:agent_bot_inbox, inbox: inbox, agent_bot: agent_bot)
          conversation.update!(assignee_agent_bot: conversation_bot, assignee: nil)
        end

        it 'sends message to both bots exactly once' do
          payload = message.webhook_data.merge(event: 'message_created')

          expect(AgentBots::WebhookJob).to receive(:perform_later).with(agent_bot.outgoing_url, payload).once
          expect(AgentBots::WebhookJob).to receive(:perform_later).with(conversation_bot.outgoing_url, payload).once

          listener.message_created(event)
        end
      end
    end

    context 'when the agent bot is an inner_queue bot' do
      let!(:agent_bot) { create(:agent_bot, bot_type: :inner_queue) }
      let!(:message) do
        create(:message, message_type: 'incoming',
                         account: account, inbox: inbox, conversation: conversation)
      end

      before { create(:agent_bot_inbox, inbox: inbox, agent_bot: agent_bot) }

      it 'publishes to the inner queue instead of the webhook job' do
        expect(AgentBots::WebhookJob).not_to receive(:perform_later)
        expect(AgentBots::InnerQueueJob).to receive(:perform_later).once.with(
          Events::Types::AGENT_BOT_INNER_QUEUE,
          hash_including(messageId: message.id, conversationId: conversation.id),
          a_string_including("agent-bot-#{agent_bot.id}")
        )
        listener.message_created(event)
      end

      it 'includes the bot identity and access token in the payload' do
        captured = nil
        allow(AgentBots::InnerQueueJob).to receive(:perform_later) { |_channel, payload, _key| captured = payload }

        listener.message_created(event)

        expect(captured[:bot]).to eq(id: agent_bot.id, name: agent_bot.name)
        expect(captured[:botToken]).to eq(agent_bot.access_token.token)
      end

      it 'forwards the contact display name as pushName so the agent can address the person' do
        captured = nil
        allow(AgentBots::InnerQueueJob).to receive(:perform_later) { |_channel, payload, _key| captured = payload }

        listener.message_created(event)

        expect(captured[:pushName]).to eq(conversation.contact.name)
      end

      it 'does not forward the bot’s own outgoing replies' do
        outgoing = create(:message, message_type: 'outgoing', account: account, inbox: inbox, conversation: conversation)
        outgoing_event = Events::Base.new(event_name, Time.zone.now, message: outgoing)

        expect(AgentBots::InnerQueueJob).not_to receive(:perform_later)
        listener.message_created(outgoing_event)
      end
    end
  end

  describe '#webwidget_triggered' do
    let(:event_name) { 'webwidget.triggered' }

    context 'when agent bot is configured' do
      it 'send message to agent bot URL' do
        create(:agent_bot_inbox, inbox: inbox, agent_bot: agent_bot)

        event = double
        allow(event).to receive(:data)
          .and_return(
            {
              contact_inbox: conversation.contact_inbox,
              event_info: { country: 'US' }
            }
          )
        expect(AgentBots::WebhookJob).to receive(:perform_later)
          .with(
            agent_bot.outgoing_url,
            conversation.contact_inbox.webhook_data.merge(event: 'webwidget_triggered', event_info: { country: 'US' })
          ).once

        listener.webwidget_triggered(event)
      end
    end
  end
end
