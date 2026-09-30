class Inboxes::EvolutionApi::TeardownService
  REQUEST_TIMEOUT = 10

  def initialize(channel:)
    @channel = channel
  end

  def perform
    return if channel.evolution_url.blank? || channel.instance_name.blank? || channel.evolution_apikey.blank?

    disable_chatwoot_integration
    logout_instance
  end

  private

  attr_reader :channel

  def disable_chatwoot_integration
    HTTParty.post(
      "#{base_url}/chatwoot/set/#{ERB::Util.url_encode(channel.instance_name)}",
      headers: request_headers,
      body: { enabled: false }.to_json,
      timeout: REQUEST_TIMEOUT
    )
  rescue StandardError => e
    Rails.logger.warn("[EVOLUTION_API] disable integration failed for #{channel.instance_name}: #{e.message}")
  end

  def logout_instance
    HTTParty.delete(
      "#{base_url}/instance/logout/#{ERB::Util.url_encode(channel.instance_name)}",
      headers: request_headers,
      timeout: REQUEST_TIMEOUT
    )
  rescue StandardError => e
    Rails.logger.warn("[EVOLUTION_API] logout instance failed for #{channel.instance_name}: #{e.message}")
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
