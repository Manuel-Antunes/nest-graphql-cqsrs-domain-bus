require 'rails_helper'

RSpec.describe AgentBots::InnerQueueJob do
  let(:channel) { Events::Types::AGENT_BOT_INNER_QUEUE }
  let(:payload) { { messageId: 1, content: 'hi' } }

  before do
    allow(AgentBots::InnerQueuePublisher).to receive(:publish)
  end

  it 'publishes the payload on the channel through the queue publisher' do
    described_class.perform_now(channel, payload, 'key-1')
    expect(AgentBots::InnerQueuePublisher).to have_received(:publish).with(channel, payload).once
  end

  it 'publishes without an idempotency key' do
    described_class.perform_now(channel, payload)
    expect(AgentBots::InnerQueuePublisher).to have_received(:publish).with(channel, payload).once
  end

  context 'when the idempotency key was already claimed' do
    before do
      allow(Redis::Alfred).to receive(:set).and_return(false)
    end

    it 'does not publish a duplicate' do
      described_class.perform_now(channel, payload, 'dup-key')
      expect(AgentBots::InnerQueuePublisher).not_to have_received(:publish)
    end
  end

  context 'when the idempotency key is fresh' do
    before do
      allow(Redis::Alfred).to receive(:set).and_return(true)
    end

    it 'claims the key with nx + ttl and publishes' do
      described_class.perform_now(channel, payload, 'fresh-key')
      expect(Redis::Alfred).to have_received(:set).with(
        'chatwoot:agent_bot_inner_queue:fresh-key', true,
        nx: true, ex: described_class::IDEMPOTENCY_TTL_SECONDS
      )
      expect(AgentBots::InnerQueuePublisher).to have_received(:publish).once
    end
  end

  context 'when publishing fails' do
    before do
      allow(Redis::Alfred).to receive(:set).and_return(true)
      allow(Redis::Alfred).to receive(:delete)
      allow(AgentBots::InnerQueuePublisher).to receive(:publish).and_raise(AgentBots::InnerQueuePublisher::MissingConfigError)
    end

    it 'releases the claim so the retry publishes, and raises' do
      expect { described_class.perform_now(channel, payload, 'retry-key') }
        .to raise_error(AgentBots::InnerQueuePublisher::MissingConfigError)
      expect(Redis::Alfred).to have_received(:delete).with('chatwoot:agent_bot_inner_queue:retry-key')
    end
  end
end
