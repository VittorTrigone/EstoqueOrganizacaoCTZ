const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testOrderFull() {
    const { data: config } = await supabase.from('auth_config').select('*').eq('id', 1).single();
    const pid = 944923694;
    const resDet = await fetch(`https://erp.tiny.com.br/public-api/v3/pedidos/${pid}`, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
    const det = await resDet.json();
    console.log(JSON.stringify(det, null, 2));
}

testOrderFull();
