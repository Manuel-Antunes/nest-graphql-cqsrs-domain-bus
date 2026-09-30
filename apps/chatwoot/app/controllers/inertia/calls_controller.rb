module Inertia
  class CallsController < InertiaController
    before_action lambda {
      authorize_page!(permissions: %w[agent administrator conversation_manage conversation_unassigned_manage conversation_participating_manage],
                      installation_types: %w[cloud enterprise])
    }

    def index
      render inertia: 'Calls/Index'
    end
  end
end
