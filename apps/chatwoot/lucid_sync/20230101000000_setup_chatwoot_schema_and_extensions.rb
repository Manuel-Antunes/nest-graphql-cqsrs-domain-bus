class SetupChatwootSchemaAndExtensions < ActiveRecord::Migration[6.1]
  def up
    # Garante a criação do schema chatwoot
    execute "CREATE SCHEMA IF NOT EXISTS chatwoot;"
    
    # Habilita extensões fundamentais
    # Nota: Executado como superuser (lucid já tem essa permissão conforme configuramos)
    enable_extension "pg_stat_statements"
    enable_extension "pg_trgm"
    enable_extension "pgcrypto"
    enable_extension "plpgsql"
    enable_extension "vector"
  end

  def down
    # Normalmente não removemos extensões ou schemas em down para evitar perda de dados de outros apps
  end
end
