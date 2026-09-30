# The platform's triggers (libs/users, libs/organizations) upsert on these, so each is unique.
class AddPlatformLinks < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :platform_user_id, :string
    add_index :users, :platform_user_id, unique: true

    add_column :accounts, :platform_organization_id, :string
    add_index :accounts, :platform_organization_id, unique: true

    add_column :teams, :platform_team_id, :string
    add_index :teams, :platform_team_id, unique: true
  end
end
