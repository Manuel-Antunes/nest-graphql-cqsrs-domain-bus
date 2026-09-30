require 'rails_helper'

RSpec.describe Conversations::LastSeenUpdater do
  let(:account) { create(:account) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:conversation) { create(:conversation, account: account) }

  it 'marks the conversation seen now by the agents' do
    freeze_time do
      described_class.new(conversation: conversation, user: agent).perform

      expect(conversation.reload.agent_last_seen_at).to eq(Time.current)
      expect(conversation.assignee_last_seen_at).to be_nil
    end
  end

  it 'marks it seen by the assignee too when the actor is the assignee' do
    conversation.update!(assignee: agent)

    freeze_time do
      described_class.new(conversation: conversation, user: agent).perform

      expect(conversation.reload.assignee_last_seen_at).to eq(Time.current)
    end
  end

  it 'marks it seen by the agents only when an agent bot is the actor' do
    conversation.update!(assignee: agent)

    described_class.new(conversation: conversation, user: create(:agent_bot, account: account)).perform

    expect(conversation.reload.agent_last_seen_at).not_to be_nil
    expect(conversation.assignee_last_seen_at).to be_nil
  end

  it 'marks both at the moment it is given, when told to' do
    seen_at = 2.days.ago.change(usec: 0)

    described_class.new(conversation: conversation, user: agent).perform(seen_at, update_assignee: true)

    expect(conversation.reload.agent_last_seen_at).to eq(seen_at)
    expect(conversation.assignee_last_seen_at).to eq(seen_at)
  end

  it 'answers the conversation' do
    expect(described_class.new(conversation: conversation, user: agent).perform).to eq(conversation)
  end
end
