module Inertia
  module Contacts
    # Contact detail/edit group: edit + edit_segment + edit_label all render the same
    # ContactManageView shell. The page reads contactId from the URL via
    # useAppNavigation().currentParams and self-fetches via the existing Vuex/REST path.
    # NO data props — same gates the vue-router meta carried (permissions + featureFlag: 'crm').
    class ManageViewController < InertiaController
      CONTACT_PERMISSIONS = %w[administrator agent contact_manage].freeze

      before_action lambda {
        authorize_page!(permissions: CONTACT_PERMISSIONS, feature_flag: 'crm')
      }

      def edit
        render inertia: 'Contacts/ManageView/Index'
      end

      def edit_segment
        render inertia: 'Contacts/ManageView/Index'
      end

      def edit_label
        render inertia: 'Contacts/ManageView/Index'
      end
    end
  end
end
