# == Schema Information
#
# Table name: agent_bots
#
#  id           :bigint           not null, primary key
#  bot_config   :jsonb
#  bot_type     :integer          default("webhook")
#  description  :string
#  name         :string
#  outgoing_url :string
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  account_id   :bigint
#
# Indexes
#
#  index_agent_bots_on_account_id  (account_id)
#

class AgentBot < ApplicationRecord
  include AccessTokenable
  include Avatarable

  scope :accessible_to, lambda { |account|
    account_id = account&.id
    where(account_id: [nil, account_id])
  }

  has_many :agent_bot_inboxes, dependent: :destroy_async
  has_many :inboxes, through: :agent_bot_inboxes
  has_many :messages, as: :sender, dependent: :nullify
  has_many :assigned_conversations, class_name: 'Conversation',
                                    foreign_key: :assignee_agent_bot_id,
                                    dependent: :nullify,
                                    inverse_of: :assignee_agent_bot
  belongs_to :account, optional: true
  # `webhook` bots POST events to `outgoing_url` (legacy behaviour).
  # `inner_queue` bots publish events onto an internal Redis pub/sub channel
  # consumed by our NestJS agents subscriber — no outgoing HTTP call.
  enum bot_type: { webhook: 0, inner_queue: 1 }

  # `outgoing_url` is only meaningful for webhook bots. It is never required
  # (length-only validation), so inner_queue bots save fine with a blank URL.
  validates :outgoing_url, length: { maximum: Limits::URL_LENGTH_LIMIT }

  def available_name
    name
  end

  def push_event_data(inbox = nil)
    {
      id: id,
      name: name,
      avatar_url: avatar_url || inbox&.avatar_url,
      type: 'agent_bot'
    }
  end

  def webhook_data
    {
      id: id,
      name: name,
      type: 'agent_bot'
    }
  end

  def system_bot?
    account.nil?
  end

  # A bot with an organization is a platform OAuth client — these mirror
  # db/migrate/20260930120000_create_agent_bot_oauth_clients.rb, which explains them.
  trigger.name('agent_bots_oauth_client_refresh').after(:update).of(:name, :account_id) do
    <<~PLPGSQL
      IF to_regclass('public.oauth_client') IS NULL THEN
          RETURN NULL;
      END IF;
      EXECUTE format('UPDATE %I.access_tokens SET updated_at = now() WHERE owner_type = $1 AND owner_id = $2', TG_TABLE_SCHEMA)
          USING 'AgentBot', NEW.id;
    PLPGSQL
  end

  trigger.name('agent_bots_oauth_client_delete').after(:delete) do
    <<~PLPGSQL
      IF to_regclass('public.oauth_client') IS NULL THEN
          RETURN NULL;
      END IF;
      DELETE FROM public.oauth_client WHERE id = 'chatwoot-agent-bot-' || OLD.id;
    PLPGSQL
  end
end
