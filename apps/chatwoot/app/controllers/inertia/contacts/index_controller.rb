module Inertia
  module Contacts
    # Contacts list group (docs Phase 1): index + active + segments + labels all render
    # the same ContactsIndex shell. The page reads segmentId/label from the URL via
    # useAppNavigation().currentParams and self-fetches via the existing Vuex/REST path
    # (contacts/*). NO data props — the controller only enforces the same gates the
    # vue-router meta carried (permissions + featureFlag: 'crm').
    class IndexController < InertiaController
      CONTACT_PERMISSIONS = %w[administrator agent contact_manage].freeze

      before_action lambda {
        authorize_page!(permissions: CONTACT_PERMISSIONS, feature_flag: 'crm')
      }

      def index
        render inertia: 'Contacts/Index/Index'
      end

      def active
        render inertia: 'Contacts/Index/Index'
      end

      def segments
        render inertia: 'Contacts/Index/Index'
      end

      def labels
        render inertia: 'Contacts/Index/Index'
      end
    end
  end
end
