-- Remove as políticas da tabela curva_abc
DROP POLICY IF EXISTS "Permitir Leitura Anon_curva_abc" ON public.curva_abc;
DROP POLICY IF EXISTS "Permitir Update Anon_curva_abc" ON public.curva_abc;
DROP POLICY IF EXISTS "Permitir Insert Anon_curva_abc" ON public.curva_abc;

-- Remove a tabela curva_abc
DROP TABLE IF EXISTS public.curva_abc;
