# frozen_string_literal: true

require 'openssl'
require 'base64'
require 'uri'

module BetterAuth
  # Better Auth's session cookie is `<token>.<base64 HMAC-SHA256(AUTH_SECRET, token)>`, which is what
  # every process of the platform verifies before trusting it. A cookie whose signature does not
  # match — or a deployment without the shared secret — authenticates nobody.
  module SessionCookie
    NAMES = %w[better-auth.session_token __Secure-better-auth.session_token].freeze
    DEVELOPMENT_SECRET = 'nest-graphql-posts-dev-secret-nao-use-em-producao'

    module_function

    def from_header(header)
      pairs = header.to_s.split(/;\s*/).filter_map { |pair| pair.split('=', 2) if pair.include?('=') }.to_h
      raw = NAMES.lazy.map { |name| pairs[name] }.find(&:present?)
      raw && URI.decode_uri_component(raw)
    end

    def token_of(raw)
      token, _, signature = raw.to_s.rpartition('.')
      return nil if token.blank? || signature.blank? || secret.blank?

      expected = Base64.strict_encode64(OpenSSL::HMAC.digest('SHA256', secret, token))
      ActiveSupport::SecurityUtils.secure_compare(expected, signature) ? token : nil
    end

    def secret
      ENV['AUTH_SECRET'].presence || (Rails.env.production? ? nil : DEVELOPMENT_SECRET)
    end
  end
end
