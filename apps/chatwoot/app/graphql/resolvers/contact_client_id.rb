# frozen_string_literal: true

module Resolvers
  class ContactClientId
    def resolve(obj, _args, _ctx)
      obj.contact_links.order(id: :desc).first&.client_id
    end
  end
end
