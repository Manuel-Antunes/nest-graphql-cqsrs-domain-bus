module Inertia
  class SuspendedController < InertiaController
    before_action lambda {
      authorize_page!(permissions: %w[administrator agent custom_role])
    }

    def index
      render inertia: 'Suspended/Index'
    end
  end
end
