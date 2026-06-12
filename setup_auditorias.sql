-- Criação da tabela para armazenar os logs de auditoria
CREATE TABLE IF NOT EXISTS public.contagens_inventario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rack_id TEXT NOT NULL,
    rack_nome TEXT NOT NULL,
    funcionario TEXT NOT NULL,
    assinatura TEXT NOT NULL, -- Base64 PNG
    itens_contados JSONB NOT NULL,
    produtos_adicionados JSONB DEFAULT '[]'::jsonb,
    observacao TEXT,
    data_contagem TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Permissões básicas
ALTER TABLE public.contagens_inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir Leitura Anon_contagens" ON public.contagens_inventario;
CREATE POLICY "Permitir Leitura Anon_contagens" ON public.contagens_inventario
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir Insert Anon_contagens" ON public.contagens_inventario;
CREATE POLICY "Permitir Insert Anon_contagens" ON public.contagens_inventario
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir Update Anon_contagens" ON public.contagens_inventario;
CREATE POLICY "Permitir Update Anon_contagens" ON public.contagens_inventario
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Permitir Delete Anon_contagens" ON public.contagens_inventario;
CREATE POLICY "Permitir Delete Anon_contagens" ON public.contagens_inventario
    FOR DELETE USING (true);
