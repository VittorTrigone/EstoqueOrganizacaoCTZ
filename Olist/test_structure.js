const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function searchStructure() {
    const { data: config } = await supabase.from('auth_config').select('*').eq('id', 1).single();
    
    // Busca 100 produtos
    const res = await fetch(`https://erp.tiny.com.br/public-api/v3/produtos?limit=100`, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
    const json = await res.json();
    
    let achouK = null;
    let achouV = null;

    if (json.itens) {
        for (const p of json.itens) {
            if (p.tipo === 'K' && !achouK) achouK = p.id;
            if (p.tipo === 'V' && !achouV) achouV = p.id;
        }
    }
    
    if (achouK) {
        const resDet = await fetch(`https://erp.tiny.com.br/public-api/v3/produtos/${achouK}`, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
        console.log("KIT:", await resDet.text());
    }
    if (achouV) {
        const resDet = await fetch(`https://erp.tiny.com.br/public-api/v3/produtos/${achouV}`, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
        console.log("VARIAÇÃO:", await resDet.text());
    }
}

searchStructure();
