# Signs access tokens the way the platform's OAuth provider does, with a key published where
# BetterAuth::JwtVerifier looks for it: `public.jwks`, which the test database lacks and so gets,
# inside the example's transaction.
module PlatformAccessTokens
  def platform_access_token(claims)
    jwk = JWT::JWK.new(OpenSSL::PKey::EC.generate('prime256v1'), kid: "test-#{SecureRandom.hex(8)}")
    publish_platform_key(jwk)

    now = Time.current.to_i
    payload = { 'iss' => BetterAuth::JwtVerifier.issuer, 'aud' => BetterAuth::JwtVerifier.audiences.first, 'iat' => now, 'exp' => now + 3600 }
    JWT.encode(payload.merge(claims.stringify_keys), jwk.signing_key, 'ES256', kid: jwk.kid)
  end

  def agent_bot_access_token(agent_bot, **overrides)
    platform_access_token(
      {
        'sub' => "chatwoot-agent-bot-#{agent_bot.id}",
        'scope' => 'write:conversations',
        'agent_bot_id' => agent_bot.id,
        'organization_id' => agent_bot.account&.platform_organization_id
      }.merge(overrides.stringify_keys)
    )
  end

  private

  def publish_platform_key(jwk)
    connection = ActiveRecord::Base.connection
    connection.execute(
      'CREATE TABLE IF NOT EXISTS public.jwks (id text PRIMARY KEY, public_key text NOT NULL, private_key text, created_at timestamptz)'
    )
    connection.execute(
      ActiveRecord::Base.sanitize_sql_array(
        ['INSERT INTO public.jwks (id, public_key, created_at) VALUES (?, ?, now())', jwk.kid, jwk.export.to_json]
      )
    )
  end
end

RSpec.configure do |config|
  config.include PlatformAccessTokens, :platform_access_token
end
