# frozen_string_literal: true

module Mutations
  # Base for the customer-support mutations. Provides account-scoping and Pundit
  # authorization helpers so every write enforces the same multi-tenancy and
  # permission rules as the REST API. Errors are raised as GraphQL::ExecutionError
  # (surfaced in the response `errors`), matching the project's mutation convention.
  class SupportBase < BaseMutation
    private

    def current_account!
      GraphqlAuthorization.current_account!(context)
    end

    def current_user
      context[:current_user]
    end

    def authorize!(record, query)
      GraphqlAuthorization.authorize!(context, record, query)
    end

    def find_contact!(id)
      contact = current_account!.contacts.find_by(id: id)
      raise ::GraphQL::ExecutionError, 'Contact not found.' unless contact

      contact
    end

    # Conversations are addressed by their account-scoped display id, like the
    # REST API and UI.
    def find_conversation!(display_id)
      conversation = current_account!.conversations.find_by(display_id: display_id)
      raise ::GraphQL::ExecutionError, 'Conversation not found.' unless conversation

      conversation
    end

    def find_inbox!(id)
      inbox = current_account!.inboxes.find_by(id: id)
      raise ::GraphQL::ExecutionError, 'Inbox not found.' unless inbox

      inbox
    end

    # Teams are addressable by two identifiers: the native Chatwoot id and the
    # federated platform team id (`public.team.id`, mirrored here as
    # `chatwoot.teams.platform_team_id`). The REST/UI path uses the native id,
    # while the AI handoff reads teams from the supergraph where the primary
    # `id` is the platform id. Accept either so the assignment resolves no
    # matter which one the caller holds.
    #
    # `platform_team_id` is provisioned by the external migrator, not Chatwoot's
    # own schema, so the column is absent in CI/test — guard the fallback on it.
    def find_team!(id)
      teams = current_account!.teams
      team = teams.find_by(id: id) if id.to_s.match?(/\A\d+\z/)
      team ||= teams.find_by(platform_team_id: id) if Team.column_names.include?('platform_team_id')
      team ||= find_team_by_name(teams, id)
      raise ::GraphQL::ExecutionError, 'Team not found.' unless team

      team
    end

    # AI callers frequently pass the team NAME — what they reason about and
    # confirm with the user ("Time Priscila", "Priscila") — instead of an opaque
    # id they never looked up. Resolve case-insensitively: an exact match first,
    # then a UNIQUE substring match (so "Priscila" → "time priscila"). Ambiguous
    # (>1) or no match → nil, so a multi-team account is never mis-routed by a
    # vague name. Names are unique per account, so the exact match is safe.
    def find_team_by_name(teams, value)
      name = value.to_s.strip
      return nil if name.empty?

      exact = teams.where('LOWER(name) = ?', name.downcase)
      return exact.first if exact.count == 1

      escaped = name.gsub(/[\\%_]/) { |c| "\\#{c}" }
      fuzzy = teams.where('name ILIKE ?', "%#{escaped}%")
      fuzzy.count == 1 ? fuzzy.first : nil
    end

    # The `JSON` arguments (custom/additional attributes) are meant to arrive as
    # objects, but AI callers intermittently send a JSON-ENCODED STRING (or an
    # array) instead. Passing that straight to `Hash#merge` raises
    # `TypeError: no implicit conversion of String into Hash` — an unhandled 500.
    # Coerce a parseable object-string into a Hash and reject anything that isn't
    # an object with a clean error the caller can act on. Returns nil for nil so
    # callers can skip absent fields.
    def coerce_json_object!(value, field)
      return nil if value.nil?

      value = JSON.parse(value) if value.is_a?(String)
      return value if value.is_a?(Hash)

      raise ::GraphQL::ExecutionError, "#{field} must be a JSON object."
    rescue JSON::ParserError
      raise ::GraphQL::ExecutionError, "#{field} must be a JSON object."
    end
  end
end
