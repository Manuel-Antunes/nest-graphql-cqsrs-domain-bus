require 'rails_helper'

RSpec.describe AgentBots::InnerQueueJob do
  let(:channel) { Events::Types::AGENT_BOT_INNER_QUEUE }
  let(:payload) { { messageId: 1, content: 'hi' } }
  let(:redis_client) { instance_double(Redis, publish: 1) }

  before do
    allow(Redis).to receive(:new).and_return(redis_client)
  end

  it 'publishes the payload as JSON on the channel' do
    described_class.perform_now(channel, payload, 'key-1')
    expect(redis_client).to have_received(:publish).with(channel, payload.to_json).once
  end

  it 'publishes without an idempotency key' do
    described_class.perform_now(channel, payload)
    expect(redis_client).to have_received(:publish).with(channel, payload.to_json).once
  end

  context 'when the idempotency key was already claimed' do
    before do
      allow(Redis::Alfred).to receive(:set).and_return(false)
    end

    it 'does not publish a duplicate' do
      described_class.perform_now(channel, payload, 'dup-key')
      expect(redis_client).not_to have_received(:publish)
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
      expect(redis_client).to have_received(:publish).once
    end
  end
end
