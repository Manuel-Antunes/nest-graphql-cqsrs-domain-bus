class AddUniqueIndexToContactLinksContactId < ActiveRecord::Migration[7.1]
  def change    # Remove any existing simple index if it exists
    remove_index :contact_links, :contact_id, if_exists: true

    # Add a unique index on contact_id
    add_index :contact_links, :contact_id, unique: true  end
end
