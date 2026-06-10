-- =========================================
-- SCRIPT DE BANCO DE DADOS PARA O SUPABASE
-- =========================================
-- Copie todo o texto abaixo e cole no SQL Editor do seu painel do Supabase.
-- Em seguida, clique no botão "Run" (Executar) para criar as tabelas.

-- 1. Cria a tabela para as configurações do OAuth
CREATE TABLE public.auth_config (
  id integer PRIMARY KEY DEFAULT 1,
  client_id text,
  client_secret text,
  redirect_uri text,
  access_token text,
  refresh_token text
);

-- 2. Cria a tabela para salvar o Galpão inteiro (Estantes, produtos, coordenadas)
CREATE TABLE public.armazem (
  id integer PRIMARY KEY DEFAULT 1,
  racks jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 3. Habilita Políticas de Segurança (Row Level Security)
ALTER TABLE public.auth_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.armazem ENABLE ROW LEVEL SECURITY;

-- 4. Cria as regras que permitem nosso app LER e SALVAR dados
-- (Como é um app interno, deixamos aberto para a chave anônima que está no código)
CREATE POLICY "Permitir Leitura Anon_auth" ON public.auth_config FOR SELECT USING (true);
CREATE POLICY "Permitir Update Anon_auth" ON public.auth_config FOR UPDATE USING (true);
CREATE POLICY "Permitir Insert Anon_auth" ON public.auth_config FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir Leitura Anon_armazem" ON public.armazem FOR SELECT USING (true);
CREATE POLICY "Permitir Update Anon_armazem" ON public.armazem FOR UPDATE USING (true);
CREATE POLICY "Permitir Insert Anon_armazem" ON public.armazem FOR INSERT WITH CHECK (true);

-- 5. Insere uma linha em branco para não dar erro na primeira leitura
INSERT INTO public.auth_config (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO public.armazem (id) VALUES (1) ON CONFLICT DO NOTHING;
