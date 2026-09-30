require 'rails_helper'

RSpec.describe AgentBots::WebhookJob do
  include ActiveJob::TestHelper

  subject(:job) { described_class.perform_later(url, payload, webhook_type) }

  let(:url) { 'https://test.com' }
  let(:payload) { { name: 'test' } }
  let(:webhook_type) { :agent_bot_webhook }

  it 'queues the job' do
    expect { job }.to have_enqueued_job(described_class)
      .with(url, payload, webhook_type)
      .on_queue('high')
  end

  it 'executes perform' do
    expect(Webhooks::Trigger).to receive(:execute).with(url, payload, webhook_type, headers: {})
    perform_enqueued_jobs { job }
  end

  context 'with the agent bot it delivers for' do
    let(:agent_bot) { create(:agent_bot) }

    it "authorizes the delivery with the bot's platform access token" do
      allow(AgentBots::PlatformAccessToken).to receive(:for).with(agent_bot).and_return('jwt-1')
      expect(Webhooks::Trigger).to receive(:execute).with(url, payload, webhook_type, headers: { 'Authorization' => 'Bearer jwt-1' })

      perform_enqueued_jobs { described_class.perform_later(url, payload, agent_bot_id: agent_bot.id) }
    end

    it 'delivers without authorization when the bot has no platform token' do
      allow(AgentBots::PlatformAccessToken).to receive(:for).with(agent_bot).and_return(nil)
      expect(Webhooks::Trigger).to receive(:execute).with(url, payload, webhook_type, headers: {})

      perform_enqueued_jobs { described_class.perform_later(url, payload, agent_bot_id: agent_bot.id) }
    end
  end
end
