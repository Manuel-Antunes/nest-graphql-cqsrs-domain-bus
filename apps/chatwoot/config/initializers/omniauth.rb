# config/initializers/omniauth.rb
require 'omni_auth/strategies/better_auth'

Rails.application.config.middleware.use OmniAuth::Builder do
  provider :better_auth
end
