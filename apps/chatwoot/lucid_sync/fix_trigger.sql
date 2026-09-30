CREATE OR REPLACE FUNCTION public.sync_user_to_chatwoot()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id INT;
  v_user_id INT;
BEGIN
  -- 1. Pega a primeira conta do Chatwoot no schema chatwoot
  SELECT id INTO v_account_id FROM chatwoot.accounts LIMIT 1;
  IF v_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Insere o usuário no Chatwoot (schema chatwoot)
  -- NOTA: O índice único no Chatwoot é (uid, provider). 
  -- Aqui usamos email como uid e 'email' como provider.
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

  -- 3. Se o usuário já existia (conflito), recuperamos o id dele
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM chatwoot.users WHERE email = NEW.email;
  END IF;

  -- 4. Associa o usuário à conta
  INSERT INTO chatwoot.account_users (account_id, user_id, role, created_at, updated_at)
  VALUES (v_account_id, v_user_id, 1, NOW(), NOW())
  ON CONFLICT (account_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Garante que a trigger esteja associada à função correta
DROP TRIGGER IF EXISTS trig_sync_user_to_chatwoot ON public.user;
CREATE TRIGGER trig_sync_user_to_chatwoot
AFTER INSERT ON public.user
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_to_chatwoot();
