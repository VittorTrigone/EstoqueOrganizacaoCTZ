const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkKit() {
    const { data: config } = await supabase.from('auth_config').select('*').eq('id', 1).single();
    
    const achouK = 883612751;
    
    const resEst = await fetch(`https://erp.tiny.com.br/public-api/v3/produtos/${achouK}/estrutura`, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
    if(resEst.status === 200) {
        console.log("Estrutura:", await resEst.text());
    } else {
        console.log("Endpoint estrutura não existe ou falhou:", resEst.status);
    }
}

checkKit();
