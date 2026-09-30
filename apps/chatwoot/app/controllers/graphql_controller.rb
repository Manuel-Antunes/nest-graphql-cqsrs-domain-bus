# frozen_string_literal: true

class GraphqlController < ApplicationController
  # Support both session/JWT users (via DeviseTokenAuth, set in ApplicationController)
  # and service callers using an `api_access_token` header (agent bots / service
  # tokens), exactly like the REST API.
  include AccessTokenAuthHelper

  # If accessing from outside this domain, nullify the session
  # This allows for outside API access while preventing CSRF attacks,
  # but you'll have to authenticate your user separately
  # protect_from_forgery with: :null_session

  def execute
    authenticate_graphql_request
    variables = prepare_variables(params[:variables])
    query = params[:query]
    operation_name = params[:operationName]
    context = {
      current_user: Current.user,
      current_account: Current.account,
      current_account_user: Current.account_user,
      pundit_user: pundit_user
    }
    result = ChatwootSchema.execute(query, variables: variables, context: context, operation_name: operation_name)
    render json: result
  rescue StandardError => e
    raise e unless Rails.env.development?
    handle_error_in_development(e)
  end

  private

  def authenticate_graphql_request
    authenticate_via_access_token
    adopt_better_auth_jwt_user
    set_graphql_current_account
  end

  # The BetterAuth OmniAuth strategy authenticates a forwarded IdP JWT (the
  # gateway / Apollo MCP path) and sets the Warden user. But DeviseTokenAuth's
  # `current_user` ignores that Warden user when an unrecognized
  # `Authorization: Bearer` header is present, so ApplicationController leaves
  # Current.user nil and every JWT-authenticated query was "Unauthenticated.".
  # Adopt the Warden-resolved user when no other identity was established.
  def adopt_better_auth_jwt_user
    return if Current.user

    warden_user = request.env['warden']&.user(scope: :user)
    Current.user = warden_user if warden_user
  end

  # When an `api_access_token` header is present, resolve the owner (User or
  # AgentBot) into Current.user, mirroring AccessTokenAuthHelper. Session/JWT
  # users are already set by ApplicationController#set_current_user.
  def authenticate_via_access_token
    return if access_token_header.blank?

    ensure_access_token
    Current.user = @access_token.owner if @access_token && allowed_current_user_type?(@access_token.owner)
  end

  def access_token_header
    request.headers[:api_access_token] || request.headers[:HTTP_API_ACCESS_TOKEN]
  end

  # GraphQL requests are not routed through the account_id URL segment, so
  # Current.account is not set by EnsureCurrentAccountHelper. Resolve it from the
  # caller so every resolver/mutation operates on a single account:
  #   * User    -> the account_user the BetterAuth strategy resolved for THIS request
  #                (the organization its `x-tenant` names, even when that is none), and
  #                their active one only when the strategy did not authenticate it.
  #   * AgentBot -> the account the bot belongs to.
  def set_graphql_current_account
    account, account_user = account_for_current_user
    if account&.active?
      Current.account = account
      Current.account_user = account_user
    else
      Current.account = nil
      Current.account_user = nil
    end
  end

  def account_for_current_user
    user = Current.user
    return [nil, nil] if user.blank?
    return [user.account, nil] if user.is_a?(AgentBot)

    account_user = account_user_of(user)
    [account_user&.account, account_user]
  end

  def account_user_of(user)
    key = OmniAuth::Strategies::BetterAuth::ACCOUNT_USER_ENV
    return user.active_account_user unless request.env.key?(key)

    account_user = request.env[key]
    account_user if account_user&.user_id == user.id
  end

  # Handle variables in form data, JSON body, or a blank value
  def prepare_variables(variables_param)
    case variables_param
    when String
      if variables_param.present?
        JSON.parse(variables_param) || {}
      else
        {}
      end
    when Hash
      variables_param
    when ActionController::Parameters
      variables_param.to_unsafe_hash # GraphQL-Ruby will validate name and type of incoming variables.
    when nil
      {}
    else
      raise ArgumentError, "Unexpected parameter: #{variables_param}"
    end
  end

  def handle_error_in_development(e)
    logger.error e.message
    logger.error e.backtrace.join("\n")

    render json: { errors: [{ message: e.message, backtrace: e.backtrace }], data: {} }, status: 500
  end
end
