# frozen_string_literal: true

module Mutations
  # Replace a team's business hours (the platform calendar's team-scoped working
  # hours). Idempotent: the given `days` fully replace the team's existing rows.
  #
  # Accepts either the native Chatwoot team id or the federated platform team id
  # (see SupportBase#find_team!), so the platform admin UI can pass the id it has.
  class SetTeamWorkingHours < SupportBase
    description "Replace a team's business hours (platform calendar)."

    argument :team_id, ID, required: true,
                           description: 'Team id — native Chatwoot id or the federated platformTeamId.'
    argument :days, [WorkingHourInput], required: true,
                    description: 'Full set of weekday working hours; replaces the existing ones.'

    field :team, late('SupportTeam'), null: false

    def resolve(team_id:, days:)
      team = find_team!(team_id)
      authorize!(team, :update?)

      ActiveRecord::Base.transaction do
        team.working_hours.destroy_all
        days.each do |day|
          team.working_hours.create!(
            day_of_week: day.day_of_week,
            open_hour: day.open_hour,
            open_minutes: day.open_minutes,
            close_hour: day.close_hour,
            close_minutes: day.close_minutes,
            closed_all_day: day.closed_all_day.nil? ? false : day.closed_all_day,
            open_all_day: day.open_all_day.nil? ? false : day.open_all_day
          )
        end
      end

      { team: team.reload }
    end
  end
end
