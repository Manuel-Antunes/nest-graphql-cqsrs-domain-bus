# Builds the @global_config that the frontend reads from window.globalConfig /
# window.chatwootConfig. Extracted so both the legacy DashboardController (vueapp
# layout) and the new InertiaController (inertia layout) inject an identical config.
# Mirrors DashboardController's original inline implementation.
module SetGlobalConfig
  extend ActiveSupport::Concern

  GLOBAL_CONFIG_KEYS = %w[
    LOGO
    LOGO_DARK
    LOGO_THUMBNAIL
    INSTALLATION_NAME
    WIDGET_BRAND_URL
    TERMS_URL
    BRAND_URL
    BRAND_NAME
    PRIVACY_URL
    DISPLAY_MANIFEST
    CREATE_NEW_ACCOUNT_FROM_DASHBOARD
    CHATWOOT_INBOX_TOKEN
    API_CHANNEL_NAME
    API_CHANNEL_THUMBNAIL
    CLOUD_ANALYTICS_TOKEN
    DIRECT_UPLOADS_ENABLED
    MAXIMUM_FILE_UPLOAD_SIZE
    HCAPTCHA_SITE_KEY
    LOGOUT_REDIRECT_LINK
    DISABLE_USER_PROFILE_UPDATE
    DEPLOYMENT_ENV
    INSTALLATION_PRICING_PLAN
  ].freeze

  private

  def set_global_config
    @global_config = GlobalConfig.get(*GLOBAL_CONFIG_KEYS).merge(app_config)
  end

  def app_config
    {
      APP_VERSION: Chatwoot.config[:version],
      VAPID_PUBLIC_KEY: VapidService.public_key,
      ENABLE_ACCOUNT_SIGNUP: GlobalConfigService.load('ENABLE_ACCOUNT_SIGNUP', 'false'),
      FB_APP_ID: GlobalConfigService.load('FB_APP_ID', ''),
      INSTAGRAM_APP_ID: GlobalConfigService.load('INSTAGRAM_APP_ID', ''),
      TIKTOK_APP_ID: GlobalConfigService.load('TIKTOK_APP_ID', ''),
      FACEBOOK_API_VERSION: GlobalConfigService.load('FACEBOOK_API_VERSION', 'v18.0'),
      WHATSAPP_APP_ID: GlobalConfigService.load('WHATSAPP_APP_ID', ''),
      WHATSAPP_CONFIGURATION_ID: GlobalConfigService.load('WHATSAPP_CONFIGURATION_ID', ''),
      IS_ENTERPRISE: ChatwootApp.enterprise?,
      AZURE_APP_ID: GlobalConfigService.load('AZURE_APP_ID', ''),
      GIT_SHA: GIT_HASH,
      LOCK_TO_NATASHA_INBOX: ENV.fetch('LOCK_TO_NATASHA_INBOX', 'false').to_s.downcase,
      NATASHA_INBOX_ID: ENV.fetch('NATASHA_INBOX_ID', '2').to_s,
      ALLOWED_LOGIN_METHODS: allowed_login_methods
    }
  end

  def allowed_login_methods
    methods = ['email']
    methods << 'google_oauth' if GlobalConfigService.load('ENABLE_GOOGLE_OAUTH_LOGIN', 'true').to_s != 'false'
    methods << 'saml' if ChatwootHub.pricing_plan != 'community' && GlobalConfigService.load('ENABLE_SAML_SSO_LOGIN', 'true').to_s != 'false'
    methods
  end
end
