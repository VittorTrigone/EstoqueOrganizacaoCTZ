const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function lerConfig() {
    const { data } = await supabase.from('auth_config').select('*').eq('id', 1).single();
    return data;
}

async function testPedidos() {
    let config = await lerConfig();
    let token = config.access_token;
    
    // get some orders
    let res = await fetch(`https://erp.tiny.com.br/public-api/v3/pedidos?limit=5`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.status === 401) {
        console.log("Token expirado. Tentando renovar manualmente.");
        const params = new URLSearchParams({
            'grant_type': 'refresh_token',
            'client_id': config.client_id,
            'client_secret': config.client_secret,
            'refresh_token': config.refresh_token
        });
        const r2 = await fetch('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        const d2 = await r2.json();
        token = d2.access_token;
        res = await fetch(`https://erp.tiny.com.br/public-api/v3/pedidos?limit=5`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }
    
    const text = await res.text();
    console.log("Listing text:", text);
    
    try {
        const json = JSON.parse(text);
        if (json.itens && json.itens.length > 0) {
            const id = json.itens[0].id;
            const res2 = await fetch(`https://erp.tiny.com.br/public-api/v3/pedidos/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log("Details:", await res2.text());
        }
    } catch(e) {
        console.error("JSON parse error:", e);
    }
}
testPedidos();
