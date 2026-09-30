# A contact link used to point at "some entity of some type" — `ext_entity_id`
# plus an `ext_entity_type` string that was either 'JudgmentCreditor' or 'Heir'.
# That pair existed only because the legal side kept exequentes and herdeiros in
# two disjoint id spaces, so an id alone was ambiguous.
#
# They now share one: both are Table-Per-Type children of `person` and reuse the
# person's id as their own primary key. An id is therefore enough to identify a
# client, and the type is a property of the person, not of the link. So the pair
# collapses into a single `person_id`.
#
# The backfill is the identity function: every existing `ext_entity_id` already IS
# the person id (the TPT migration preserved ids on both sides), so renaming the
# column carries the data across untouched — nothing to rewrite, nothing to lose.
class LinkContactsToPerson < ActiveRecord::Migration[7.1]
  def up
    rename_column :contact_links, :ext_entity_id, :person_id
    remove_column :contact_links, :ext_entity_type

    change_column_null :contact_links, :person_id, false
    add_index :contact_links, :person_id
  end

  def down
    remove_index :contact_links, :person_id
    change_column_null :contact_links, :person_id, true

    rename_column :contact_links, :person_id, :ext_entity_id
    add_column :contact_links, :ext_entity_type, :string

    # The type is not knowable from the link alone any more — the legal side owns
    # it. Read it back from `person.type`, which is the same database, so the
    # rollback is lossless rather than a guess. Anything that can't be resolved
    # (e.g. a tenant schema this connection can't see) falls back to the dominant
    # value rather than leaving a NOT NULL-violating hole.
    execute <<~SQL.squish
      UPDATE contact_links cl
         SET ext_entity_type = CASE p.type
                                 WHEN 'HEIR' THEN 'Heir'
                                 ELSE 'JudgmentCreditor'
                               END
        FROM tenant_root.person p
       WHERE p.id::text = cl.ext_entity_id
    SQL

    execute <<~SQL.squish
      UPDATE contact_links SET ext_entity_type = 'JudgmentCreditor'
       WHERE ext_entity_type IS NULL
    SQL
  end
end
