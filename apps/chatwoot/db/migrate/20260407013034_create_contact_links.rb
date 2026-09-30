class CreateContactLinks < ActiveRecord::Migration[7.1]
  def change
    create_table :contact_links do |t|
      t.references :contact, null: false, foreign_key: true
      t.string :ext_entity_id
      t.string :ext_entity_type

      t.timestamps
    end
  end
end
