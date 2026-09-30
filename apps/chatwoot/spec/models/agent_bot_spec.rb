require 'rails_helper'
require Rails.root.join 'spec/models/concerns/access_tokenable_shared.rb'
require Rails.root.join 'spec/models/concerns/avatarable_shared.rb'

RSpec.describe AgentBot do
  describe 'associations' do
    it { is_expected.to have_many(:agent_bot_inboxes) }
    it { is_expected.to have_many(:inboxes) }
    it { is_expected.to have_many(:platform_app_permissibles) }
  end

  describe 'concerns' do
    it_behaves_like 'access_tokenable'
    it_behaves_like 'avatarable'
  end

  context 'when it validates outgoing_url length' do
    let(:agent_bot) { create(:agent_bot) }

    it 'valid when within limit' do
      agent_bot.outgoing_url = 'a' * Limits::URL_LENGTH_LIMIT
      expect(agent_bot.valid?).to be true
    end

    it 'invalid when crossed the limit' do
      agent_bot.outgoing_url = 'a' * (Limits::URL_LENGTH_LIMIT + 1)
      agent_bot.valid?
      expect(agent_bot.errors[:outgoing_url]).to include("is too long (maximum is #{Limits::URL_LENGTH_LIMIT} characters)")
    end
  end

  context 'when agent bot is deleted' do
    let(:agent_bot) { create(:agent_bot) }
    let(:message) { create(:message, sender: agent_bot) }

    it 'nullifies the message sender key' do
      expect(message.sender).to eq agent_bot
      agent_bot.destroy!

      expect(message.reload.sender).to be_nil
    end

    it 'destroys associated platform_app_permissibles' do
      platform_app = create(:platform_app)
      create(:platform_app_permissible, platform_app: platform_app, permissible: agent_bot)

      expect { agent_bot.destroy! }.to change(PlatformAppPermissible, :count).by(-1)
    end
  end

  describe '#system_bot?' do
    context 'when account_id is nil' do
      let(:agent_bot) { create(:agent_bot, account_id: nil) }

      it 'returns true' do
        expect(agent_bot.system_bot?).to be true
      end
    end

    context 'when account_id is present' do
      let(:account) { create(:account) }
      let(:agent_bot) { create(:agent_bot, account: account) }

      it 'returns false' do
        expect(agent_bot.system_bot?).to be false
      end
    end
  end

  describe 'bot_type' do
    it 'defaults to webhook' do
      expect(described_class.new.bot_type).to eq('webhook')
    end

    it 'exposes the webhook predicate' do
      agent_bot = create(:agent_bot, bot_type: :webhook)
      expect(agent_bot.webhook?).to be true
      expect(agent_bot.inner_queue?).to be false
    end

    it 'exposes the inner_queue predicate' do
      agent_bot = create(:agent_bot, bot_type: :inner_queue)
      expect(agent_bot.inner_queue?).to be true
      expect(agent_bot.webhook?).to be false
    end

    it 'allows an inner_queue bot to save with a blank outgoing_url' do
      agent_bot = build(:agent_bot, bot_type: :inner_queue, outgoing_url: nil)
      expect(agent_bot.valid?).to be true
    end
  end
end
