module Inertia
  # Authenticated user who belongs to NO account. There is no :account_id in the URL, so
  # skip the account-scoping gate (it would redirect); only Current.user is needed.
  class NoAccountsController < InertiaController
    skip_before_action :set_current_account_for_inertia

    def index
      render inertia: 'NoAccounts/Index'
    end
  end
end
