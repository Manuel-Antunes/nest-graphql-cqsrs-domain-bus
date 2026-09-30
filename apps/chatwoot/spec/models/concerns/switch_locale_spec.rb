require 'rails_helper'

RSpec.describe 'SwitchLocale Concern', type: :controller do
  controller(ApplicationController) do
    include SwitchLocale

    def index
      switch_locale { render plain: I18n.locale }
    end
  end

  let(:account) { create(:account, locale: 'es') }
  let(:portal) { create(:portal, custom_domain: 'custom.example.com', config: { default_locale: 'fr_FR' }) }
  let(:installation_locale) { I18n.default_locale.to_s }

  describe '#switch_locale' do
    it 'renders in the installation locale' do
      get :index
      expect(response.body).to eq(installation_locale)
    end

    it 'ignores a locale asked for in params' do
      get :index, params: { locale: 'es' }
      expect(response.body).to eq(installation_locale)
    end

    it 'ignores the locale of a portal on a custom domain' do
      request.host = portal.custom_domain

      get :index
      expect(response.body).to eq(installation_locale)
    end

    it 'ignores DEFAULT_LOCALE' do
      with_modified_env(DEFAULT_LOCALE: 'de_DE') do
        get :index
        expect(response.body).to eq(installation_locale)
      end
    end
  end

  describe '#switch_locale_using_account_locale' do
    it 'ignores the account locale' do
      controller.instance_variable_set(:@current_account, account)

      result = nil
      controller.send(:switch_locale_using_account_locale) do
        result = I18n.locale.to_s
      end

      expect(result).to eq(installation_locale)
    end
  end

  describe '#locale_from_user' do
    it 'returns the locale a user keeps in ui_settings' do
      controller.instance_variable_set(:@user, create(:user, ui_settings: { 'locale' => 'es' }))

      expect(controller.send(:locale_from_user)).to eq('es')
    end

    it 'returns nil for a user without one' do
      controller.instance_variable_set(:@user, create(:user, ui_settings: {}))

      expect(controller.send(:locale_from_user)).to be_nil
    end
  end
end
