# frozen_string_literal: true

# Gives working hours a TEAM dimension alongside the existing INBOX one, so the
# platform calendar can read/edit team-scoped business hours (federated onto the
# `Team` type). Existing inbox working hours are untouched: `inbox_id` stays and
# `team_id` is null for them; team rows have `team_id` set and `inbox_id` null
# (the model enforces inbox XOR team). Deleting a team removes its working hours.
class AddTeamToWorkingHours < ActiveRecord::Migration[7.1]
  def change
    add_reference :working_hours, :team, null: true, index: true,
                                         foreign_key: { on_delete: :cascade }
  end
end
