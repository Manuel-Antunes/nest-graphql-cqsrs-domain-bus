module Inertia
  module Settings
    # First migrated page (docs Phase 1). The controller only enforces the same
    # gates the vue-router meta carried (permissions: ['administrator'],
    # featureFlag: 'labels') and renders the page shell. NO data props — the page
    # keeps fetching via store.dispatch('labels/get') (REST), unchanged.
    class LabelsController < InertiaController
      before_action -> { authorize_page!(permissions: ['administrator'], feature_flag: 'labels') }

      def index
        render inertia: 'Settings/Labels/Index'
      end
    end
  end
end
