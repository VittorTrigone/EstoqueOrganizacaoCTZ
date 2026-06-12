const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSync() {
    const { data: config } = await supabase.from('auth_config').select('*').eq('id', 1).single();
    
    const hoje = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(hoje.getDate() - 30);
    const formatData = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const url = `https://erp.tiny.com.br/public-api/v3/pedidos?dataInicial=${formatData(trintaDiasAtras)}&dataFinal=${formatData(hoje)}&limit=100&offset=0`;
    console.log("URL:", url);
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
    
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body snippet:", text.substring(0, 500));
}

testSync();
