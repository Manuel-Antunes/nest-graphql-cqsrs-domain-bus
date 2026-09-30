# frozen_string_literal: true

# The platform access token an agent bot acts with: a JWT the platform's OAuth provider issues to the bot's
# OAuth client — `chatwoot-agent-bot-<id>`, its secret the bot's access token, kept by the triggers of
# db/migrate/20260930120000_create_agent_bot_oauth_clients.rb — through the client credentials grant,
# addressed to the gateway and scoped to `write:conversations`. The gateway hands it back to Chatwoot as the
# bot's own `api_access_token`. It is cached until shortly before it expires, keyed by the bot's secret too,
# so a rotated token never answers with a JWT the old one obtained.
#
# A bot with no platform client — a system bot, a bot of an account no organization is mirrored to — or a
# token endpoint that refuses or cannot be reached answers nil, and the caller delivers without a token.
class AgentBots::PlatformAccessToken
  CLIENT_ID_PREFIX = 'chatwoot-agent-bot-'
  SCOPE = 'write:conversations'
  EXPIRY_MARGIN = 60
  DEFAULT_EXPIRES_IN = 3600
  TIMEOUT = 5

  def self.for(agent_bot)
    new(agent_bot).token
  end

  def initialize(agent_bot)
    @agent_bot = agent_bot
  end

  # @return [String, nil]
  def token
    return nil unless platform_client?

    Rails.cache.read(cache_key) || issue
  rescue StandardError => e
    Rails.logger.warn "[AgentBots::PlatformAccessToken] no platform token for agent bot #{@agent_bot.id}: #{e.message}"
    nil
  end

  private

  def platform_client?
    secret.present? && @agent_bot.account&.platform_organization_id.present?
  end

  def secret
    @agent_bot.access_token&.token
  end

  def issue
    response = RestClient::Request.execute(method: :post, url: BetterAuth::Platform.token_url, payload: grant, timeout: TIMEOUT)
    body = JSON.parse(response.body)
    access_token = body.fetch('access_token')
    ttl = (body['expires_in'] || DEFAULT_EXPIRES_IN).to_i - EXPIRY_MARGIN
    Rails.cache.write(cache_key, access_token, expires_in: ttl) if ttl.positive?
    access_token
  end

  def grant
    {
      grant_type: 'client_credentials',
      client_id: "#{CLIENT_ID_PREFIX}#{@agent_bot.id}",
      client_secret: secret,
      scope: SCOPE,
      resource: BetterAuth::JwtVerifier.audiences.first
    }
  end

  def cache_key
    "agent_bots:platform_access_token:#{@agent_bot.id}:#{Digest::SHA256.hexdigest(secret)}"
  end
end
