const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findKit() {
    const { data: config } = await supabase.from('auth_config').select('*').eq('id', 1).single();
    
    // Busca até 500 produtos e checa
    let offset = 0;
    while (offset < 500) {
        const res = await fetch(`https://erp.tiny.com.br/public-api/v3/produtos?limit=100&offset=${offset}`, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
        const json = await res.json();
        if (!json.itens || json.itens.length === 0) break;
        
        for (const p of json.itens) {
            if (p.tipo === 'K') {
                const resDet = await fetch(`https://erp.tiny.com.br/public-api/v3/produtos/${p.id}`, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
                const det = await resDet.json();
                if (det.kit && det.kit.length > 0) {
                    console.log("KIT POPULADO:", det.sku, JSON.stringify(det.kit));
                    return;
                }
            }
        }
        offset += 100;
    }
    console.log("Nenhum kit populado encontrado nos primeiros 500 produtos.");
}

findKit();
