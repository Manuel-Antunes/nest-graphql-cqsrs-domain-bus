# frozen_string_literal: true

# Input for a single weekday in `setTeamWorkingHours`. Mirrors the
# `working_hours` columns (0 = Sunday … 6 = Saturday).
class WorkingHourInput < BaseInputObject
  graphql_name 'WorkingHourInput'

  argument :day_of_week, Integer, required: true, description: '0 = Sunday … 6 = Saturday.'
  argument :open_hour, Integer, required: false
  argument :open_minutes, Integer, required: false
  argument :close_hour, Integer, required: false
  argument :close_minutes, Integer, required: false
  argument :closed_all_day, Boolean, required: false
  argument :open_all_day, Boolean, required: false
end
