class Inboxes::EvolutionApi::SetupService
  class SetupError < StandardError; end

  REQUEST_TIMEOUT = 15

  def initialize(channel:, user:)
    @channel = channel
    @user = user
  end

  SQS_EVENTS = %w[MESSAGES_SET MESSAGES_UPSERT MESSAGES_UPDATE].freeze

  def perform!
    validate_parameters!
    ensure_instance_exists!
    register_chatwoot_integration!
    enable_sqs_events!
    mark_configured!
  end

  private

  attr_reader :channel, :user

  def validate_parameters!
    raise ArgumentError, 'Channel is required' if channel.blank?
    raise ArgumentError, 'User is required to issue an access token for Evolution callbacks' if user.blank?
    raise SetupError, 'EVOLUTION_API_URL env var is not configured' if channel.evolution_url.blank?
    raise SetupError, 'EVOLUTION_API_KEY env var is not configured' if channel.evolution_apikey.blank?
    raise SetupError, 'Evolution instance name is required' if channel.instance_name.blank?
    raise SetupError, 'CHATWOOT_PUBLIC_URL or FRONTEND_URL env var must be set so Evolution can call back into Chatwoot' if chatwoot_callback_url.blank?
  end

  def ensure_instance_exists!
    return if instance_exists?

    response = HTTParty.post(
      "#{base_url}/instance/create",
      headers: request_headers,
      body: {
        instanceName: channel.instance_name,
        integration: 'WHATSAPP-BAILEYS',
        number: channel.phone_number
      }.compact.to_json,
      timeout: REQUEST_TIMEOUT
    )

    return if response.success?
    return if response.code == 403 && response.body.to_s.include?('already in use')

    raise SetupError, "Failed to create Evolution instance: #{response.code} #{response.body}"
  end

  def instance_exists?
    response = HTTParty.get(
      "#{base_url}/instance/fetchInstances",
      headers: request_headers,
      query: { instanceName: channel.instance_name },
      timeout: REQUEST_TIMEOUT
    )
    return false unless response.success?

    payload = response.parsed_response
    instances = payload.is_a?(Array) ? payload : Array(payload['instances'])
    instances.any? { |entry| matches_instance?(entry) }
  rescue StandardError => e
    Rails.logger.warn("[EVOLUTION_API] instance lookup failed: #{e.message}")
    false
  end

  def matches_instance?(entry)
    return false unless entry.is_a?(Hash)

    name = entry.dig('instance', 'instanceName') || entry['instanceName'] || entry['name']
    name.to_s == channel.instance_name.to_s
  end

  def register_chatwoot_integration!
    payload = chatwoot_payload
    Rails.logger.info(
      "[EVOLUTION_API] registering chatwoot integration instance=#{channel.instance_name} " \
      "callback_url=#{payload[:url]} account_id=#{payload[:accountId]} inbox=#{payload[:nameInbox]}"
    )

    response = HTTParty.post(
      "#{base_url}/chatwoot/set/#{ERB::Util.url_encode(channel.instance_name)}",
      headers: request_headers,
      body: payload.to_json,
      timeout: REQUEST_TIMEOUT
    )

    return if response.success?

    raise SetupError, "Failed to register Chatwoot integration in Evolution: #{response.code} #{response.body}"
  end

  def enable_sqs_events!
    response = HTTParty.post(
      "#{base_url}/sqs/set/#{ERB::Util.url_encode(channel.instance_name)}",
      headers: request_headers,
      body: { sqs: { enabled: true, events: SQS_EVENTS } }.to_json,
      timeout: REQUEST_TIMEOUT
    )

    return if response.success?

    raise SetupError, "Failed to enable SQS events on Evolution: #{response.code} #{response.body}"
  end

  def chatwoot_payload
    {
      enabled: true,
      accountId: channel.account_id.to_s,
      token: chatwoot_access_token,
      url: chatwoot_callback_url,
      nameInbox: channel.inbox&.name,
      signMsg: false,
      signDelimiter: "\n",
      reopenConversation: true,
      conversationPending: false,
      mergeBrazilContacts: false,
      importContacts: false,
      importMessages: false,
      autoCreate: false,
      number: channel.phone_number
    }.compact
  end

  def chatwoot_callback_url
    raw = ENV['CHATWOOT_PUBLIC_URL'].presence || ENV['FRONTEND_URL'].presence
    raw&.chomp('/')
  end

  def chatwoot_access_token
    access_token = user.access_token || AccessToken.create!(owner: user)
    access_token.token
  end

  def mark_configured!
    channel.update_columns(
      additional_attributes: (channel.additional_attributes || {}).merge(
        'evolution_status' => 'configured',
        'last_synced_at' => Time.zone.now
      )
    )
  end

  def base_url
    channel.evolution_url.to_s.chomp('/')
  end

  def request_headers
    {
      'Content-Type' => 'application/json',
      'apikey' => channel.evolution_apikey
    }
  end
end
