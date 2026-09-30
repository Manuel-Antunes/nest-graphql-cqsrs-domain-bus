class CreateChannelEvolutionApi < ActiveRecord::Migration[7.1]
  def change
    create_table :channel_evolution_api do |t|
      t.integer :account_id, null: false
      t.string :webhook_url
      t.string :evolution_url
      t.text :evolution_apikey
      t.string :instance_name
      t.string :phone_number
      t.string :identifier
      t.string :hmac_token
      t.boolean :hmac_mandatory, default: false
      t.jsonb :additional_attributes, default: {}

      t.timestamps
    end

    add_index :channel_evolution_api, :account_id
    add_index :channel_evolution_api, :hmac_token, unique: true
    add_index :channel_evolution_api, :identifier, unique: true
    add_index :channel_evolution_api, [:account_id, :instance_name],
              unique: true, name: 'index_channel_evolution_api_on_account_id_and_instance_name'
  end
end
