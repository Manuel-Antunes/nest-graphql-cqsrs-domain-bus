require 'rails_helper'

RSpec.describe Conversations::TypingStatusManager do
  let(:account) { create(:account) }
  let(:conversation) { create(:conversation, account: account) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:agent_bot) { create(:agent_bot, account: account) }

  before { allow(Rails.configuration.dispatcher).to receive(:dispatch) }

  it 'announces that a user is typing' do
    described_class.new(conversation, agent, { typing_status: 'on', is_private: false }).toggle_typing_status

    expect(Rails.configuration.dispatcher).to have_received(:dispatch)
      .with(Conversation::CONVERSATION_TYPING_ON, kind_of(Time), { conversation: conversation, user: agent, is_private: false })
  end

  it 'announces that an agent bot stopped typing a private note' do
    described_class.new(conversation, agent_bot, { typing_status: 'off', is_private: true }).toggle_typing_status

    expect(Rails.configuration.dispatcher).to have_received(:dispatch)
      .with(Conversation::CONVERSATION_TYPING_OFF, kind_of(Time), { conversation: conversation, user: agent_bot, is_private: true })
  end

  it 'reaches every listener with an agent bot as the typist' do
    allow(Rails.configuration.dispatcher).to receive(:dispatch).and_call_original

    expect do
      described_class.new(conversation, agent_bot, { typing_status: 'on' }).toggle_typing_status
    end.not_to raise_error
  end

  it 'announces nothing without an actor' do
    described_class.new(conversation, nil, { typing_status: 'on' }).toggle_typing_status

    expect(Rails.configuration.dispatcher).not_to have_received(:dispatch).with(a_string_starting_with('conversation.typing'), any_args)
  end

  it 'announces nothing for a status it does not know' do
    described_class.new(conversation, agent, { typing_status: 'maybe' }).toggle_typing_status

    expect(Rails.configuration.dispatcher).not_to have_received(:dispatch).with(a_string_starting_with('conversation.typing'), any_args)
  end
end
