database = ActiveRecord::Base.configurations.configs_for(env_name: Rails.env).first
HairTrigger.pg_schema = database&.configuration_hash&.fetch(:schema_search_path, nil) || 'chatwoot'
