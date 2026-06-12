const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchComRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        const res = await fetch(url, options);
        if (res.status === 429) {
            console.log("Rate limit (429) atingido. Aguardando 2s...");
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }
        return res;
    }
    throw new Error("Falha após várias tentativas: " + url);
}

async function testFullSync() {
    console.log("🚀 Iniciando Sincronização LOCAL...");
    
    const { data: config } = await supabase.from('auth_config').select('*').eq('id', 1).single();

    const hoje = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(hoje.getDate() - 30);
    const formatData = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    let offset = 0;
    const limit = 100;
    let temMaisPaginas = true;
    let todosPedidosIds = [];

    while(temMaisPaginas) {
        const url = `https://erp.tiny.com.br/public-api/v3/pedidos?dataInicial=${formatData(trintaDiasAtras)}&dataFinal=${formatData(hoje)}&limit=${limit}&offset=${offset}`;
        const res = await fetchComRetry(url, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
        
        if (!res.ok) {
            console.error("Falha ao buscar pedidos ABC:", res.status, await res.text());
            break;
        }

        const json = await res.json();
        if (json.itens && json.itens.length > 0) {
            json.itens.forEach(p => {
                if ([1, 3, 4, 5, 6, 7].includes(p.situacao)) {
                    todosPedidosIds.push(p.id);
                }
            });
            offset += limit;
        } else {
            temMaisPaginas = false;
        }
    }

    console.log(`📦 ${todosPedidosIds.length} pedidos encontrados para processar.`);

    const contagemSKU = {};
    const produtosCache = {};

    async function getProdutoDetalhes(idProduto) {
        if (produtosCache[idProduto]) return produtosCache[idProduto];
        const url = `https://erp.tiny.com.br/public-api/v3/produtos/${idProduto}`;
        const res = await fetchComRetry(url, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
        if (res.ok) {
            const data = await res.json();
            produtosCache[idProduto] = data;
            await new Promise(r => setTimeout(r, 150)); 
            return data;
        }
        return null;
    }

    async function processarItem(idProduto, quantidadeMultiplicador) {
        const prod = await getProdutoDetalhes(idProduto);
        if (!prod) return;

        if (prod.tipo === 'K' && prod.kit && prod.kit.length > 0) {
            for (const comp of prod.kit) {
                if (comp.produto && comp.produto.id) {
                    await processarItem(comp.produto.id, quantidadeMultiplicador * comp.quantidade);
                }
            }
        } else {
            const sku = prod.sku;
            if (sku) {
                contagemSKU[sku] = (contagemSKU[sku] || 0) + quantidadeMultiplicador;
            }
        }
    }

    // Processar os 5 primeiros pedidos como teste rápido
    for (let i = 0; i < Math.min(5, todosPedidosIds.length); i++) {
        const pid = todosPedidosIds[i];
        try {
            const urlDet = `https://erp.tiny.com.br/public-api/v3/pedidos/${pid}`;
            const resDet = await fetchComRetry(urlDet, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
            const pedido = await resDet.json();

            const urlMarc = `https://erp.tiny.com.br/public-api/v3/pedidos/${pid}/marcadores`;
            const resMarc = await fetchComRetry(urlMarc, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
            let marcadores = [];
            if (resMarc.ok) marcadores = await resMarc.json();

            const isFull = marcadores.some(m => m.descricao && m.descricao.toUpperCase().includes('FULL'));
            if (isFull) continue;

            if (pedido.itens) {
                for (const itemInfo of pedido.itens) {
                    if (itemInfo.produto && itemInfo.produto.id) {
                        await processarItem(itemInfo.produto.id, itemInfo.quantidade);
                    }
                }
            }
        } catch(e) {
            console.error(`Erro ao processar pedido ${pid}:`, e.message);
        }
    }

    console.log("Teste rápido concluído. SKUs:", contagemSKU);
}

testFullSync();
