-- Remove as políticas da tabela zonas_demarcadas
DROP POLICY IF EXISTS "Permitir Leitura Anon_zonas" ON public.zonas_demarcadas;
DROP POLICY IF EXISTS "Permitir Update Anon_zonas" ON public.zonas_demarcadas;
DROP POLICY IF EXISTS "Permitir Insert Anon_zonas" ON public.zonas_demarcadas;
DROP POLICY IF EXISTS "Permitir Delete Anon_zonas" ON public.zonas_demarcadas;

-- Remove a tabela zonas_demarcadas
DROP TABLE IF EXISTS public.zonas_demarcadas;
