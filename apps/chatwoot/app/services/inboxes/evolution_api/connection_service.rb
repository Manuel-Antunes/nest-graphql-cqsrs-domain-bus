class Inboxes::EvolutionApi::ConnectionService
  class ConnectionError < StandardError; end

  REQUEST_TIMEOUT = 15

  def initialize(channel:)
    @channel = channel
  end

  def fetch_qr_code!
    response = HTTParty.get(
      "#{base_url}/instance/connect/#{ERB::Util.url_encode(channel.instance_name)}",
      headers: request_headers,
      timeout: REQUEST_TIMEOUT
    )

    raise ConnectionError, "Failed to fetch QR code: #{response.code} #{response.body}" unless response.success?

    payload = response.parsed_response || {}
    {
      pairing_code: payload['pairingCode'],
      code: payload['code'],
      base64: payload['base64'],
      count: payload['count']
    }
  end

  def fetch_connection_state!
    response = HTTParty.get(
      "#{base_url}/instance/connectionState/#{ERB::Util.url_encode(channel.instance_name)}",
      headers: request_headers,
      timeout: REQUEST_TIMEOUT
    )

    raise ConnectionError, "Failed to fetch connection state: #{response.code} #{response.body}" unless response.success?

    state = response.parsed_response.dig('instance', 'state').to_s
    persist_connection_state!(state)
    { state: state }
  end

  private

  attr_reader :channel

  def persist_connection_state!(state)
    previous = channel.additional_attributes || {}
    attrs = previous.merge('connection_state' => state)
    attrs['connected_at'] = Time.zone.now if state == 'open' && previous['connection_state'] != 'open'
    channel.update_columns(additional_attributes: attrs) # rubocop:disable Rails/SkipsModelValidations
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
