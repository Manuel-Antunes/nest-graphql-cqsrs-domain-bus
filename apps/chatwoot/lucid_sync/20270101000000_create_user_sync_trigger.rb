class CreateUserSyncTrigger < ActiveRecord::Migration[7.0]
  def up
    execute <<-SQL
      -- 1. Função de Sincronização
      CREATE OR REPLACE FUNCTION public.sync_user_to_chatwoot()
      RETURNS TRIGGER AS $$
      DECLARE
        v_account_id INT;
        v_user_id INT;
      BEGIN
        -- Tenta pegar a primeira conta do Chatwoot
        SELECT id INTO v_account_id FROM chatwoot.accounts LIMIT 1;

        -- Se não houver conta ainda (banco virgem), não faz nada agora
        IF v_account_id IS NULL THEN
          RETURN NEW;
        END IF;

        -- Insere o usuário no Chatwoot se não existir
        -- Senha padrão: Password1! ($2a$12$RzW7w.Q/6m9iXv6Z6k7q9eX9eX9eX9eX9eX9eX9eX9eX9eX9eX9e)
        INSERT INTO chatwoot.users (name, email, encrypted_password, provider, uid, confirmed_at, type, created_at, updated_at)
        VALUES (
          NEW.name, 
          NEW.email, 
          '$2a$12$RzW7w.Q/6m9iXv6Z6k7q9eX9eX9eX9eX9eX9eX9eX9eX9eX9eX9e',
          'email', 
          NEW.email, 
          NOW(), 
          'User', 
          NOW(), 
          NOW()
        )
        ON CONFLICT (uid, provider) DO NOTHING
        RETURNING id INTO v_user_id;

        -- Se o usuário já existia, recupera o ID
        IF v_user_id IS NULL THEN
          SELECT id INTO v_user_id FROM chatwoot.users WHERE email = NEW.email;
        END IF;

        -- Vincula o usuário à conta como administrador (role 1)
        INSERT INTO chatwoot.account_users (account_id, user_id, role, created_at, updated_at)
        VALUES (v_account_id, v_user_id, 1, NOW(), NOW())
        ON CONFLICT (account_id, user_id) DO NOTHING;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- 2. Criação da Trigger
      DROP TRIGGER IF EXISTS trig_sync_user_to_chatwoot ON public.user;
      CREATE TRIGGER trig_sync_user_to_chatwoot
      AFTER INSERT ON public.user
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_user_to_chatwoot();
    SQL
  end

  def down
    execute <<-SQL
      DROP TRIGGER IF EXISTS trig_sync_user_to_chatwoot ON public.user;
      DROP FUNCTION IF EXISTS public.sync_user_to_chatwoot();
    SQL
  end
end
