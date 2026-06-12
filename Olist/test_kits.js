const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function searchKits() {
    const { data: config } = await supabase.from('auth_config').select('*').eq('id', 1).single();
    
    // Busca produtos do tipo Kit (no Tiny, tipo='K' ou pesquisar por kit)
    // O endpoint GET /produtos não tem filtro por tipo K, então vamos buscar a lista geral e pegar alguns
    const res = await fetch(`https://erp.tiny.com.br/public-api/v3/produtos?limit=50&pesquisa=kit`, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
    const json = await res.json();
    
    if (json.itens && json.itens.length > 0) {
        // pega o primeiro
        const pid = json.itens[0].id;
        const resDet = await fetch(`https://erp.tiny.com.br/public-api/v3/produtos/${pid}`, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
        const det = await resDet.json();
        console.log("Kit encontrado:", det.sku, det.tipo);
        console.log("Kit array:", JSON.stringify(det.kit, null, 2));
    } else {
        console.log("Nenhum kit encontrado.");
    }
}

searchKits();
