module Inertia
  module Settings
    class AuditLogsController < InertiaController
      before_action lambda {
        authorize_page!(permissions: ['administrator'], feature_flag: 'audit_logs', installation_types: ['cloud', 'enterprise'])
      }

      def index
        render inertia: 'Settings/AuditLogs/Index'
      end
    end
  end
end
