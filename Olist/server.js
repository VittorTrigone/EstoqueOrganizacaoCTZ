const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase
const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
app.use(cors());
app.use(express.json());

// Rota raiz apenas para mostrar que o servidor está vivo
app.get('/', (req, res) => {
    res.send('API Backend EstoquePRO Olist funcionando e escutando conexões!');
}); 

let catalogoEmMemoria = []; 

async function lerConfig() {
    const { data, error } = await supabase
        .from('auth_config')
        .select('*')
        .eq('id', 1)
        .single();
    
    if (error || !data) {
        return {
            client_id: "",
            client_secret: "",
            redirect_uri: "http://localhost:3000/callback",
            access_token: "",
            refresh_token: ""
        };
    }
    return data;
}

async function salvarConfig(config) {
    const { error } = await supabase
        .from('auth_config')
        .upsert({
            id: 1,
            client_id: config.client_id,
            client_secret: config.client_secret,
            redirect_uri: config.redirect_uri,
            access_token: config.access_token,
            refresh_token: config.refresh_token
        });
    if (error) console.error("Erro ao salvar config no Supabase:", error);
}

async function renovarToken() {
    const config = await lerConfig();
    console.log('🔄 Renovando token de acesso...');

    const url = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';
    const params = new URLSearchParams({
        'grant_type': 'refresh_token',
        'client_id': config.client_id,
        'client_secret': config.client_secret,
        'refresh_token': config.refresh_token
    });

    const resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });

    if (!resposta.ok) {
        throw new Error('Falha ao renovar o token. O refresh_token pode ter vencido.');
    }

    const dados = await resposta.json();
    config.access_token = dados.access_token;
    if (dados.refresh_token) config.refresh_token = dados.refresh_token; 
    
    await salvarConfig(config);
    return config.access_token;
}

async function sincronizarCatalogo() {
    console.log('\n📥 Iniciando download do catálogo...');
    let config = await lerConfig();
    
    if (!config.access_token || !config.refresh_token) {
        console.log('⚠️ Tokens de acesso ausentes. A sincronização do catálogo foi suspensa até que o OAuth seja feito.');
        return;
    }

    let offset = 0;
    const limit = 100;
    let todosOsProdutos = [];
    let temMaisPaginas = true;

    while(temMaisPaginas) {
        const url = `https://erp.tiny.com.br/public-api/v3/produtos?limit=${limit}&offset=${offset}`;
        let resposta = await fetch(url, { 
            headers: { 'Authorization': `Bearer ${config.access_token}` }
        });
        
        if (resposta.status === 401) {
            config.access_token = await renovarToken();
            resposta = await fetch(url, { 
                headers: { 'Authorization': `Bearer ${config.access_token}` }
            });
        }

        if (resposta.ok) {
            const dados = await resposta.json();
            const itens = dados.itens || [];
            
            if (itens.length > 0) {
                todosOsProdutos = [...todosOsProdutos, ...itens];
                console.log(`Página baixada! Já temos ${todosOsProdutos.length} produtos...`);
                offset += limit; 
            } else {
                temMaisPaginas = false; 
            }
        } else {
            console.error('❌ Falha ao tentar puxar a página:', await resposta.text());
            temMaisPaginas = false;
        }
    }

    catalogoEmMemoria = todosOsProdutos;
    console.log(`✅ Sincronização concluída! Total: ${catalogoEmMemoria.length} produtos.\n`);
}

setInterval(sincronizarCatalogo, 1000 * 60 * 10);

app.get('/api/debug-produto', (req, res) => {
    res.json({ produto: catalogoEmMemoria.length > 0 ? catalogoEmMemoria[0] : null });
});

app.get('/api/produtos', (req, res) => {
    const termoPesquisa = (req.query.pesquisa || '').toLowerCase().trim();
    
    // Filtra apenas produtos ativos (situação 'A' no Tiny)
    const produtosAtivos = catalogoEmMemoria.filter(p => !p.situacao || p.situacao === 'A');

    if (!termoPesquisa) {
        return res.json({ itens: produtosAtivos.slice(0, 100) });
    }

    const resultados = produtosAtivos.filter(produto => {
        const nome = (produto.descricao || '').toLowerCase();
        const sku = (produto.sku || '').toLowerCase();
        return nome.includes(termoPesquisa) || sku.includes(termoPesquisa);
    });

    res.json({ itens: resultados });
});

app.post('/api/produtos/batch', async (req, res) => {
    const skus = req.body.skus || [];
    if (!Array.isArray(skus) || skus.length === 0) {
        return res.json({ itens: [] });
    }
    const resultados = catalogoEmMemoria.filter(p => skus.includes(p.sku));
    
    let config = await lerConfig();
    if (!config.access_token) {
        return res.json({ itens: resultados });
    }

    const itensComEstoque = [];
    for (const prod of resultados) {
        let saldo_real = 0;
        try {
            // Buscando especificamente no endpoint de ESTOQUE do produto
            const url = `https://erp.tiny.com.br/public-api/v3/estoque/produto/${prod.id}`;
            let resposta = await fetch(url, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
            
            if (resposta.status === 401) {
                config.access_token = await renovarToken();
                resposta = await fetch(url, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
            }
            
            if (resposta.status === 429) {
                await new Promise(r => setTimeout(r, 1000));
                resposta = await fetch(url, { headers: { 'Authorization': `Bearer ${config.access_token}` } });
            }

            if (resposta.ok) {
                const detalhes = await resposta.json();
                // O usuario pediu o estoque DISPONÍVEL
                saldo_real = detalhes.disponivel !== undefined ? detalhes.disponivel : 0;
            }
        } catch(e) {
            console.error(`Erro ao buscar saldo do produto ${prod.id}:`, e);
        }
        itensComEstoque.push({ ...prod, saldo_real });
    }

    res.json({ itens: itensComEstoque });
});

app.put('/api/produtos/:id/localizacao', async (req, res) => {
    const idProduto = req.params.id;
    const novaLocalizacao = req.body.localizacao;
    let config = await lerConfig();

    try {
        console.log(`\n✏️ Alterando localização do produto ${idProduto} para: ${novaLocalizacao}`);
        
        const urlBusca = `https://erp.tiny.com.br/public-api/v3/produtos/${idProduto}`;
        let resposta = await fetch(urlBusca, { 
            headers: { 'Authorization': `Bearer ${config.access_token}` }
        });

        if (resposta.status === 401) {
            config.access_token = await renovarToken();
            resposta = await fetch(urlBusca, { 
                headers: { 'Authorization': `Bearer ${config.access_token}` }
            });
        }

        if (!resposta.ok) throw new Error('Falha ao obter produto no Tiny.');
        const produtoCompleto = await resposta.json();

        if (!produtoCompleto.estoque) produtoCompleto.estoque = {};
        produtoCompleto.estoque.localizacao = novaLocalizacao;

        if (produtoCompleto.fornecedores && Array.isArray(produtoCompleto.fornecedores)) {
            produtoCompleto.fornecedores.forEach(fornecedor => {
                if (fornecedor.padrao === null || fornecedor.padrao === undefined) {
                    fornecedor.padrao = false;
                }
            });
        }

        const respostaUpdate = await fetch(urlBusca, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${config.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(produtoCompleto)
        });

        if (!respostaUpdate.ok) {
            const erroTiny = await respostaUpdate.text();
            console.error(`\n❌ O Tiny recusou a atualização do produto ${idProduto}!`);
            console.error(`Motivo revelado pela API: ${erroTiny}\n`);
            throw new Error(`Tiny recusou: ${erroTiny}`);
        }

        const index = catalogoEmMemoria.findIndex(p => p.id == idProduto);
        if (index !== -1) {
            if (!catalogoEmMemoria[index].estoque) catalogoEmMemoria[index].estoque = {};
            catalogoEmMemoria[index].estoque.localizacao = novaLocalizacao;
        }

        console.log(`✅ Sucesso! Localização alterada.`);
        res.json({ sucesso: true });

    } catch (erro) {
        console.error('💥 Erro no processo:', erro.message);
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const config = await lerConfig();
        if (config.access_token && config.refresh_token) {
            res.json({ conectado: true });
        } else {
            res.json({ conectado: false });
        }
    } catch(err) {
        res.status(500).json({ erro: 'Erro ao ler config' });
    }
});

app.get('/api/config', async (req, res) => {
    try {
        const config = await lerConfig();
        res.json({
            client_id: config.client_id || '',
            client_secret: config.client_secret || '',
            redirect_uri: config.redirect_uri || 'http://localhost:3000/callback'
        });
    } catch(err) {
        res.status(500).json({ erro: 'Erro ao ler config' });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { client_id, client_secret, redirect_uri } = req.body;
        let config = await lerConfig();
        
        config.client_id = client_id || config.client_id;
        config.client_secret = client_secret || config.client_secret;
        config.redirect_uri = redirect_uri || config.redirect_uri;
        
        await salvarConfig(config);
        console.log('🔒 Credenciais OAuth atualizadas via painel no Supabase.');
        res.json({ sucesso: true });
    } catch(err) {
        res.status(500).json({ erro: 'Erro ao salvar config' });
    }
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const config = await lerConfig();
    
    if (!code) {
        return res.send('<script>window.opener.postMessage("oauth_error", "*"); window.close();</script>');
    }

    try {
        const url = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';
        const params = new URLSearchParams({
            'grant_type': 'authorization_code',
            'client_id': config.client_id,
            'client_secret': config.client_secret,
            'redirect_uri': config.redirect_uri,
            'code': code
        });

        const resposta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!resposta.ok) {
            console.error('❌ Falha ao trocar código pelo token:', await resposta.text());
            return res.send('<script>window.opener.postMessage("oauth_error", "*"); window.close();</script>');
        }

        const dados = await resposta.json();
        config.access_token = dados.access_token;
        if (dados.refresh_token) config.refresh_token = dados.refresh_token; 
        
        await salvarConfig(config);
        console.log('✅ OAuth Finalizado: Novos tokens recebidos e salvos no Supabase!');
        
        sincronizarCatalogo();

        res.send('<script>window.opener.postMessage("oauth_success", "*"); window.close();</script>');

    } catch (erro) {
        console.error('💥 Erro na rota /callback:', erro);
        res.send('<script>window.opener.postMessage("oauth_error", "*"); window.close();</script>');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Motor ligado na porta ${PORT}`);
    await sincronizarCatalogo();
});