# Links a Chatwoot contact to a `Client` in the `main` subgraph.
#
# `client_id` is a main-subgraph uuid, not a local FK: the two live in different
# schemas and are joined over federation, not in SQL. It replaced `person_id`,
# which pointed at a `Person @interfaceObject` — that could not compose, because
# exequentes and herdeiros lived in separate id spaces and the concrete type was
# not resolvable from the stored id. They are now one flat `client` row in one id
# space, so the link needs an id and nothing else; the kind of client is just
# `Client.kind`.
class ContactLink < ApplicationRecord
  belongs_to :contact

  validates :contact_id, uniqueness: true
  validates :client_id, presence: true
end
