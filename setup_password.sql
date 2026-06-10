-- 1. Ativar a extensão de criptografia (vem nativa no Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Criar a tabela segura que guardará a senha (sem permissão de leitura anônima)
CREATE TABLE public.app_security (
  id integer PRIMARY KEY DEFAULT 1,
  hashed_password text NOT NULL
);

-- Habilitar RLS e garantir que ninguém de fora leia essa tabela usando a chave pública
ALTER TABLE public.app_security ENABLE ROW LEVEL SECURITY;

-- 3. Inserir a senha '2579' criptografada irreversivelmente (Salt Blowfish)
INSERT INTO public.app_security (id, hashed_password) 
VALUES (1, crypt('2579', gen_salt('bf')));

-- 4. Criar a função (RPC) que o frontend chamará
-- Esta função compara a senha que o usuário digitou com o hash salvo.
CREATE OR REPLACE FUNCTION verify_password(input_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Permite rodar ignorando o RLS da tabela temporariamente
AS $$
DECLARE
  stored_hash text;
BEGIN
  -- Busca o hash da tabela
  SELECT hashed_password INTO stored_hash FROM public.app_security WHERE id = 1;
  
  -- Se a tabela estiver vazia, falha
  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;

  -- Verifica se o input criptografado bate com o armazenado
  IF stored_hash = crypt(input_password, stored_hash) THEN
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;

-- 5. Dar permissão para o usuário anônimo (o app no navegador) rodar APENAS a função de verificação
GRANT EXECUTE ON FUNCTION verify_password(text) TO anon;
