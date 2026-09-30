# frozen_string_literal: true

module Resolvers
  # Emits a federated reference to the linked client.
  #
  # `Client` is a plain federated entity owned by the `main` subgraph — one flat
  # type, one id space — so we hand back the bare id and let the gateway resolve
  # the rest of the entity. This replaced a `Person @interfaceObject`, which could
  # not compose: with exequentes and herdeiros in separate id spaces the concrete
  # implementation type was not resolvable from the stored id.
  class ContactClient
    def resolve(obj, _args, _ctx)
      contact_link = obj.contact_links.order(id: :desc).first
      return nil if contact_link&.client_id.blank?

      {
        '__typename' => 'Client',
        'id' => contact_link.client_id
      }
    end
  end
end
