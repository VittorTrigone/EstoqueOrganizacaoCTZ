const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testListOrders() {
    const { data: config } = await supabase.from('auth_config').select('*').eq('id', 1).single();
    const hoje = new Date();
    const formatData = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const url = `https://erp.tiny.com.br/public-api/v3/pedidos?dataInicial=${formatData(hoje)}&dataFinal=${formatData(hoje)}&limit=1&offset=0`;
    
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
    const json = await res.json();
    console.log(JSON.stringify(json.itens[0], null, 2));
}
testListOrders();
