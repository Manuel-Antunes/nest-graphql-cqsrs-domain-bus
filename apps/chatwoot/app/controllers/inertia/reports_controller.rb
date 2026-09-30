module Inertia
  # Reports route group (17 routes). The vue-router ReportsWrapper (a <router-view>
  # shell) is dropped under Inertia; each report renders as its own full-bleed page
  # under AppShell + the Inertia ReportsWrapper layout (which carries the wrapper's
  # multiselect/datepicker deep styles).
  #
  # NO data props — every page keeps fetching via the existing REST/Vuex path. The
  # controller only authorizes + renders the shell.
  #
  # Gate parity with registry.js: the "old" reports (account_overview_reports,
  # conversation_reports, agent_reports, inbox_reports, label_reports, team_reports,
  # sla_reports, csat_reports, bot_reports) carry featureFlag 'reports'; the revised
  # "*_index"/"*_show" reports carry NO feature flag. This difference is preserved
  # exactly via the two before_action filters below.
  class ReportsController < InertiaController
    REPORT_PERMISSIONS = %w[administrator report_manage].freeze

    # feature_flag 'reports' (matches meta.featureFlag = FEATURE_FLAGS.REPORTS)
    FLAGGED_ACTIONS = %i[
      account_overview conversation agent inbox label team sla csat bot
    ].freeze

    # no feature flag (revised report routes gate on permissions only)
    UNFLAGGED_ACTIONS = %i[
      agent_overview agent_show inbox_overview inbox_show
      team_overview team_show label_overview label_show
    ].freeze

    before_action lambda {
      authorize_page!(permissions: REPORT_PERMISSIONS, feature_flag: 'reports')
    }, only: FLAGGED_ACTIONS

    before_action lambda {
      authorize_page!(permissions: REPORT_PERMISSIONS)
    }, only: UNFLAGGED_ACTIONS

    # --- Flagged reports (permissions + feature_flag 'reports') ---------------

    def account_overview
      render inertia: 'Reports/Overview'
    end

    def conversation
      render inertia: 'Reports/Conversation'
    end

    def agent
      render inertia: 'Reports/Agent'
    end

    def inbox
      render inertia: 'Reports/Inbox'
    end

    def label
      render inertia: 'Reports/Label'
    end

    def team
      render inertia: 'Reports/Team'
    end

    def sla
      render inertia: 'Reports/Sla'
    end

    def csat
      render inertia: 'Reports/Csat'
    end

    def bot
      render inertia: 'Reports/Bot'
    end

    # --- Revised reports (permissions only, NO feature flag) ------------------

    def agent_overview
      render inertia: 'Reports/AgentOverview'
    end

    def agent_show
      render inertia: 'Reports/AgentShow'
    end

    def inbox_overview
      render inertia: 'Reports/InboxOverview'
    end

    def inbox_show
      render inertia: 'Reports/InboxShow'
    end

    def team_overview
      render inertia: 'Reports/TeamOverview'
    end

    def team_show
      render inertia: 'Reports/TeamShow'
    end

    def label_overview
      render inertia: 'Reports/LabelOverview'
    end

    def label_show
      render inertia: 'Reports/LabelShow'
    end
  end
end
