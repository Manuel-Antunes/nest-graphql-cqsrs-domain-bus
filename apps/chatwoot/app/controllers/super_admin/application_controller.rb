# All Administrate controllers inherit from this
# `Administrate::ApplicationController`, making it the ideal place to put
# authentication logic or other before_actions.
#
# If you want to add pagination or other controller-level concerns,
# you're free to overwrite the RESTful controller actions.
class SuperAdmin::ApplicationController < Administrate::ApplicationController
  include ActionView::Helpers::TagHelper
  include ActionView::Context
  include SuperAdmin::NavigationHelper

  helper_method :render_vue_component, :settings_open?, :settings_pages
  # authenticiation done via devise : SuperAdmin Model. The :super_admin Warden
  # scope is bridged from the platform (BetterAuth) :user session by the Rack
  # strategy (lib/omni_auth/strategies/better_auth.rb), so an already-logged-in
  # super admin passes this guard without a second login.
  before_action :authenticate_super_admin!
  # Administrate ships its UI strings in English only, but the app renders in
  # pt_BR — so every administrate.* key produced a "translation missing" span,
  # which also leaked HTML into the search <input placeholder>. Render the admin
  # panel in English so Administrate's own translations resolve.
  around_action :render_admin_panel_in_english

  # Override this value to specify the number of elements to display at a time
  # on index pages. Defaults to 20.
  # def records_per_page
  #   params[:per_page] || 20
  # end

  def order
    @order ||= Administrate::Order.new(
      params.fetch(resource_name, {}).fetch(:order, 'id'),
      params.fetch(resource_name, {}).fetch(:direction, 'desc')
    )
  end

  private

  def render_admin_panel_in_english(&)
    I18n.with_locale(:en, &)
  end

  def render_vue_component(component_name, props = {})
    html_options = {
      id: 'app',
      data: {
        component_name: component_name,
        props: props.to_json
      }
    }
    content_tag(:div, '', html_options)
  end

  def invalid_action_perfomed
    # rubocop:disable Rails/I18nLocaleTexts
    flash[:error] = 'Invalid action performed'
    # rubocop:enable Rails/I18nLocaleTexts
    redirect_back(fallback_location: root_path)
  end
end
