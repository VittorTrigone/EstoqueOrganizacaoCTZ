const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data } = await supabase.from('auth_config').select('*').eq('id', 1).single();
    if (!data || !data.access_token) return console.log("No token");
    
    let allItems = [];
    let offset = 0;
    const limit = 100;
    while(true) {
        const url = `https://erp.tiny.com.br/public-api/v3/produtos?limit=${limit}&offset=${offset}`;
        let resposta = await fetch(url, { headers: { 'Authorization': `Bearer ${data.access_token}` } });
        const result = await resposta.json();
        const itens = result.itens || [];
        if (itens.length === 0) break;
        allItems = allItems.concat(itens);
        offset += limit;
    }
    const flicks = allItems.filter(i => i.sku.toLowerCase().includes('flick'));
    console.log(JSON.stringify(flicks, null, 2));
}
run();
