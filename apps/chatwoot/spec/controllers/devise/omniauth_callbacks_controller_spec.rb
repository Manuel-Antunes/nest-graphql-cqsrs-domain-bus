require 'rails_helper'

RSpec.describe 'DeviseOverrides::OmniauthCallbacksController', type: :request do
  it 'sends a callback no strategy answered to the platform sign-in: signing in with Google is the platform\'s' do
    with_modified_env PLATFORM_SIGN_IN_URL: 'https://platform.example/auth/sign-in' do
      get '/omniauth/google_oauth2/callback'

      expect(response).to redirect_to('https://platform.example/auth/sign-in')
    end
  end
end
