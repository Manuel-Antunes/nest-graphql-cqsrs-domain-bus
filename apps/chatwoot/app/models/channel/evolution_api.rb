# == Schema Information
#
# Table name: channel_evolution_api
#
#  id                    :bigint           not null, primary key
#  additional_attributes :jsonb
#  evolution_apikey      :text
#  evolution_url         :string
#  hmac_mandatory        :boolean          default(FALSE)
#  hmac_token            :string
#  identifier            :string
#  instance_name         :string
#  phone_number          :string
#  webhook_url           :string
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  account_id            :integer          not null
#
# Indexes
#
#  index_channel_evolution_api_on_account_id                       (account_id)
#  index_channel_evolution_api_on_account_id_and_instance_name     (account_id,instance_name) UNIQUE
#  index_channel_evolution_api_on_hmac_token                       (hmac_token) UNIQUE
#  index_channel_evolution_api_on_identifier                       (identifier) UNIQUE
#

class Channel::EvolutionApi < ApplicationRecord
  include Channelable

  self.table_name = 'channel_evolution_api'
  EDITABLE_ATTRS = [:instance_name, :phone_number, :hmac_mandatory,
                    { additional_attributes: {} }].freeze

  has_secure_token :identifier
  has_secure_token :hmac_token

  # TODO: Remove guard once encryption keys become mandatory.
  encrypts :evolution_apikey if Chatwoot.encryption_configured?

  validates :instance_name, presence: true, uniqueness: { scope: :account_id }
  validates :webhook_url, length: { maximum: Limits::URL_LENGTH_LIMIT }
  validate :ensure_valid_agent_reply_time_window

  before_validation :apply_env_defaults
  before_validation :compute_webhook_url
  before_destroy :run_teardown_service

  def self.env_url
    ENV.fetch('EVOLUTION_API_URL', nil)
  end

  def self.env_apikey
    ENV.fetch('EVOLUTION_API_KEY', nil)
  end

  def name
    'Evolution API'
  end

  private

  def apply_env_defaults
    self.evolution_url = self.class.env_url if evolution_url.blank?
    self.evolution_apikey = self.class.env_apikey if evolution_apikey.blank?
  end

  def compute_webhook_url
    return if evolution_url.blank? || instance_name.blank?

    self.webhook_url = "#{evolution_url.to_s.chomp('/')}/chatwoot/webhook/#{ERB::Util.url_encode(instance_name)}"
  end

  def run_teardown_service
    Inboxes::EvolutionApi::TeardownService.new(channel: self).perform
  rescue StandardError => e
    Rails.logger.warn("[EVOLUTION_API] teardown best-effort failed for instance=#{instance_name}: #{e.message}")
  end

  def ensure_valid_agent_reply_time_window
    return if additional_attributes['agent_reply_time_window'].blank?
    return if additional_attributes['agent_reply_time_window'].to_i.positive?

    errors.add(:agent_reply_time_window, 'agent_reply_time_window must be greater than 0')
  end
end
