require 'rails_helper'

RSpec.describe Sidekiq::SendReplySuccessPublisherMiddleware do
  subject(:middleware) { described_class.new }

  let(:redis_client) { instance_double(Redis) }
  let(:message) { create(:message) }
  let(:job_payload) do
    {
      'wrapped' => 'SendReplyJob',
      'args' => [message.id],
    }
  end

  before do
    allow(Redis).to receive(:new).and_return(redis_client)
    allow(redis_client).to receive(:publish)
  end

  it 'publishes once on successful send reply completion' do
    allow(Redis::Alfred).to receive(:set).and_return(true)

    middleware.call(nil, job_payload, 'high') { true }

    expect(redis_client).to have_received(:publish).once
  end

  it 'does not publish when the job execution fails' do
    allow(Redis::Alfred).to receive(:set)

    expect do
      middleware.call(nil, job_payload, 'high') { raise StandardError, 'boom' }
    end.to raise_error(StandardError, 'boom')

    expect(redis_client).not_to have_received(:publish)
    expect(Redis::Alfred).not_to have_received(:set)
  end

  it 'does not publish duplicates when idempotency key already exists' do
    allow(Redis::Alfred).to receive(:set).and_return(true, false)

    middleware.call(nil, job_payload, 'high') { true }
    middleware.call(nil, job_payload, 'high') { true }

    expect(redis_client).to have_received(:publish).once
  end
end
