module Inertia
  module Search
    # Inertia-served global search. Enforces the same gates the vue-router meta carried
    # for the `search` route (see routes/registry.js) — the union of role + conversation
    # + contact + knowledge-base permissions, no feature flag. NO data props — the page
    # keeps fetching via the conversationSearch Vuex module (REST), unchanged.
    class IndexController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['agent', 'administrator', 'conversation_manage', 'conversation_unassigned_manage',
                                      'conversation_participating_manage', 'contact_manage', 'knowledge_base_manage'])
      }

      def index
        render inertia: 'Search/Index'
      end
    end
  end
end
