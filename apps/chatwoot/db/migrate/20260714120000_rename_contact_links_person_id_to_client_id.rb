# frozen_string_literal: true

# `contact_links.person_id` -> `client_id`.
#
# The `main` subgraph collapsed its `JudgmentCreditor` / `Heir` hierarchy into a
# single flat `Client` entity, so what a contact links to is a client id. The old
# name pointed at a `Person @interfaceObject` that could not be composed into the
# supergraph.
class RenameContactLinksPersonIdToClientId < ActiveRecord::Migration[7.1]
  def change
    rename_column :contact_links, :person_id, :client_id
  end
end
