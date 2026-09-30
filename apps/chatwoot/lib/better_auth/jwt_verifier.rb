# frozen_string_literal: true

require 'jwt'
require 'json'
require 'base64'

module BetterAuth
  # Verifies an access token the platform's OAuth provider issued (`Authorization: Bearer <JWT>`)
  # WITHOUT any network call, exactly as the platform's own `oauth-bearer-session` plugin does:
  # signed by a key in `public.jwks` (the jwt plugin's table, keyed by the `kid` of the header),
  # issued by AUTH_ISSUER (WEB_URL when unset) and addressed to one of AUTH_OAUTH_RESOURCES
  # (GATEWAY_URL when unset). Its `sub` is the platform user id.
  class JwtVerifier
    @cache = {}
    @mutex = Mutex.new

    class << self
      # @return [Hash, nil] the decoded payload when valid; nil otherwise.
      def verify(authorization_header)
        token = bearer_of(authorization_header)
        return nil unless token

        header = decode_segment(token.split('.').first)
        kid = header['kid']
        alg = header['alg']
        return nil if kid.blank? || alg.blank?

        jwk_hash = jwk_for(kid)
        return nil if jwk_hash.nil?

        key = JWT::JWK.import(jwk_hash).public_key
        payload, = JWT.decode(
          token, key, true,
          algorithms: [alg], verify_expiration: true,
          iss: issuer, verify_iss: true,
          aud: audiences, verify_aud: true
        )
        payload
      rescue JWT::DecodeError => e
        Rails.logger.info "[BetterAuth JWT] rejected token: #{e.message}"
        nil
      rescue StandardError => e
        Rails.logger.warn "[BetterAuth JWT] verification error: #{e.message}"
        nil
      end

      def bearer_of(authorization_header)
        token = authorization_header.to_s.sub(/\ABearer\s+/i, '').strip
        token.count('.') == 2 ? token : nil
      end

      def issuer
        ENV['AUTH_ISSUER'].presence || ENV.fetch('WEB_URL', 'http://localhost:4200')
      end

      def audiences
        resources = ENV['AUTH_OAUTH_RESOURCES'].to_s.split(',').map(&:strip).compact_blank
        resources.presence || [ENV.fetch('GATEWAY_URL', 'http://localhost:4000/graphql')]
      end

      private

      # Public JWK (parsed Hash) for a kid, from `public.jwks`. Cached per-kid;
      # only non-nil results are cached so a later key rotation/addition is picked
      # up on the next request.
      def jwk_for(kid)
        cached = @mutex.synchronize { @cache[kid] }
        return cached if cached

        row = ActiveRecord::Base.connection.select_one(
          ActiveRecord::Base.sanitize_sql_array(
            ['SELECT public_key FROM public.jwks WHERE id = :kid', { kid: kid }]
          )
        )
        return nil unless row && row['public_key'].present?

        jwk = JSON.parse(row['public_key'])
        @mutex.synchronize { @cache[kid] = jwk }
        jwk
      end

      def decode_segment(segment)
        JSON.parse(Base64.urlsafe_decode64(pad(segment)))
      end

      def pad(str)
        str + ('=' * ((4 - (str.length % 4)) % 4))
      end
    end
  end
end
