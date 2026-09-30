# frozen_string_literal: true

module BetterAuth
  # The platform's own tables, read where Better Auth keeps them: `public.session`, `public.users`
  # (soft deleted through `deleted_at`, banned through `banned`) and `public.organization`, whose
  # slug is the `x-tenant` a request names. Chatwoot's search path is `chatwoot` alone, so every
  # name here is qualified.
  module Platform
    ROOT_TENANT = 'root'

    module_function

    def session(token)
      select_one(<<~SQL.squish, token: token)
        SELECT u.id AS platform_user_id, s.active_organization_id AS organization_id
          FROM public.session s
          JOIN public.users u ON u.id = s.user_id
         WHERE s.token = :token
           AND s.expires_at > NOW()
           AND u.deleted_at IS NULL
           AND u.banned IS NOT TRUE
      SQL
    end

    def user(id)
      select_one(<<~SQL.squish, id: id)
        SELECT u.id AS platform_user_id
          FROM public.users u
         WHERE u.id = :id
           AND u.deleted_at IS NULL
           AND u.banned IS NOT TRUE
      SQL
    end

    def sign_in_url
      ENV['PLATFORM_SIGN_IN_URL'].presence || "#{ENV.fetch('WEB_URL', 'http://localhost:4200')}/auth/sign-in"
    end

    def organization_id_of_tenant(tenant)
      return nil if tenant.blank? || tenant == ROOT_TENANT

      select_one('SELECT id FROM public.organization WHERE slug = :slug', slug: tenant)&.fetch('id')
    end

    def select_one(sql, binds)
      ActiveRecord::Base.connection.select_one(ActiveRecord::Base.sanitize_sql_array([sql, binds]))
    end
  end
end
