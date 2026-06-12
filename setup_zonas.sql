-- Criação da tabela de Zonas Demarcadas
CREATE TABLE IF NOT EXISTS public.zonas_demarcadas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome TEXT NOT NULL,
    cor TEXT NOT NULL,
    pos_x FLOAT NOT NULL,
    pos_y FLOAT NOT NULL,
    width FLOAT NOT NULL,
    height FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ativar RLS
ALTER TABLE public.zonas_demarcadas ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança (Permitir acesso total temporário)
DROP POLICY IF EXISTS "Permitir Leitura Anon_zonas" ON public.zonas_demarcadas;
CREATE POLICY "Permitir Leitura Anon_zonas" ON public.zonas_demarcadas FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Permitir Update Anon_zonas" ON public.zonas_demarcadas;
CREATE POLICY "Permitir Update Anon_zonas" ON public.zonas_demarcadas FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS "Permitir Insert Anon_zonas" ON public.zonas_demarcadas;
CREATE POLICY "Permitir Insert Anon_zonas" ON public.zonas_demarcadas FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir Delete Anon_zonas" ON public.zonas_demarcadas;
CREATE POLICY "Permitir Delete Anon_zonas" ON public.zonas_demarcadas FOR DELETE TO anon USING (true);
