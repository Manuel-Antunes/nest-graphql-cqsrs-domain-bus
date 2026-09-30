# lib/omniauth/strategies/better_auth.rb
require 'omniauth'
require 'better_auth/jwt_verifier'
require 'better_auth/platform'
require 'better_auth/session_cookie'

module OmniAuth
  module Strategies
    # Chatwoot has no sign-in of its own. Every request is authenticated by the platform's Better Auth
    # — the signed session cookie in a browser, a Better Auth access token as a bearer from the
    # gateway — and resolved to the Chatwoot user the platform's triggers mirror for it
    # (`chatwoot.users.platform_user_id`). The account is the one mirrored for the organization the
    # request names (`x-tenant`, as the gateway sends it) or, failing that, the session's active one.
    class BetterAuth < OmniAuth::Strategies::OAuth2
      option :name, :better_auth

      ACCOUNT_USER_ENV = 'platform.account_user'.freeze
      NATIVE_SIGN_IN = %r{\A/auth/(sign_in|password)(/|\z)}
      DASHBOARD = %r{\A/(app(/|\z)|\z)}
      STATELESS = %r{\A/graphql(/|\z)}

      def call!(env)
        # `@app.call(env)` dispatches down to the Rails router, which — for MOUNTED Rack apps
        # (e.g. `Sidekiq::Web` at /monitoring/sidekiq) — rewrites PATH_INFO to the mount-RELATIVE
        # path. The redirects must test the ORIGINAL request path, so snapshot it first.
        original_path = env['PATH_INFO'].to_s.dup
        req = Rack::Request.new(env)
        return refusal(403, 'Chatwoot is signed into through the platform') if req.post? && original_path.match?(NATIVE_SIGN_IN)

        authenticate(env, req, original_path)
        return refusal(401, 'The platform session this token belongs to has ended') if detached_token?(env)

        status, headers, body = @app.call(env)
        finish(Rack::Response.new(body, status, headers), original_path)
      end

      def uid
        @identity&.[]('platform_user_id')
      end

      def info
        { platform_user_id: uid, organization_id: @identity&.[]('organization_id') }
      end

      private

      def authenticate(env, req, original_path)
        raw_cookie = ::BetterAuth::SessionCookie.from(req.cookies)
        bearer = env['HTTP_AUTHORIZATION']

        if raw_cookie.present?
          @identity = session_identity(raw_cookie, env)
          authenticate_request(env, req, set_session_cookie: !original_path.match?(STATELESS)) if @identity
        elsif bearer.present?
          @identity = bearer_identity(bearer, env)
          authenticate_request(env, req, set_session_cookie: false) if @identity
        end

        sign_out_lingering_session(env) unless @identity
      rescue StandardError => e
        Rails.logger.error "[BetterAuth Strategy] Error: #{e.message}"
      end

      def finish(response, original_path)
        if @session_info
          response.set_cookie('cw_d_session_info', @session_info)
        elsif @session_info_to_delete
          response.delete_cookie('cw_d_session_info')
        end

        location = redirect_for(original_path)
        if location
          response.status = 302
          response.headers['Location'] = location
        end
        response.finish
      end

      def redirect_for(original_path)
        return platform_sign_in_url if @identity.nil? && original_path.match?(DASHBOARD)
        return @account_redirect_path if @account_redirect_path

        '/app' if @identity && (original_path == '/' || original_path.include?('/login'))
      end

      def refusal(status, message)
        [status, { 'Content-Type' => 'application/json' }, [{ errors: [message] }.to_json]]
      end

      # The dashboard's DeviseTokenAuth headers outlive the platform session that minted them, so
      # they are honoured only beside a platform session of the same user.
      def detached_token?(env)
        return false if env['HTTP_ACCESS_TOKEN'].blank? || env['HTTP_UID'].blank?

        @user.nil? || !ActiveSupport::SecurityUtils.secure_compare(@user.uid.to_s, env['HTTP_UID'].to_s)
      end

      def platform_sign_in_url
        ENV['PLATFORM_SIGN_IN_URL'].presence || "#{ENV.fetch('WEB_URL', 'http://localhost:4200')}/auth/sign-in"
      end

      def session_identity(raw_cookie, env)
        token = ::BetterAuth::SessionCookie.token_of(raw_cookie)
        unless token
          Rails.logger.warn('[BetterAuth] session cookie with an invalid signature — no user resolved')
          return nil
        end

        identity = ::BetterAuth::Platform.session(token)
        identity && with_tenant(identity, env)
      end

      def bearer_identity(bearer, env)
        payload = ::BetterAuth::JwtVerifier.verify(bearer)
        return nil if payload.blank? || payload['sub'].blank?

        identity = ::BetterAuth::Platform.user(payload['sub'])
        identity && with_tenant(identity, env)
      end

      # The organization a request names wins over the session's active one, and a request that names
      # one is held to it: no fallback to another account (see `account_user_for`).
      def with_tenant(identity, env)
        tenant = env['HTTP_X_TENANT']
        named = ::BetterAuth::Platform.organization_id_of_tenant(tenant)
        return identity.merge('named_tenant' => tenant.present?) unless named

        identity.merge('organization_id' => named, 'named_tenant' => true)
      end

      def sign_out_lingering_session(env)
        current_warden_user = env['warden']&.user(scope: :user)
        return unless current_warden_user

        Rails.logger.info "[BetterAuth] No platform session. Signing out #{current_warden_user.email} from Chatwoot."
        # Clear BOTH scopes: a super admin bridged from the platform session
        # must not outlive the platform session that granted it.
        env['warden'].logout(:user, :super_admin)
        @session_info_to_delete = true
      end

      # Map the identity to a Chatwoot user, set Warden, resolve the account, and
      # (for browser sessions) mint the cw_d_session_info cookie.
      def authenticate_request(env, req, set_session_cookie:)
        @user = User.find_by(platform_user_id: @identity['platform_user_id'])
        unless @user
          Rails.logger.warn "[BetterAuth] platform user #{@identity['platform_user_id']} has no Chatwoot user yet"
          @identity = nil
          return
        end

        bind_warden(env, set_session_cookie)
        account_user = account_user_for(@user)
        env[ACCOUNT_USER_ENV] = account_user
        return unless set_session_cookie

        activate(account_user)
        redirect_to_account(env, account_user)
        mint_session_cookie(req)
      end

      # For stateless calls don't persist a session (`store: false`) — the authentication applies
      # to this request only. A super admin is an STI User (type='SuperAdmin') — the platform's
      # `admin` role — and Chatwoot's admin panel checks a SEPARATE Devise :super_admin scope the
      # platform login never populates, so it is bridged too.
      def bind_warden(env, store)
        warden = env['warden']
        return unless warden

        current = warden.user(scope: :user)
        if current && current != @user
          Rails.logger.info "[BetterAuth] Session belongs to #{@user.email}, not #{current.email}. Switching user."
          warden.logout(:user)
          @session_info_forced_update = true
        end
        warden.set_user(@user, scope: :user, store: store) if current != @user
        warden.set_user(@user, scope: :super_admin, store: store) if @user.is_a?(SuperAdmin) && warden.user(scope: :super_admin) != @user
      end

      # The dashboard opens on the user's active account, so a browser session keeps it in step with
      # the platform's active organization. Stateless calls never touch it: two of them naming two
      # tenants at once would otherwise flip it under each other.
      def activate(account_user)
        return unless account_user
        return if @user.active_account_user&.account_id == account_user.account_id

        account_user.update(active_at: Time.now.utc)
        @session_info_forced_update = true
      end

      def redirect_to_account(env, account_user)
        url_account_id = env['PATH_INFO'].to_s.match(%r{/app/accounts/(\d+)})&.[](1)&.to_i
        return unless account_user && url_account_id && url_account_id != account_user.account_id

        @account_redirect_path = "/app/accounts/#{account_user.account_id}/dashboard"
      end

      def mint_session_cookie(req)
        return unless req.cookies['cw_d_session_info'].blank? || @session_info_forced_update

        auth_headers = @user.create_new_auth_token
        return unless @user.save

        @session_info = {
          value: auth_headers.to_json,
          expires: Time.zone.at(auth_headers['expiry'].to_i),
          path: '/',
          same_site: :lax
        }
      end

      # Which Chatwoot account this request operates on:
      #   1. the account mirrored for the organization the request names or the session has active;
      #   2. when the request NAMED none, the user's active account, else their first membership —
      #      the dashboard stays usable for a user without an active organization.
      def account_user_for(user)
        mapped = mapped_account_user(user)
        return mapped if mapped || @identity['named_tenant']

        user.active_account_user || user.account_users.order(:account_id).first
      end

      def mapped_account_user(user)
        organization_id = @identity['organization_id']
        return nil if organization_id.blank?

        Account.find_by(platform_organization_id: organization_id)&.account_users&.find_by(user_id: user.id)
      end
    end
  end
end
