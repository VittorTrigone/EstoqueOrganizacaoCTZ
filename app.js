const supabaseUrl = 'https://holwwaynwfftqxzlinpv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHd3YXlud2ZmdHF4emxpbnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDk2OTUsImV4cCI6MjA5NjY4NTY5NX0.2159--CPum38Zt6jydynl_alApVfTlAPYQifu2jjTGo';
const supabaseApp = window.supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// CONFIGURAÇÃO DE AMBIENTE (MUDE PARA DEPLOY)
// ==========================================
// Quando colocar o servidor no ar pelo Render, troque aqui pela URL nova. Ex: 'https://seu-app.onrender.com'
const API_BASE_URL = 'https://estoqueorganizacaoctz.onrender.com';

// Estrutura de Dados Espacial (Com Percentuais e Rotação)
const defaultWarehouseData = {
    id: 'warehouse-1',
    name: 'Armazém Principal',
    bgImage: null,
    bgWidth: null, // Tamanho natural da imagem
    bgHeight: null,
    aisles: [
        { id: 'aisle-1', name: 'Corredor A', x: 10, y: 10, w: 40, h: 30, rotation: 0 }
    ],
    racks: [
        {
            id: 'rack-1', name: 'A1', x: 12, y: 12, w: 5, h: 10, rotation: 0,
            levels: [
                { id: 'l1', name: 'Nível 1 (Chão)', capacity: 1000, currentLoad: 800 },
                { id: 'l2', name: 'Nível 2', capacity: 1000, currentLoad: 400 }
            ]
        }
    ]
};

let warehouseData = null;
let isEditMode = false;
let isSnapEnabled = true;
let selectedItem = null; // { item, type } - maintained for single selection logic compatibility
let selectedItems = []; // Array of { item, type }
let clipboard = []; // Array of copied objects
let currentZoom = 1.0;
let panX = 0;
let panY = 0;

window.handleItemSelection = function(e, item, type, el) {
    if (e.shiftKey) {
        const index = selectedItems.findIndex(si => si.item.id === item.id);
        if (index > -1) {
            selectedItems.splice(index, 1);
        } else {
            selectedItems.push({ item, type });
        }
    } else {
        const index = selectedItems.findIndex(si => si.item.id === item.id);
        if (index > -1) {
            // Clicou num item que já estava selecionado (sem shift) -> Deseleciona
            selectedItems = [];
            closeInspector();
            return;
        } else {
            selectedItems = [{ item, type }];
        }
    }
    
    // Fallback for single selection logic in older parts of the code
    selectedItem = selectedItems.length > 0 ? selectedItems[0] : null;
    
    openEditorPropertiesMulti();
    
    // Highlight da UI no canvas
    document.querySelectorAll('.rack, .aisle').forEach(r => {
        r.classList.remove('is-selected');
        r.style.borderColor = 'var(--border-color)';
        r.style.boxShadow = 'var(--shadow-md)';
    });
    
    selectedItems.forEach(si => {
        const targetEl = document.querySelector(`.${si.type}[data-id="${si.item.id}"]`);
        if (targetEl) {
            targetEl.classList.add('is-selected');
            targetEl.style.borderColor = 'var(--accent-warning)';
            targetEl.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.5)';
        }
    });

    document.querySelectorAll('.rotate-handle').forEach(h => h.remove());
    if (selectedItems.length === 1) {
        attachRotationHandle(document.querySelector(`.${selectedItems[0].type}[data-id="${selectedItems[0].item.id}"]`), selectedItems[0].item, selectedItems[0].type);
    }
};

const dom = {
    canvas: document.getElementById('warehouse-canvas'),
    btnEditMode: document.getElementById('btn-edit-mode'),
    toolbar: document.getElementById('editor-toolbar'),
    btnAddAisle: document.getElementById('btn-add-aisle'),
    btnAddRack: document.getElementById('btn-add-rack'),
    btnToggleSnap: document.getElementById('btn-toggle-snap'),
    inspector: document.getElementById('rack-inspector'),
    btnCloseInspector: document.getElementById('btn-close-inspector'),
    inspectorContent: document.getElementById('inspector-content'),
    appContainer: document.querySelector('.app-container'),
    uploadBg: document.getElementById('upload-bg'),
    navFloorplan: document.getElementById('nav-floorplan'),
    navItemlist: document.getElementById('nav-itemlist'),
    containerFloorplan: document.getElementById('floor-plan-container'),
    containerItemlist: document.getElementById('item-list-container'),
    pageTitle: document.getElementById('page-title'),
    pageSubtitle: document.getElementById('page-subtitle'),
    floorplanActions: document.getElementById('floorplan-actions'),
    itemTableBody: document.getElementById('item-table-body')
};

async function init() {
    await loadData();
    setupEventListeners();
    applyBackground();
    setupInteractJs();
}

async function loadData() {
    try {
        const { data, error } = await supabaseApp
            .from('armazem')
            .select('racks')
            .eq('id', 1)
            .single();

        if (data && data.racks && Object.keys(data.racks).length > 0) {
            // Suporta migração: Se estiver salvo como string ou objeto JSON
            warehouseData = typeof data.racks === 'string' ? JSON.parse(data.racks) : data.racks;
            if (!warehouseData.racks) warehouseData.racks = [];
            if (!warehouseData.aisles) warehouseData.aisles = [];
        } else {
            // Tenta pegar do localStorage antigo como fallback na primeira vez
            const stored = localStorage.getItem('estoquepro_data');
            warehouseData = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(defaultWarehouseData));
            saveData();
        }
    } catch (e) {
        console.error("Erro ao carregar Supabase:", e);
        const stored = localStorage.getItem('estoquepro_data');
        warehouseData = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(defaultWarehouseData));
    }
    
    // Dedup items and merge qty (cleanup bug)
    if (warehouseData.racks) {
        let hasChanges = false;
        warehouseData.racks.forEach(rack => {
            if (rack.levels) {
                rack.levels.forEach(level => {
                    if (level.items) {
                        const uniqueMap = {};
                        level.items.forEach(item => {
                            if (!uniqueMap[item.sku]) {
                                uniqueMap[item.sku] = { ...item };
                                // For manually dragged visual boxes before Mobile Audit existed
                                if (uniqueMap[item.sku].qty === undefined) {
                                    uniqueMap[item.sku].qty = 1; 
                                }
                            } else {
                                // Se for duplicado, nós SOMAMOS a quantidade para não perder dados!
                                const currentQty = uniqueMap[item.sku].qty ? Number(uniqueMap[item.sku].qty) : 1;
                                const newQty = item.qty ? Number(item.qty) : 1;
                                uniqueMap[item.sku].qty = currentQty + newQty;
                                hasChanges = true;
                            }
                        });
                        level.items = Object.values(uniqueMap);
                    }
                });
            }
        });
        if (hasChanges) saveData();
    }
    
    // Sempre re-renderiza o galpão após carregar
    renderFloorPlan();
}

async function saveData() {
    // Mantém o backup no localStorage por segurança
    try {
        localStorage.setItem('estoquepro_data', JSON.stringify(warehouseData));
    } catch(e) {
        console.warn('Não foi possível salvar no localStorage (limite excedido), mas o Supabase continuará salvando:', e);
    }
    
    // Salva na nuvem
    try {
        await supabaseApp
            .from('armazem')
            .upsert({
                id: 1,
                racks: warehouseData
            });
    } catch(err) {
        console.error("Erro ao salvar no Supabase:", err);
    }
}

function applyBackground() {
    if (warehouseData.bgImage) {
        dom.canvas.style.backgroundImage = `url(${warehouseData.bgImage})`;
        dom.canvas.style.backgroundSize = '100% 100%';
        
        // Se já tiver as dimensões salvas, aplica
        if (warehouseData.bgWidth && warehouseData.bgHeight) {
            window.changeZoom(0);
            renderFloorPlan();
        } else {
            // Correção retroativa para imagens antigas que não salvaram a largura/altura
            const img = new Image();
            img.onload = function() {
                warehouseData.bgWidth = img.naturalWidth;
                warehouseData.bgHeight = img.naturalHeight;
                saveData();
                window.changeZoom(0);
                renderFloorPlan();
            };
            img.src = warehouseData.bgImage;
        }
    } else {
        dom.canvas.style.backgroundImage = '';
        dom.canvas.style.width = '100%';
        dom.canvas.style.height = '100%';
        dom.canvas.style.minWidth = '100%';
        dom.canvas.style.minHeight = '100%';
        renderFloorPlan();
    }
}

function updateCanvasTransform() {
    dom.canvas.style.transform = `translate(${panX}px, ${panY}px)`;
    
    if (warehouseData && warehouseData.bgWidth && warehouseData.bgHeight) {
        const w = warehouseData.bgWidth * currentZoom;
        const h = warehouseData.bgHeight * currentZoom;
        dom.canvas.style.width = `${w}px`;
        dom.canvas.style.height = `${h}px`;
        dom.canvas.style.minWidth = `${w}px`;
        dom.canvas.style.minHeight = `${h}px`;
    }
    
    // Toggle Level of Detail (LOD) Rack View when zoomed in sufficiently
    if (currentZoom >= 1.5) {
        dom.appContainer.classList.add('lod-active');
    } else {
        dom.appContainer.classList.remove('lod-active');
    }
}

window.changeZoom = function(delta, focusX = null, focusY = null) {
    const oldZoom = currentZoom;
    currentZoom += delta;
    if(currentZoom < 0.1) currentZoom = 0.1;
    if(currentZoom > 10.0) currentZoom = 10.0;
    
    document.getElementById('zoom-level-text').innerText = Math.round(currentZoom * 100) + '%';
    
    if (warehouseData && warehouseData.bgWidth && warehouseData.bgHeight) {
        const container = dom.containerFloorplan;
        
        if (focusX === null) focusX = container.getBoundingClientRect().left + container.clientWidth / 2;
        if (focusY === null) focusY = container.getBoundingClientRect().top + container.clientHeight / 2;

        const cRect = container.getBoundingClientRect();
        
        // Posição local do mouse relativa à viewport do container
        const localX = focusX - cRect.left;
        const localY = focusY - cRect.top;

        if (delta !== 0) {
            // Converte a posição do mouse para as coordenadas brutas da imagem (desconsiderando zoom)
            const unscaledX = (localX - panX) / oldZoom;
            const unscaledY = (localY - panY) / oldZoom;
            
            // Nova posição física em pixels que essa mesma coordenada bruta passará a ter no novo zoom
            const newScaledX = unscaledX * currentZoom;
            const newScaledY = unscaledY * currentZoom;
            
            // Ajusta o Pan para que o pixel físico da imagem permaneça embaixo do mouse
            panX = localX - newScaledX;
            panY = localY - newScaledY;
        }
        
        updateCanvasTransform();
    }
};

window.resetZoom = function() {
    if (!warehouseData || !warehouseData.bgWidth || !warehouseData.bgHeight) return;
    
    const container = dom.containerFloorplan;
    const cw = container.clientWidth - 80; // 40px de respiro dos lados
    const ch = container.clientHeight - 80;
    
    if (cw <= 0 || ch <= 0) return;
    
    const scaleX = cw / warehouseData.bgWidth;
    const scaleY = ch / warehouseData.bgHeight;
    
    currentZoom = Math.min(scaleX, scaleY);
    if(currentZoom < 0.1) currentZoom = 0.1;
    if(currentZoom > 10.0) currentZoom = 10.0;
    
    const w = warehouseData.bgWidth * currentZoom;
    const h = warehouseData.bgHeight * currentZoom;
    
    panX = (container.clientWidth - w) / 2;
    panY = (container.clientHeight - h) / 2;
    
    document.getElementById('zoom-level-text').innerText = Math.round(currentZoom * 100) + '%';
    updateCanvasTransform();
};

dom.uploadBg.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const result = event.target.result;
        
        // Pegar dimensões reais da imagem
        const img = new Image();
        img.onload = function() {
            warehouseData.bgImage = result;
            warehouseData.bgWidth = img.naturalWidth;
            warehouseData.bgHeight = img.naturalHeight;
            saveData();
            applyBackground();
        };
        img.src = result;
    };
    reader.readAsDataURL(file);
});

// Lógica de Rotação Manual (Photoshop style)
function attachRotationHandle(el, item) {
    const handle = document.createElement('div');
    handle.className = 'rotate-handle';
    el.appendChild(handle);

    let isRotating = false;
    let centerX, centerY;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Impede o interact.js de arrastar
        isRotating = true;
        
        // Pega o centro exato do elemento na tela
        const rect = el.getBoundingClientRect();
        centerX = rect.left + (rect.width / 2);
        centerY = rect.top + (rect.height / 2);

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isRotating) return;
        
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        angle += 90;
        
        // Travadinha magnética mais sensível (apenas +/- 4 graus de distância)
        const snapAngle = Math.round(angle / 90) * 90;
        clearSnapGuides();
        
        if (Math.abs(angle - snapAngle) <= 4) {
            angle = snapAngle;
            
            // Desenhar guias em cruz indicando o alinhamento reto
            const cw = dom.canvas.offsetWidth;
            const ch = dom.canvas.offsetHeight;
            const itemCenterX = (item.x / 100) * cw + ((item.w / 100) * cw / 2);
            const itemCenterY = (item.y / 100) * ch + ((item.h / 100) * ch / 2);
            
            const vGuide = document.createElement('div');
            vGuide.className = 'snap-guide-vertical';
            vGuide.style.left = `${itemCenterX}px`;
            
            const hGuide = document.createElement('div');
            hGuide.className = 'snap-guide-horizontal';
            hGuide.style.top = `${itemCenterY}px`;
            
            dom.canvas.appendChild(vGuide);
            dom.canvas.appendChild(hGuide);
        }
        
        el.style.transform = `rotate(${angle}deg)`;
        item.rotation = angle;
    }

    function onMouseUp() {
        isRotating = false;
        clearSnapGuides();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        saveData();
    }
}

function renderFloorPlan() {
    dom.canvas.innerHTML = '';
    
    warehouseData.aisles.forEach(aisle => {
        const el = document.createElement('div');
        el.className = 'aisle interactable';
        el.dataset.type = 'aisle';
        el.dataset.id = aisle.id;
        
        el.style.left = `${aisle.x}%`;
        el.style.top = `${aisle.y}%`;
        el.style.width = `${aisle.w}%`;
        el.style.height = `${aisle.h}%`;
        el.style.transform = `rotate(${aisle.rotation || 0}deg)`;
        
        const label = document.createElement('div');
        label.className = 'aisle-label';
        label.textContent = aisle.name;
        el.appendChild(label);
        
        // Verifica se está selecionado
        const isSelected = selectedItems.find(si => si.item.id === aisle.id);
        if (isSelected) {
            el.classList.add('is-selected');
            el.style.borderColor = 'var(--accent-warning)';
            el.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.5)';
        }
        
        // Alça de rotação apenas se estiver em modo edição E for o selecionado único
        if (isEditMode && selectedItem && selectedItem.item.id === aisle.id) {
            attachRotationHandle(el, aisle);
        }
        
        el.addEventListener('click', (e) => {
            if (hasMoved) return;
            if (isEditMode) {
                handleItemSelection(e, aisle, 'aisle', el);
            }
        });
        
        dom.canvas.appendChild(el);
    });

    warehouseData.racks.forEach(rack => {
        const el = document.createElement('div');
        el.className = 'rack interactable';
        el.dataset.type = 'rack';
        el.dataset.id = rack.id;
        
        el.style.left = `${rack.x}%`;
        el.style.top = `${rack.y}%`;
        el.style.width = `${rack.w}%`;
        el.style.height = `${rack.h}%`;
        el.style.transform = `rotate(${rack.rotation || 0}deg)`;
        
        const label = document.createElement('div');
        label.className = 'rack-label';
        label.textContent = rack.name;
        el.appendChild(label);
        
        // --- INICIO LOD: VISÃO DETALHADA ---
        const lodContainer = document.createElement('div');
        lodContainer.className = 'rack-lod-container';
        
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'lod-tabs';
        
        const contentContainer = document.createElement('div');
        contentContainer.className = 'lod-content';
        
        function renderLODLevel(levelId) {
            contentContainer.innerHTML = '';
            const level = rack.levels.find(l => l.id === levelId);
            
            if (!level || !level.items || level.items.length === 0) {
                contentContainer.innerHTML = '<div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); font-size:0.5rem; text-align:center;">Vazio</div>';
                return;
            }
            
            const itemsToRender = level.items.map((item, index) => ({ item, index })).reverse();
            itemsToRender.forEach(({ item, index }) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'lod-item';
                itemDiv.draggable = true;
                itemDiv.dataset.index = index;
                
                // Texto com tamanho dinâmico pra evitar quebrar feio
                const displayText = item.name || item.sku;
                itemDiv.innerHTML = `<strong>${displayText}</strong>`;
                
                itemDiv.title = item.name || '';
                
                itemDiv.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    itemDiv.classList.add('dragging');
                    e.dataTransfer.setData('text/plain', JSON.stringify({ rackId: rack.id, levelId: levelId, fromIndex: index }));
                });
                
                itemDiv.addEventListener('dragend', () => itemDiv.classList.remove('dragging'));
                
                itemDiv.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    itemDiv.classList.add('drag-over');
                });
                
                itemDiv.addEventListener('dragleave', () => itemDiv.classList.remove('drag-over'));
                
                itemDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.openRackVisualizer(rack.id);
                });
                
                itemDiv.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    itemDiv.classList.remove('drag-over');
                    
                    try {
                        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                        if (data.rackId === rack.id && data.levelId === levelId) {
                            if (data.fromIndex !== index) {
                                const movedItem = level.items.splice(data.fromIndex, 1)[0];
                                level.items.splice(index, 0, movedItem);
                                saveData();
                                renderLODLevel(levelId);
                                if (!isEditMode && selectedItem === null && document.getElementById(`rack-levels-container`)) {
                                    openInspector(rack.id); // Refresh sidebar se aberta
                                }
                            }
                        }
                    } catch (err) { console.error(err); }
                });
                
                contentContainer.appendChild(itemDiv);
            });
        }
        
        let initialLevelId = null;
        if (rack.levels && rack.levels.length > 0) {
            const reversedLevels = [...rack.levels].reverse();
            initialLevelId = reversedLevels[0].id;
            
            reversedLevels.forEach((level, idx) => {
                const tab = document.createElement('div');
                tab.className = 'lod-tab';
                if (idx === 0) tab.classList.add('active');
                
                let shortName = level.name.split(' ')[0].substring(0,2).toUpperCase();
                if (level.name.toLowerCase().includes('nivel') || level.name.toLowerCase().includes('nível')) {
                    const numMatch = level.name.match(/\d+/);
                    shortName = numMatch ? `N${numMatch[0]}` : 'N';
                }
                
                tab.textContent = shortName;
                tab.title = level.name;
                
                tab.addEventListener('mousedown', (e) => e.stopPropagation());
                tab.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tabsContainer.querySelectorAll('.lod-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    renderLODLevel(level.id);
                });
                tabsContainer.appendChild(tab);
            });
        }
        
        lodContainer.appendChild(tabsContainer);
        lodContainer.appendChild(contentContainer);
        if (initialLevelId) renderLODLevel(initialLevelId);
        
        // Verifica se está selecionado
        const isSelectedRack = selectedItems.find(si => si.item.id === rack.id);
        if (isSelectedRack) {
            el.classList.add('is-selected');
            el.style.borderColor = 'var(--accent-warning)';
            el.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.5)';
        }
        
        contentContainer.addEventListener('mousedown', (e) => e.stopPropagation());
        el.appendChild(lodContainer);
        // --- FIM LOD ---

        el.addEventListener('click', (e) => {
            if (hasMoved) return;
            if (isEditMode) {
                handleItemSelection(e, rack, 'rack', el);
            } else {
                window.openRackVisualizer(rack.id);
                
                // Remove highlight das outras
                document.querySelectorAll('.rack, .aisle').forEach(r => {
                    r.style.borderColor = 'var(--border-color)';
                    r.style.boxShadow = 'var(--shadow-md)';
                });
                
                // Highlight
                el.style.borderColor = 'var(--accent-primary)';
                el.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.5)';
            }
        });
        
        dom.canvas.appendChild(el);
    });
}

function toggleEditMode() {
    isEditMode = !isEditMode;
    const btnUploadBg = document.getElementById('btn-upload-bg');
    if (isEditMode) {
        dom.appContainer.classList.add('active-edit-mode');
        dom.btnEditMode.innerHTML = '<i class="fa-solid fa-check"></i> Concluir Edição';
        dom.toolbar.classList.remove('hidden');
        if (btnUploadBg) btnUploadBg.classList.remove('hidden');
        closeInspector(); // Força a exibição do painel com "Nada Selecionado"
    } else {
        dom.appContainer.classList.remove('active-edit-mode');
        dom.btnEditMode.innerHTML = '<i class="fa-solid fa-pen-ruler"></i> Modo Edição';
        dom.toolbar.classList.add('hidden');
        if (btnUploadBg) btnUploadBg.classList.add('hidden');
        closeInspector();
        renderFloorPlan(); // Remove alças de rotação visualmente
    }
}

function addAisle() {
    warehouseData.aisles.push({
        id: 'aisle-' + Date.now(),
        name: 'Novo Corredor',
        x: 40, y: 40, w: 20, h: 20, rotation: 0
    });
    saveData();
    renderFloorPlan();
}

function addRack() {
    warehouseData.racks.push({
        id: 'rack-' + Date.now(),
        name: 'Nova',
        x: 45, y: 45, w: 5, h: 10, rotation: 0,
        levels: [
            { id: 'l-' + Date.now(), name: 'Nível 1', capacity: 1000, currentLoad: 0 }
        ]
    });
    saveData();
    renderFloorPlan();
}

function findParentAisleForRack(rack) {
    const cx = rack.x + (rack.w / 2);
    const cy = rack.y + (rack.h / 2);

    for (const aisle of warehouseData.aisles) {
        if (cx >= aisle.x && cx <= (aisle.x + aisle.w) &&
            cy >= aisle.y && cy <= (aisle.y + aisle.h)) {
            return aisle;
        }
    }
    return null;
}

// === PAINEL DE EDIÇÃO (PROPRIEDADES) ===
window.openEditorPropertiesMulti = function() {
    dom.inspector.classList.add('active');
    
    if (selectedItems.length === 0) {
        dom.inspector.classList.remove('active');
        return;
    }
    
    if (selectedItems.length === 1) {
        openEditorProperties(selectedItems[0].item.id, selectedItems[0].type);
        return;
    }
    
    // Multiple selection mode
    dom.inspector.querySelector('.inspector-header h2').textContent = `Múltiplos Selecionados (${selectedItems.length})`;
    
    dom.inspectorContent.innerHTML = `
        <div class="level-card" style="text-align: center; color: var(--text-secondary);">
            <p style="margin-bottom: 1rem;"><i class="fa-solid fa-layer-group" style="font-size: 2rem; margin-bottom: 0.5rem; display:block;"></i></p>
            <p>Vários itens estão selecionados.</p>
            <p style="font-size: 0.8rem; margin-top: 0.5rem;">Use <strong>Ctrl+C</strong> / <strong>Ctrl+V</strong> para copiar/colar ou <strong>Delete</strong> para apagar todos os itens selecionados.</p>
            <button class="btn" id="btn-delete-multi" style="width:100%; margin-top: 1rem; background:var(--accent-danger); color:white;">
                <i class="fa-solid fa-trash"></i> Excluir Todos
            </button>
        </div>
    `;
    
    document.getElementById('btn-delete-multi').addEventListener('click', () => {
        window.deleteSelectedItems();
    });
};

function openEditorProperties(id, type) {
    const list = type === 'aisle' ? warehouseData.aisles : warehouseData.racks;
    const item = list.find(i => i.id === id);
    if (!item) return;
    
    dom.inspector.querySelector('.inspector-header h2').textContent = `Editar ${type === 'aisle' ? 'Corredor' : 'Estante'}`;
    
    dom.inspectorContent.innerHTML = `
        <div class="level-card">
            <div style="margin-bottom: 1rem;">
                <label style="display:block; margin-bottom: 0.5rem; font-size:0.875rem; color:var(--text-secondary)">Nome:</label>
                <input type="text" id="prop-name" value="${item.name}" style="width:100%; padding:0.5rem; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-base); color:var(--text-primary);">
            </div>
            
            ${type === 'rack' ? `
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem; text-align: center;">
                    Para imprimir o QR Code desta estante, desative o Modo de Edição e clique nela novamente.
                </div>
            ` : ''}

            <button class="btn" id="btn-delete" style="width:100%; background:var(--accent-danger); color:white;">
                <i class="fa-solid fa-trash"></i> Excluir
            </button>
        </div>
    `;
    
    const propNameInput = document.getElementById('prop-name');
    let originalName = item.name;

    propNameInput.addEventListener('input', (e) => {
        item.name = e.target.value;
        saveData();
        renderFloorPlan();
    });
    
    propNameInput.addEventListener('change', (e) => {
        const newName = e.target.value;
        if (newName !== originalName) {
            originalName = newName;
            window.syncOlistForStructuralChange(id, type);
        }
    });
    
    document.getElementById('btn-delete').addEventListener('click', () => {
        if(confirm(`Tem certeza que deseja excluir?`)) {
            if(type === 'aisle') {
                warehouseData.aisles = warehouseData.aisles.filter(a => a.id !== id);
            } else {
                warehouseData.racks = warehouseData.racks.filter(r => r.id !== id);
            }
            saveData();
            closeInspector();
            renderFloorPlan();
        }
    });

    dom.inspector.classList.remove('hidden');
}


// === INSPETOR DE ESTANTE (VISÃO NORMAL) ===
function openInspector(rackId) {
    const rack = warehouseData.racks.find(r => r.id === rackId);
    if (!rack) return;
    
    const parentAisle = findParentAisleForRack(rack);
    const aisleText = parentAisle ? `(Corredor: ${parentAisle.name})` : '(Sem Corredor)';
    dom.inspector.querySelector('.inspector-header h2').textContent = `Estante ${rack.name} ${aisleText}`;
    
    dom.inspectorContent.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom: 1rem; align-items:center;">
            <span style="font-weight:bold; color:var(--text-secondary);">Gerenciar Níveis</span>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary btn-small" onclick="window.addLevelToRack('${rack.id}')" style="font-size: 0.75rem;">
                    <i class="fa-solid fa-layer-group"></i> + Nível
                </button>
            </div>
        </div>
        
        <button class="btn btn-secondary" onclick="window.generateQRCode('${rack.id}')" style="width:100%; justify-content:center; margin-bottom: 1.5rem; border-color: var(--accent-primary); color: var(--text-primary); background: rgba(249, 115, 22, 0.1);">
            <i class="fa-solid fa-qrcode" style="color: var(--accent-primary);"></i> Imprimir QR Code da Estante
        </button>
    `;
    
    if (rack.levels.length === 0) {
        dom.inspectorContent.innerHTML += '<div class="empty-state">Nenhum nível cadastrado.</div>';
    }
    
    [...rack.levels].reverse().forEach(level => {
        // Salvaguarda migração
        if (!level.items) level.items = [];
        const itemCount = level.items.length;
        
        let itemsHtml = level.items.map((it, idx) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background: var(--bg-surface-elevated); padding: 0.75rem; margin-top: 0.5rem; border-radius: 4px; font-size: 0.875rem; border: 1px solid var(--border-color);">
                <div><strong>${it.sku}</strong> - ${it.name}</div>
                <button onclick="window.removeItemFromLevel('${rack.id}', '${level.id}', ${idx})" style="background:none; border:none; color:var(--accent-danger); cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');

        const card = document.createElement('div');
        card.className = 'level-card';
        card.innerHTML = `
            <div class="level-header" style="align-items: center;">
                <input type="text" value="${level.name}" onchange="window.renameLevel('${rack.id}', '${level.id}', this.value)" style="background: transparent; border: 1px dashed var(--border-color); color: var(--text-primary); font-weight: bold; width: 60%; padding: 0.2rem;" title="Editar Nome do Nível">
                <span style="font-size: 0.875rem; color: var(--text-secondary)">Itens: ${itemCount}</span>
            </div>
            
            <div id="add-item-container-${level.id}" style="margin-top: 1rem;">
                <button class="btn btn-secondary btn-small" onclick="window.showAddItemForm('${rack.id}', '${level.id}')" style="width: 100%; justify-content: center; border: 1px solid var(--accent-success); color: var(--accent-success); padding: 0.5rem;">
                    <i class="fa-solid fa-plus"></i> Adicionar Item
                </button>
            </div>
            
            <div class="items-list" style="margin-top: 1rem;">
                ${itemsHtml}
            </div>
        `;
        dom.inspectorContent.appendChild(card);
    });
    
    dom.inspector.classList.remove('hidden');
}

window.generateQRCode = function(rackId) {
    const rack = warehouseData.racks.find(r => r.id === rackId);
    if (!rack) return;
    
    // Constrói a URL para a auditoria
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const url = baseUrl + '?auditoria=' + rackId;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'z-index: 10000; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);';
    modal.innerHTML = `
        <div style="background: var(--bg-surface); padding: 2rem; border-radius: 12px; width: 400px; max-width: 90%; text-align: center; border: 1px solid var(--border-color); box-shadow: var(--shadow-xl);">
            <h2 style="margin-top: 0;">QR Code: ${rack.name}</h2>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.9rem;">Escaneie com o celular para iniciar a auditoria de inventário desta estante.</p>
            <div style="background: white; padding: 1rem; border-radius: 8px; display: inline-block; margin-bottom: 1.5rem;">
                <img src="${qrUrl}" alt="QR Code" style="width: 250px; height: 250px;">
            </div>
            <p style="color: var(--text-secondary); font-size: 0.75rem; word-break: break-all; margin-bottom: 1.5rem;">${url}</p>
            <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()" style="width: 100%; justify-content: center;">Fechar</button>
        </div>
    `;
    document.body.appendChild(modal);
};

// === LÓGICA DE ITENS E NÍVEIS GLOBAIS ===
window.addLevelToRack = function(rackId) {
    const rack = warehouseData.racks.find(r => r.id === rackId);
    if(rack) {
        if(!rack.levels) rack.levels = [];
        const nextNum = rack.levels.length + 1;
        rack.levels.push({
            id: 'l-' + Date.now(),
            name: 'Nível ' + nextNum,
            capacity: 1000,
            currentLoad: 0,
            items: []
        });
        saveData();
        openInspector(rackId); // re-render
    }
};

window.renameLevel = function(rackId, levelId, newName) {
    const rack = warehouseData.racks.find(r => r.id === rackId);
    const level = rack.levels.find(l => l.id === levelId);
    if(level && level.name !== newName) {
        level.name = newName;
        saveData();
        window.syncOlistForStructuralChange(levelId, 'level');
    }
};

window.showAddItemForm = function(rackId, levelId) {
    const container = document.getElementById(`add-item-container-${levelId}`);
    if (!container) return;
    
    // Limpar estado anterior
    window.currentSelectedOlistProductId = null;
    window.currentOlistLocalizacao = null;

    container.innerHTML = `
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); margin-top: 0.5rem; position: relative;">
            <div style="margin-bottom: 0.75rem; position: relative;">
                <label style="display:block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Buscar no Olist/Tiny</label>
                <input type="text" id="search-olist-${levelId}" placeholder="Digite Nome ou SKU..." autocomplete="off" style="width:100%; min-width:0; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--accent-primary); background: var(--bg-base); color: var(--text-primary);">
                <div id="search-results-${levelId}" class="olist-search-results hidden"></div>
            </div>
            
            <div style="margin-bottom: 0.75rem;">
                <label style="display:flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
                    Código SKU
                    <span id="sync-status-${levelId}" style="display:none; align-items:center; gap:4px; font-weight:bold;"></span>
                </label>
                <input type="text" id="new-sku-${levelId}" placeholder="Selecione na busca acima" readonly style="width:100%; min-width:0; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.5); color: var(--text-secondary); opacity: 0.8;">
            </div>
            <div style="margin-bottom: 1rem;">
                <label style="display:block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Nome / Descrição do Produto</label>
                <input type="text" id="new-name-${levelId}" placeholder="Preenchido automaticamente" style="width:100%; min-width:0; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-base); color: var(--text-primary);">
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="window.submitNewItem('${rackId}', '${levelId}')" style="flex: 1; min-width: 120px; justify-content: center; padding: 0.5rem;">Salvar</button>
                <button class="btn btn-secondary" onclick="openInspector('${rackId}')" style="flex: 1; min-width: 120px; justify-content: center; padding: 0.5rem;">Cancelar</button>
            </div>
        </div>
    `;
    
    const searchInput = document.getElementById(`search-olist-${levelId}`);
    const resultsContainer = document.getElementById(`search-results-${levelId}`);
    let searchTimeout = null;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const termo = e.target.value.trim();
        if (!termo) {
            resultsContainer.classList.add('hidden');
            return;
        }
        
        searchTimeout = setTimeout(async () => {
            try {
                resultsContainer.innerHTML = '<div style="padding: 0.5rem; color: var(--text-secondary); text-align: center;">Buscando...</div>';
                resultsContainer.classList.remove('hidden');
                
                const response = await fetch(`${API_BASE_URL}/api/produtos?pesquisa=${encodeURIComponent(termo)}`);
                if (!response.ok) throw new Error('Erro na API');
                
                const data = await response.json();
                if (!data.itens || data.itens.length === 0) {
                    resultsContainer.innerHTML = '<div style="padding: 0.5rem; color: var(--text-secondary); text-align: center;">Nenhum produto encontrado.</div>';
                    return;
                }
                
                resultsContainer.innerHTML = '';
                data.itens.forEach(produto => {
                    const nome = produto.descricao || 'Sem Nome';
                    const sku = produto.sku || 'Sem SKU';
                    const localizacao = produto.estoque?.localizacao || '';
                    
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'olist-search-item';
                    itemDiv.innerHTML = `<strong>${sku}</strong> - ${nome}`;
                    
                    itemDiv.addEventListener('click', () => {
                        document.getElementById(`new-sku-${levelId}`).value = sku;
                        
                        const nameInput = document.getElementById(`new-name-${levelId}`);
                        const localName = window.getLocalNameForSKU ? window.getLocalNameForSKU(sku) : null;
                        
                        if (localName) {
                            nameInput.value = localName;
                            nameInput.readOnly = true;
                            nameInput.style.backgroundColor = 'rgba(0,0,0,0.2)';
                            nameInput.title = "Nome bloqueado pois este SKU já existe no galpão. Para alterar, edite na Lista de Itens.";
                        } else {
                            nameInput.value = nome;
                            nameInput.readOnly = false;
                            nameInput.style.backgroundColor = 'transparent';
                            nameInput.title = "";
                        }
                        
                        window.currentSelectedOlistProductId = produto.id;
                        window.currentOlistLocalizacao = localizacao;
                        
                        searchInput.value = sku;
                        resultsContainer.classList.add('hidden');
                        
                        // Validar Sincronia de Localização
                        const rack = warehouseData.racks.find(r => r.id === rackId);
                        const level = rack.levels.find(l => l.id === levelId);
                        const parentAisle = findParentAisleForRack(rack);
                        const corredorNome = parentAisle ? parentAisle.name : 'Sem Corredor';
                        
                        const simulatedPlacement = { corridor: corredorNome, rack: rack.name, level: level.name };
                        const expectedLoc = window.calculateOlistLocationString(sku, simulatedPlacement);
                        
                        const statusSpan = document.getElementById(`sync-status-${levelId}`);
                        statusSpan.style.display = 'flex';
                        statusSpan.innerHTML = '<span style="color: var(--accent-success);">🟢 Sincronizado</span>';
                    });
                    resultsContainer.appendChild(itemDiv);
                });
                
            } catch (err) {
                resultsContainer.innerHTML = '<div style="padding: 0.5rem; color: var(--accent-danger); text-align: center;">Erro ao conectar. Servidor Node está rodando?</div>';
            }
        }, 400);
    });

    setTimeout(() => {
        if(searchInput) searchInput.focus();
    }, 50);
};

window.submitNewItem = async function(rackId, levelId) {
    const sku = document.getElementById(`new-sku-${levelId}`).value.trim();
    const name = document.getElementById(`new-name-${levelId}`).value.trim();
    
    if (!sku || !name) {
        alert("Por favor, selecione um produto pela busca.");
        return;
    }
    
    const rack = warehouseData.racks.find(r => r.id === rackId);
    const level = rack.levels.find(l => l.id === levelId);
    const parentAisle = findParentAisleForRack(rack);
    
    // Verificação para impedir produto duplicado no mesmo nível
    if (level.items && level.items.some(item => item.sku.toLowerCase() === sku.toLowerCase())) {
        alert("Este produto já está adicionado neste mesmo nível da estante.");
        return;
    }
    
    const olistIdToUse = window.currentSelectedOlistProductId || window.getOlistIdForSKU(sku);
    if (olistIdToUse) {
        const btnSalvar = document.querySelector(`#add-item-container-${levelId} .btn-primary`);
        if (btnSalvar) {
            btnSalvar.innerHTML = 'Salvando no Olist...';
            btnSalvar.disabled = true;
        }
        
        // Simular a adição para gerar a string e sincronizar
        if (!level.items) level.items = [];
        level.items.push({ sku, name, olistId: olistIdToUse });
        
        await window.syncLocationToOlist(sku, olistIdToUse);
        
        // Remove a simulação para deixar o código final salvar localmente de forma limpa abaixo
        level.items.pop();
    }
    
    if (!level.items) level.items = [];
    level.items.push({ sku, name, olistId: window.currentSelectedOlistProductId });
    saveData();
    renderFloorPlan(); // Atualiza a planta (e a visão de Raio-X se estiver com zoom)
    openInspector(rackId); // re-render para mostrar o novo item e fechar o form
};

window.removeItemFromLevel = async function(rackId, levelId, index) {
    if(confirm('Remover item?')) {
        const rack = warehouseData.racks.find(r => r.id === rackId);
        const level = rack.levels.find(l => l.id === levelId);
        const item = level.items[index];
        const sku = item.sku;
        const olistId = item.olistId || window.getOlistIdForSKU(sku);
        
        level.items.splice(index, 1);
        saveData();
        
        if (olistId) {
            await window.syncLocationToOlist(sku, olistId);
        }
        
        renderFloorPlan(); // Atualiza a planta (e a visão de Raio-X se estiver com zoom)
        openInspector(rackId);
    }
};

window.removeItemFromList = function(rackId, levelId, itemIndex) {
    // Obsoleto, mantido apenas para prevenir erros caso haja cache de evento
};

function showEmptySelectionInspector() {
    dom.inspector.querySelector('.inspector-header h2').textContent = 'Propriedades';
    dom.inspectorContent.innerHTML = `
        <div style="display:flex; height:100%; align-items:center; justify-content:center; color:var(--text-secondary); flex-direction:column; gap:1rem; margin-top: 4rem;">
            <i class="fa-solid fa-mouse-pointer" style="font-size:3rem; opacity:0.3;"></i>
            <p style="font-size:1.1rem; font-weight:bold;">Nada Selecionado</p>
            <p style="font-size:0.85rem; text-align:center;">Clique em uma estante ou corredor no mapa<br>para visualizar ou editar suas propriedades.</p>
        </div>
    `;
    dom.inspector.classList.remove('hidden');
}

function closeInspector() {
    selectedItem = null;
    selectedItems = []; // Clear array when clicking outside
    if (isEditMode) {
        showEmptySelectionInspector();
    } else {
        dom.inspector.classList.add('hidden');
    }
    // Remove alça visual e highlight se tiver deselecionado
    document.querySelectorAll('.rack, .aisle').forEach(r => {
        r.classList.remove('is-selected');
        r.style.borderColor = 'var(--border-color)';
        r.style.boxShadow = 'var(--shadow-md)';
    });
    document.querySelectorAll('.rotate-handle').forEach(h => h.remove());
}

// === SMART GUIDES (SNAPPING) ===
const SNAP_THRESHOLD = 8; // pixels

document.addEventListener('keydown', (e) => {
    if (e.key === 'Control') isSnapEnabled = false;
});
document.addEventListener('keyup', (e) => {
    if (e.key === 'Control') isSnapEnabled = true;
});

function clearSnapGuides() {
    document.querySelectorAll('.snap-guide-vertical, .snap-guide-horizontal').forEach(el => el.remove());
}

function calculateSnapAndDrawGuides(targetId, proposedDx, proposedDy, proposedW = null, proposedH = null, resizeEdges = null) {
    clearSnapGuides();
    
    if (!isSnapEnabled) return { dx: proposedDx, dy: proposedDy, w: proposedW, h: proposedH };

    const cw = dom.canvas.offsetWidth;
    const ch = dom.canvas.offsetHeight;
    
    let movingItem = null;
    if (warehouseData.aisles.some(i => i.id === targetId)) {
        movingItem = warehouseData.aisles.find(i => i.id === targetId);
    } else {
        movingItem = warehouseData.racks.find(i => i.id === targetId);
    }
    
    if (!movingItem) return { dx: proposedDx, dy: proposedDy, w: proposedW, h: proposedH };

    const dxPct = (proposedDx / cw) * 100;
    const dyPct = (proposedDy / ch) * 100;
    
    const currX = movingItem.x + dxPct;
    const currY = movingItem.y + dyPct;
    const currW = proposedW !== null ? (proposedW / cw) * 100 : movingItem.w;
    const currH = proposedH !== null ? (proposedH / ch) * 100 : movingItem.h;
    
    const mLeft = (currX / 100) * cw;
    const mRight = ((currX + currW) / 100) * cw;
    const mCenterX = mLeft + ((currW / 100) * cw / 2);
    
    const mTop = (currY / 100) * ch;
    const mBottom = ((currY + currH) / 100) * ch;
    const mCenterY = mTop + ((currH / 100) * ch / 2);
    
    const allOthers = [...warehouseData.aisles, ...warehouseData.racks].filter(i => i.id !== targetId);
    
    let finalDx = proposedDx;
    let finalDy = proposedDy;
    let finalW = proposedW;
    let finalH = proposedH;
    
    let snappedX = false;
    let snappedY = false;

    function drawVerticalGuide(xPix) {
        const guide = document.createElement('div');
        guide.className = 'snap-guide-vertical';
        guide.style.left = `${xPix}px`;
        dom.canvas.appendChild(guide);
    }
    
    function drawHorizontalGuide(yPix) {
        const guide = document.createElement('div');
        guide.className = 'snap-guide-horizontal';
        guide.style.top = `${yPix}px`;
        dom.canvas.appendChild(guide);
    }

    let mHEdgesToTry = [];
    if (!resizeEdges || resizeEdges.left) mHEdgesToTry.push({ val: mLeft, type: 0 });
    if (!resizeEdges || resizeEdges.right) mHEdgesToTry.push({ val: mRight, type: 1 });
    if (!resizeEdges) mHEdgesToTry.push({ val: mCenterX, type: 2 });

    let mVEdgesToTry = [];
    if (!resizeEdges || resizeEdges.top) mVEdgesToTry.push({ val: mTop, type: 0 });
    if (!resizeEdges || resizeEdges.bottom) mVEdgesToTry.push({ val: mBottom, type: 1 });
    if (!resizeEdges) mVEdgesToTry.push({ val: mCenterY, type: 2 });

    for (const other of allOthers) {
        const oLeft = (other.x / 100) * cw;
        const oRight = ((other.x + other.w) / 100) * cw;
        const oCenterX = oLeft + ((other.w / 100) * cw / 2);
        
        const oTop = (other.y / 100) * ch;
        const oBottom = ((other.y + other.h) / 100) * ch;
        const oCenterY = oTop + ((other.h / 100) * ch / 2);
        
        // Removemos o limite de distância para que o snap funcione em qualquer nível de zoom
        
        if (!snappedX) {
            const hEdges = [oLeft, oRight, oCenterX];
            
            for (let oEdge of hEdges) {
                for (let i = 0; i < mHEdgesToTry.length; i++) {
                    const mEdgeObj = mHEdgesToTry[i];
                    const mEdge = mEdgeObj.val;
                    if (Math.abs(oEdge - mEdge) < SNAP_THRESHOLD) {
                        const diff = oEdge - mEdge;
                        if (proposedW === null) {
                            finalDx += diff;
                        } else {
                            if (mEdgeObj.type === 1) {
                                finalW += diff; // mudando mRight
                            } else if (mEdgeObj.type === 0) {
                                finalDx += diff; // mudando mLeft
                                finalW -= diff;  // Compensa a largura para manter o lado oposto parado
                            }
                        }
                        drawVerticalGuide(oEdge);
                        snappedX = true;
                        break;
                    }
                }
                if (snappedX) break;
            }
        }
        
        if (!snappedY) {
            const vEdges = [oTop, oBottom, oCenterY];
            
            for (let oEdge of vEdges) {
                for (let i = 0; i < mVEdgesToTry.length; i++) {
                    const mEdgeObj = mVEdgesToTry[i];
                    const mEdge = mEdgeObj.val;
                    if (Math.abs(oEdge - mEdge) < SNAP_THRESHOLD) {
                        const diff = oEdge - mEdge;
                        if (proposedH === null) {
                            finalDy += diff;
                        } else {
                            if (mEdgeObj.type === 1) {
                                finalH += diff; // mudando mBottom
                            } else if (mEdgeObj.type === 0) {
                                finalDy += diff; // mudando mTop
                                finalH -= diff;  // Compensa a altura para manter o lado oposto parado
                            }
                        }
                        drawHorizontalGuide(oEdge);
                        snappedY = true;
                        break;
                    }
                }
                if (snappedY) break;
            }
        }
        if (snappedX && snappedY) break;
    }
    
    return { dx: finalDx, dy: finalDy, w: finalW, h: finalH };
}

// === INTERACT.JS (ARRASTAR EM PORCENTAGEM) ===
function setupInteractJs() {
    interact('.interactable.is-selected')
        .draggable({
            enabled: false, 
            ignoreFrom: '.rotate-handle, .rack-lod-container',
            listeners: {
                start(event) { 
                    
                    selectedItems.forEach(si => {
                        const el = document.querySelector(`.${si.type}[data-id="${si.item.id}"]`);
                        if (el) {
                            el.classList.add('is-dragging'); 
                            el.setAttribute('data-raw-dx', el.getAttribute('data-dx') || 0);
                            el.setAttribute('data-raw-dy', el.getAttribute('data-dy') || 0);
                        }
                    });
                },
                move(event) {
                    hasMoved = true;
                    const target = event.target;
                    const type = target.dataset.type;
                    const id = target.dataset.id;
                    const list = type === 'aisle' ? warehouseData.aisles : warehouseData.racks;
                    const item = list.find(i => i.id === id);
                    const rot = item ? (item.rotation || 0) : 0;
                    
                    const rawX = (parseFloat(target.getAttribute('data-raw-dx')) || 0) + event.dx;
                    const rawY = (parseFloat(target.getAttribute('data-raw-dy')) || 0) + event.dy;
                    
                    target.setAttribute('data-raw-dx', rawX);
                    target.setAttribute('data-raw-dy', rawY);

                    const snapped = calculateSnapAndDrawGuides(id, rawX, rawY);

                    selectedItems.forEach(si => {
                        const el = document.querySelector(`.${si.type}[data-id="${si.item.id}"]`);
                        if (el) {
                            const r = si.item.rotation || 0;
                            el.style.transform = `translate(${snapped.dx}px, ${snapped.dy}px) rotate(${r}deg)`;
                            el.setAttribute('data-dx', snapped.dx);
                            el.setAttribute('data-dy', snapped.dy);
                        }
                    });
                },
                end(event) {
                    const target = event.target;
                    setTimeout(() => target.classList.remove('is-dragging'), 100);
                    
                    const cw = dom.canvas.offsetWidth;
                    const ch = dom.canvas.offsetHeight;
                    
                    selectedItems.forEach(si => {
                        const el = document.querySelector(`.${si.type}[data-id="${si.item.id}"]`);
                        if (el) {
                            el.classList.remove('is-dragging');
                            const dxPix = parseFloat(el.getAttribute('data-dx')) || 0;
                            const dyPix = parseFloat(el.getAttribute('data-dy')) || 0;
                            
                            const dxPctMulti = (dxPix / cw) * 100;
                            const dyPctMulti = (dyPix / ch) * 100;
                            
                            si.item.x += dxPctMulti;
                            si.item.y += dyPctMulti;
                            
                            el.setAttribute('data-dx', 0);
                            el.setAttribute('data-dy', 0);
                            el.setAttribute('data-raw-dx', 0);
                            el.setAttribute('data-raw-dy', 0);
                        }
                    });
                    
                    saveData();
                    clearSnapGuides();
                    renderFloorPlan(); 
                }
            }
        })
        .resizable({
            enabled: false,
            ignoreFrom: '.rotate-handle, .rack-lod-container',
            margin: 5,
            edges: { left: true, right: true, bottom: true, top: true },
            listeners: {
                start(event) { 
                    event.target.setAttribute('data-raw-dx', event.target.getAttribute('data-dx') || 0);
                    event.target.setAttribute('data-raw-dy', event.target.getAttribute('data-dy') || 0);
                    event.target.setAttribute('data-raw-w', event.rect.width);
                    event.target.setAttribute('data-raw-h', event.rect.height);
                },
                move(event) {
                    const target = event.target;
                    const cw = dom.canvas.offsetWidth;
                    const ch = dom.canvas.offsetHeight;
                    
                    const id = target.dataset.id;
                    const type = target.dataset.type;
                    const list = type === 'aisle' ? warehouseData.aisles : warehouseData.racks;
                    const item = list.find(i => i.id === id);
                    const rot = item ? (item.rotation || 0) : 0;
                    
                    const rawDx = (parseFloat(target.getAttribute('data-raw-dx')) || 0) + event.deltaRect.left;
                    const rawDy = (parseFloat(target.getAttribute('data-raw-dy')) || 0) + event.deltaRect.top;
                    const rawW = (parseFloat(target.getAttribute('data-raw-w')) || event.rect.width) + (event.rect.width - (parseFloat(target.getAttribute('data-raw-w'))||event.rect.width));
                    // The above logic for rawW/rawH just tracks the mouse. Actually interact provides event.rect which tracks the mouse directly!
                    const proposedW = event.rect.width;
                    const proposedH = event.rect.height;

                    target.setAttribute('data-raw-dx', rawDx);
                    target.setAttribute('data-raw-dy', rawDy);
                    target.setAttribute('data-raw-w', proposedW);
                    target.setAttribute('data-raw-h', proposedH);

                    const snapped = calculateSnapAndDrawGuides(id, rawDx, rawDy, proposedW, proposedH, event.edges);

                    const wPct = (snapped.w / cw) * 100;
                    const hPct = (snapped.h / ch) * 100;

                    Object.assign(target.style, {
                        width: `${wPct}%`,
                        height: `${hPct}%`
                    });
                    
                    target.style.transform = `translate(${snapped.dx}px, ${snapped.dy}px) rotate(${rot}deg)`;
                    target.setAttribute('data-dx', snapped.dx);
                    target.setAttribute('data-dy', snapped.dy);
                },
                end(event) {
                    const target = event.target;
                    const cw = dom.canvas.offsetWidth;
                    const ch = dom.canvas.offsetHeight;
                    
                    const dxPix = parseFloat(target.getAttribute('data-dx')) || 0;
                    const dyPix = parseFloat(target.getAttribute('data-dy')) || 0;
                    
                    const dxPct = (dxPix / cw) * 100;
                    const dyPct = (dyPix / ch) * 100;
                    
                    const wPct = (target.offsetWidth / cw) * 100;
                    const hPct = (target.offsetHeight / ch) * 100;

                    const id = target.dataset.id;
                    const type = target.dataset.type;
                    const list = type === 'aisle' ? warehouseData.aisles : warehouseData.racks;
                    const item = list.find(i => i.id === id);
                    
                    if (item) {
                        item.x += dxPct;
                        item.y += dyPct;
                        item.w = wPct;
                        item.h = hPct;
                    }
                    
                    saveData();
                    target.setAttribute('data-dx', 0);
                    target.setAttribute('data-dy', 0);
                    target.setAttribute('data-raw-dx', 0);
                    target.setAttribute('data-raw-dy', 0);
                    clearSnapGuides();
                    renderFloorPlan();
                }
            }
        });

    dom.btnEditMode.addEventListener('click', () => {
        interact('.interactable.is-selected').draggable({ enabled: isEditMode });
        interact('.interactable.is-selected').resizable({ enabled: isEditMode });
        interact('.rack-inspector').resizable({ enabled: isEditMode });
    });

    interact('.rack-inspector').resizable({
        enabled: false,
        edges: { left: true },
        modifiers: [
            interact.modifiers.restrictSize({
                min: { width: 350 },
                max: { width: 600 }
            })
        ],
        listeners: {
            move: function (event) {
                Object.assign(event.target.style, {
                    width: `${event.rect.width}px`
                });
            }
        }
    });
}

window.deleteSelectedItems = async function() {
    if (!isEditMode || selectedItems.length === 0) return;
    if (confirm(`Tem certeza que deseja excluir ${selectedItems.length} item(ns)? Isso apagará todo o conteúdo associado a eles.`)) {
        for (const si of selectedItems) {
            const list = si.type === 'aisle' ? warehouseData.aisles : warehouseData.racks;
            const idx = list.findIndex(i => i.id === si.item.id);
            if (idx !== -1) {
                // If it's a rack, unsync all products from Olist
                if (si.type === 'rack' && si.item.levels) {
                    for (const level of si.item.levels) {
                        if (level.items) {
                            for (const product of level.items) {
                                if (product.olistId || window.getOlistIdForSKU(product.sku)) {
                                    await window.syncLocationToOlist(product.sku, null); // Unsync logic will remove location because it's deleted
                                }
                            }
                        }
                    }
                }
                list.splice(idx, 1);
            }
        }
        selectedItems = [];
        selectedItem = null;
        closeInspector();
        saveData();
        renderFloorPlan();
    }
};

function handleKeyboardShortcuts(e) {
    if (!isEditMode) return;
    
    // Ignore se estiver digitando em um input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    // Delete
    if (e.key === 'Delete' || e.key === 'Del') {
        if (selectedItems.length > 0) {
            window.deleteSelectedItems();
        }
    }
    
    // Ctrl+C (Copiar)
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        if (selectedItems.length > 0) {
            clipboard = selectedItems.map(si => {
                // Copia profunda da estrutura básica (sem produtos)
                return {
                    type: si.type,
                    item: {
                        name: si.item.name + ' (Cópia)',
                        w: si.item.w,
                        h: si.item.h,
                        x: si.item.x,
                        y: si.item.y,
                        rotation: si.item.rotation || 0,
                        // Para racks, cria apenas 1 nível N1 vazio. Para aisles, sem níveis.
                        levels: si.type === 'rack' ? [{ id: Date.now().toString() + Math.random().toString(36).substring(2, 6), name: 'Nível 1 (Chão)', capacity: 1000, currentLoad: 0, items: [] }] : undefined
                    }
                };
            });
            console.log("Copiado!", clipboard.length, "itens");
        }
    }
    
    // Ctrl+V (Colar)
    if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        if (clipboard.length > 0) {
            // Desmarca os anteriores
            selectedItems = [];
            
            clipboard.forEach((clip, index) => {
                const newItem = JSON.parse(JSON.stringify(clip.item));
                // Gera novo ID
                newItem.id = clip.type + '-' + Date.now() + Math.random().toString(36).substring(2, 6);
                // Offset visual de 2% para baixo e direita para dar feedback visual de que colou
                newItem.x = newItem.x + 2;
                newItem.y = newItem.y + 2;
                
                if (clip.type === 'aisle') {
                    warehouseData.aisles.push(newItem);
                } else {
                    warehouseData.racks.push(newItem);
                }
                
                // Seleciona as novas coladas
                selectedItems.push({ type: clip.type, item: newItem });
            });
            
            selectedItem = selectedItems[0];
            openEditorPropertiesMulti();
            saveData();
            renderFloorPlan();
        }
    }
}

function setupEventListeners() {
    window.addEventListener('keydown', handleKeyboardShortcuts);
    dom.btnEditMode.addEventListener('click', toggleEditMode);
    dom.btnAddAisle.addEventListener('click', addAisle);
    dom.btnAddRack.addEventListener('click', addRack);
    dom.btnCloseInspector.addEventListener('click', closeInspector);
    
    if (dom.btnToggleSnap) {
        dom.btnToggleSnap.addEventListener('click', () => {
            isSnapEnabled = !isSnapEnabled;
            if (isSnapEnabled) {
                dom.btnToggleSnap.classList.add('active');
                dom.btnToggleSnap.style.borderColor = 'var(--accent-primary)';
                dom.btnToggleSnap.style.color = 'var(--accent-primary)';
                dom.btnToggleSnap.style.opacity = '1';
                dom.btnToggleSnap.innerHTML = '<i class="fa-solid fa-magnet"></i> Imã';
            } else {
                dom.btnToggleSnap.classList.remove('active');
                dom.btnToggleSnap.style.borderColor = 'transparent';
                dom.btnToggleSnap.style.color = 'var(--text-secondary)';
                dom.btnToggleSnap.style.opacity = '0.7';
                dom.btnToggleSnap.innerHTML = '<i class="fa-solid fa-magnet" style="text-decoration: line-through;"></i> Imã';
            }
        });
    }
    
    dom.canvas.addEventListener('click', (e) => {
        if (isEditMode && e.target === dom.canvas && !hasMoved) {
            closeInspector();
        }
    });
    
    dom.navFloorplan.addEventListener('click', (e) => { e.preventDefault(); switchTab('floorplan'); });
    dom.navItemlist.addEventListener('click', (e) => { e.preventDefault(); switchTab('itemlist'); });
    
    const navAuditorias = document.getElementById('nav-auditorias');
    if (navAuditorias) {
        navAuditorias.addEventListener('click', (e) => { e.preventDefault(); switchTab('auditorias'); });
    }
    
    const navSettings = document.getElementById('nav-settings');
    if (navSettings) {
        navSettings.addEventListener('click', (e) => { e.preventDefault(); switchTab('settings'); });
    }
}

// Navegação de Telas
function switchTab(tab) {
    const navSettings = document.getElementById('nav-settings');
    const settingsContainer = document.getElementById('settings-container');
    const navAuditorias = document.getElementById('nav-auditorias');
    const auditoriasContainer = document.getElementById('auditorias-container');

    // Desmarca todos
    dom.navFloorplan.parentElement.classList.remove('active');
    dom.navItemlist.parentElement.classList.remove('active');
    if (navSettings) navSettings.parentElement.classList.remove('active');
    if (navAuditorias) navAuditorias.parentElement.classList.remove('active');
    
    // Esconde todos
    dom.containerFloorplan.classList.add('hidden');
    dom.containerItemlist.classList.add('hidden');
    if (settingsContainer) settingsContainer.classList.add('hidden');
    if (auditoriasContainer) auditoriasContainer.classList.add('hidden');
    dom.floorplanActions.classList.add('hidden');
    
    if (tab === 'floorplan') {
        dom.navFloorplan.parentElement.classList.add('active');
        dom.containerFloorplan.classList.remove('hidden');
        dom.floorplanActions.classList.remove('hidden');
        dom.pageTitle.textContent = 'Planta Baixa';
        dom.pageSubtitle.textContent = 'Gerencie o layout e os níveis do seu armazém';
        renderFloorPlan();
    } else if (tab === 'itemlist') {
        dom.navItemlist.parentElement.classList.add('active');
        dom.containerItemlist.classList.remove('hidden');
        dom.pageTitle.textContent = 'Lista de Itens';
        dom.pageSubtitle.textContent = 'Visão geral de todos os SKUs armazenados';
        renderItemList();
        closeInspector();
    } else if (tab === 'auditorias') {
        if (navAuditorias) navAuditorias.parentElement.classList.add('active');
        if (auditoriasContainer) auditoriasContainer.classList.remove('hidden');
        dom.pageTitle.textContent = 'Histórico de Contagens';
        dom.pageSubtitle.textContent = 'Auditorias realizadas por funcionários via QR Code';
        window.renderAuditoriasList();
        closeInspector();
    } else if (tab === 'settings') {
        if (navSettings) navSettings.parentElement.classList.add('active');
        if (settingsContainer) settingsContainer.classList.remove('hidden');
        dom.pageTitle.textContent = 'Configurações';
        dom.pageSubtitle.textContent = 'Ajustes visuais e gerenciamento de backups';
        closeInspector();
    }
}

window.renderAuditoriasList = async function() {
    const listEl = document.getElementById('auditorias-list');
    if (!listEl) return;
    
    listEl.innerHTML = '<div style="text-align:center; padding: 2rem; color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div>';
    
    try {
        const { data, error } = await supabaseApp.from('contagens_inventario').select('*').order('data_contagem', { ascending: false });
        if (error) throw error;
        
        if (!data || data.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding: 2rem; color:var(--text-secondary); background: var(--bg-surface-elevated); border-radius: 8px; border: 1px dashed var(--border-color);">Nenhuma auditoria realizada ainda.</div>';
            return;
        }
        
        listEl.innerHTML = data.map(audit => {
            const dataFormatada = new Date(audit.data_contagem).toLocaleString('pt-BR');
            
            // Buscar o nome do corredor
            let corridorName = '';
            if (warehouseData.racks) {
                const foundRack = warehouseData.racks.find(r => r.id === audit.rack_id);
                if (foundRack) {
                    const aisle = window.findParentAisleForRack ? window.findParentAisleForRack(foundRack) : null;
                    if (aisle) corridorName = aisle.name;
                }
            }
            const rackTitle = corridorName ? `${corridorName} > ${audit.rack_nome}` : audit.rack_nome;
            
            let itensHtml = '';
            
            // Render items
            if (audit.itens_contados && Array.isArray(audit.itens_contados)) {
                itensHtml = audit.itens_contados.map(it => `
                    <div style="display:flex; justify-content:space-between; font-size: 0.85rem; padding: 0.25rem 0; border-bottom: 1px solid var(--border-color);">
                        <span>${it.sku} ${it.name ? `- ${it.name}` : ''}</span>
                        <span style="font-weight:bold;">Qtd: ${it.quantidade}</span>
                    </div>
                `).join('');
            }
            
            // Render novos
            let novosHtml = '';
            if (audit.produtos_adicionados && Array.isArray(audit.produtos_adicionados) && audit.produtos_adicionados.length > 0) {
                novosHtml = `
                    <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--accent-success); border-radius: 4px;">
                        <div style="color: var(--accent-success); font-weight: bold; font-size: 0.85rem; margin-bottom: 0.5rem;"><i class="fa-solid fa-plus-circle"></i> Produtos Novos Encontrados:</div>
                        ${audit.produtos_adicionados.map(it => {
                            let levelName = 'Nível Desconhecido';
                            if (foundRack && foundRack.levels) {
                                const lvl = foundRack.levels.find(l => l.id === it.levelId);
                                if (lvl) levelName = lvl.name;
                            }
                            return `
                            <div style="font-size: 0.85rem; display: flex; justify-content: space-between;">
                                <span>${it.sku} <span style="color:var(--text-secondary)">(${levelName})</span></span>
                                <span>Qtd: ${it.quantidade}</span>
                            </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }
            
            return `
                <div class="auditoria-card" style="position: relative;">
                    <button class="btn-small" onclick="window.deleteAuditoria('${audit.id}')" style="position: absolute; top: 1rem; right: 1rem; background: var(--bg-surface-elevated); color: var(--accent-danger); border: 1px solid var(--border-color); cursor: pointer; border-radius: 4px;" title="Excluir Auditoria">
                        <i class="fa-solid fa-trash"></i> Excluir
                    </button>
                    <div class="auditoria-card-header" style="margin-top: 1.5rem;">
                        <div>
                            <h3 style="margin: 0 0 0.5rem 0; color: var(--text-primary);"><i class="fa-solid fa-server" style="color:var(--text-secondary)"></i> ${rackTitle}</h3>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);"><i class="fa-regular fa-clock"></i> ${dataFormatada}</div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;"><i class="fa-solid fa-user"></i> ${audit.funcionario}</div>
                        </div>
                        <img src="${audit.assinatura}" class="auditoria-signature-img" alt="Assinatura de ${audit.funcionario}">
                    </div>
                    <div>
                        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem;">Itens Contados:</h4>
                        <div style="max-height: 150px; overflow-y: auto; padding-right: 0.5rem;">
                            ${itensHtml || '<div style="font-size: 0.85rem; color: var(--text-secondary);">Nenhum item contato.</div>'}
                        </div>
                        ${novosHtml}
                        ${audit.observacao ? `
                            <div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg-base); border-left: 3px solid var(--accent-warning); border-radius: 0 4px 4px 0; font-size: 0.85rem;">
                                <strong>Obs:</strong> ${audit.observacao}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch(err) {
        console.error("Erro ao carregar auditorias:", err);
        listEl.innerHTML = '<div style="text-align:center; padding: 2rem; color:var(--accent-danger);">Erro ao carregar auditorias.</div>';
    }
};

window.deleteAuditoria = async function(auditId) {
    if (!confirm('Tem certeza que deseja excluir esta contagem do histórico?')) return;
    try {
        const { error } = await supabaseApp.from('contagens_inventario').delete().eq('id', auditId);
        if (error) throw error;
        
        window.renderAuditoriasList();
    } catch(err) {
        console.error("Erro ao excluir auditoria:", err);
        alert('Falha ao excluir a auditoria do banco de dados.');
    }
};

// Renderizar Tabela de Itens (Agrupada por SKU)
function renderItemList(filterText = '') {
    const tbody = document.getElementById('item-list-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const lowerFilter = filterText.toLowerCase();
    const skuMap = {}; 
    
    warehouseData.racks.forEach(rack => {
        const parentAisle = findParentAisleForRack(rack);
        const aisleName = parentAisle ? parentAisle.name : 'Sem Corredor';
        
        rack.levels.forEach(level => {
            if (!level.items) return;
            level.items.forEach((item, itemIndex) => {
                if (!skuMap[item.sku]) {
                    skuMap[item.sku] = { name: item.name, olistId: item.olistId, placements: [], totalQty: 0 };
                }
                const qty = item.qty !== undefined && item.qty !== null ? Number(item.qty) : 1;
                skuMap[item.sku].totalQty += qty;
                
                skuMap[item.sku].placements.push({
                    corridor: aisleName, rackId: rack.id, rackName: rack.name,
                    levelId: level.id, levelName: level.name, itemIndex: itemIndex, qty: qty
                });
            });
        });
    });

    let hasItems = false;
    Object.keys(skuMap).forEach(sku => {
        const itemData = skuMap[sku];
        const locationStr = window.calculateOlistLocationString(sku);
        
        if (lowerFilter) {
            const matchSKU = sku.toLowerCase().includes(lowerFilter);
            const matchName = itemData.name.toLowerCase().includes(lowerFilter);
            const matchLoc = locationStr.toLowerCase().includes(lowerFilter);
            if (!matchSKU && !matchName && !matchLoc) return;
        }

        hasItems = true;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 1rem; border-bottom: 1px solid var(--border-color);"><strong>${sku}</strong></td>
            <td style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
                ${itemData.name}
                <button class="btn-small" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; margin-left: 0.5rem;" onclick="window.editSKUName('${sku}', '${itemData.name.replace(/'/g, "\\'")}')" title="Editar Título Local">
                    <i class="fa-solid fa-pen"></i>
                </button>
            </td>
            <td style="padding: 1rem; border-bottom: 1px solid var(--border-color); font-weight: bold;" id="estoque-col-${sku}">
                <i class="fa-solid fa-spinner fa-spin" style="color: var(--text-secondary)"></i>
            </td>
            <td style="padding: 1rem; border-bottom: 1px solid var(--border-color); font-weight: bold; color: var(--accent-primary);">
                ${itemData.totalQty}
            </td>
            <td style="padding: 1rem; border-bottom: 1px solid var(--border-color); color: var(--accent-success); font-weight: 500;">${locationStr || 'Sem Localização'}</td>
            <td style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
                <button class="btn btn-primary btn-small" onclick="window.locateSKU('${sku}')">
                    <i class="fa-solid fa-location-crosshairs"></i> Localizar
                </button>
                <button class="btn btn-secondary btn-small" onclick="window.openDeletePopup('${sku}')" style="color: var(--accent-danger)">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (!hasItems) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Nenhum item encontrado.</td></tr>';
    } else {
        // Fetch stock for all items
        const allSkus = Object.keys(skuMap);
        fetch(`${API_BASE_URL}/api/produtos/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus: allSkus })
        })
        .then(res => res.json())
        .then(data => {
            if (data.itens && data.itens.length > 0) {
                data.itens.forEach(produto => {
                    const el = document.getElementById(`estoque-col-${produto.sku}`);
                    if (el) {
                        // O novo backend retorna o saldo_real consultado em tempo real
                        let saldo = '0';
                        if (produto.saldo_real !== undefined) saldo = produto.saldo_real;
                        else if (produto.estoque && produto.estoque.saldo !== undefined) saldo = produto.estoque.saldo;
                        else if (produto.saldo !== undefined) saldo = produto.saldo;
                        
                        el.innerText = saldo;
                        if (Number(saldo) === 0) {
                            el.style.color = 'var(--accent-danger)';
                        } else {
                            el.style.color = 'var(--text-primary)';
                        }
                    }
                });
            }
            // Para skus que não vieram, setar N/A
            allSkus.forEach(sku => {
                const el = document.getElementById(`estoque-col-${sku}`);
                if (el && el.innerHTML.includes('fa-spinner')) {
                    el.innerText = 'N/A';
                    el.style.color = 'var(--text-secondary)';
                }
            });
        })
        .catch(err => {
            console.error('Erro ao buscar estoque:', err);
            allSkus.forEach(sku => {
                const el = document.getElementById(`estoque-col-${sku}`);
                if (el) el.innerText = 'Erro';
            });
        });
    }
}

// Ligar o campo de busca
document.addEventListener('DOMContentLoaded', () => {
    const itemSearchInput = document.getElementById('item-search-input');
    if (itemSearchInput) {
        itemSearchInput.addEventListener('input', (e) => {
            renderItemList(e.target.value);
        });
    }
});

// Localizar Estante
window.locateRack = function(rackId) {
    switchTab('floorplan');
    
    setTimeout(() => {
        const rackEl = document.querySelector(`.rack[data-id="${rackId}"]`);
        if (rackEl) {
            // Panning suave
            const container = dom.containerFloorplan;
            const cRect = container.getBoundingClientRect();
            const rRect = rackEl.getBoundingClientRect();
            
            const rackCenterX = rRect.left + rRect.width / 2;
            const rackCenterY = rRect.top + rRect.height / 2;
            
            const viewportCenterX = cRect.left + cRect.width / 2;
            const viewportCenterY = cRect.top + cRect.height / 2;
            
            // Injeta a diferença diretamente no Pan
            panX += (viewportCenterX - rackCenterX);
            panY += (viewportCenterY - rackCenterY);
            
            dom.canvas.style.transition = 'transform 0.4s ease-out';
            updateCanvasTransform();
            
            setTimeout(() => {
                dom.canvas.style.transition = 'none'; // remove transição para não atrasar o drag normal
            }, 400);
            
            // Piscar
            rackEl.classList.add('blink-red');
            setTimeout(() => {
                rackEl.classList.remove('blink-red');
            }, 3000);
        }
    }, 100);
};

// === PANNING (PRANCHETA INFINITA) E ZOOM ===
let isPanning = false;
let hasMoved = false; // Diferencia clique de drag
let startMouseX, startMouseY, initialPanX, initialPanY;

dom.containerFloorplan.addEventListener('mousedown', (e) => {
    hasMoved = false;
    
    // No modo edição, apenas elementos JÁ SELECIONADOS ou a alça de rotação impedem o pan (para poderem ser arrastados).
    if (isEditMode && e.button !== 1) {
        if (e.target.closest('.rack.is-selected, .aisle.is-selected, .rotate-handle')) {
            return;
        }
    }
    
    isPanning = true;
    
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    initialPanX = panX;
    initialPanY = panY;
    
    dom.containerFloorplan.style.cursor = 'grabbing';
    dom.canvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    
    const dx = e.clientX - startMouseX;
    const dy = e.clientY - startMouseY;
    
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
    }
    
    panX = initialPanX + dx;
    panY = initialPanY + dy;
    
    updateCanvasTransform();
});

dom.containerFloorplan.addEventListener('mouseleave', () => {
    isPanning = false;
    dom.containerFloorplan.style.cursor = 'grab';
    dom.canvas.style.cursor = 'grab';
});

window.addEventListener('mouseup', () => {
    isPanning = false;
    dom.containerFloorplan.style.cursor = 'grab';
    dom.canvas.style.cursor = 'grab';
});

dom.containerFloorplan.addEventListener('wheel', (e) => {
    if (e.ctrlKey || dom.containerFloorplan.classList.contains('hidden')) return;
    e.preventDefault(); 
    
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    window.changeZoom(delta, e.clientX, e.clientY);
}, { passive: false });

// Deselecionar e fechar inspetor ao clicar no fundo ou clicar e arrastar (pan)
dom.containerFloorplan.addEventListener('click', (e) => {
    if ((e.target === dom.canvas || e.target === dom.containerFloorplan || e.target.closest('.rack:not(.is-selected), .aisle:not(.is-selected)')) && !hasMoved) {
        // Se clicar no fundo ou num item vazio para focar, mas não mover.
        // No modo edição, clicando num item não-selecionado, o click listener do próprio item vai ativar a seleção dele.
        // Então não queremos fechar a seleção globalmente se o clique for num elemento interactable.
        if (e.target === dom.canvas || e.target === dom.containerFloorplan) {
            closeInspector();
        }
    }
});

// Cursor padrão inicial
dom.containerFloorplan.style.cursor = 'grab';
dom.canvas.style.cursor = 'grab';

// === SISTEMA DE LOGIN E INICIALIZAÇÃO ===
document.addEventListener('DOMContentLoaded', () => {
    const lockOverlay = document.getElementById('password-lock-overlay');
    const inputPass = document.getElementById('login-password-input');
    const btnLogin = document.getElementById('btn-login-submit');
    const errorMsg = document.getElementById('login-error-msg');
    
    // Verifica auditoria na URL
    const urlParams = new URLSearchParams(window.location.search);
    const rackIdAudit = urlParams.get('auditoria');
    
    if (rackIdAudit) {
        document.getElementById('login-title').textContent = "Auditoria de Estoque";
        document.getElementById('login-subtitle').textContent = "Identifique-se e insira a senha para contar a estante.";
        document.getElementById('login-funcionario-group').classList.remove('hidden');
    }

    const tryLogin = async () => {
        const val = inputPass.value;
        if (!val) return;
        
        btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
        btnLogin.disabled = true;
        errorMsg.classList.add('hidden');
        
        try {
            // Chama a função RPC segura no banco de dados para verificar o hash
            const { data, error } = await supabaseApp.rpc('verify_password', { input_password: val });
            
            if (error) throw error;
            
            if (data === true) {
                // Senha Correta
                
                if (rackIdAudit) {
                    const funcName = document.getElementById('login-funcionario-input').value.trim();
                    if (!funcName) {
                        alert("Por favor, digite seu nome de funcionário.");
                        btnLogin.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Acessar';
                        btnLogin.disabled = false;
                        return;
                    }
                    window.auditWorkerName = funcName;
                    sessionStorage.setItem('estoquepro_audit_worker', funcName);
                    sessionStorage.setItem('estoquepro_auth', 'true');
                    lockOverlay.remove();
                    document.body.classList.add('mobile-audit-active');
                    init().then(() => window.startMobileAudit(rackIdAudit));
                } else {
                    sessionStorage.setItem('estoquepro_auth', 'true');
                    lockOverlay.remove();
                    init(); // Inicia o sistema
                }
            } else {
                // Senha Incorreta
                errorMsg.classList.remove('hidden');
                inputPass.value = '';
                inputPass.focus();
            }
        } catch(err) {
            console.error("Erro na verificação de senha:", err);
            errorMsg.innerText = "Erro ao conectar com o banco de dados.";
            errorMsg.classList.remove('hidden');
        }
        
        btnLogin.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Acessar';
        btnLogin.disabled = false;
    };
    
    btnLogin.addEventListener('click', tryLogin);
    inputPass.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') tryLogin();
    });

    // Verifica se já está logado na sessão atual do navegador
    if (sessionStorage.getItem('estoquepro_auth') === 'true') {
        if (rackIdAudit) {
            const funcName = sessionStorage.getItem('estoquepro_audit_worker');
            if (funcName) {
                lockOverlay.remove();
                window.auditWorkerName = funcName;
                document.body.classList.add('mobile-audit-active');
                init().then(() => window.startMobileAudit(rackIdAudit));
            } else {
                // Sessão logada, mas sem nome do funcionário, forçamos o login de novo
                sessionStorage.removeItem('estoquepro_auth');
                lockOverlay.classList.remove('hidden');
            }
        } else {
            lockOverlay.remove();
            init();
        }
    } else {
        // Exibe a tela de login
        lockOverlay.classList.remove('hidden');
    }
});

// === INTEGRAÇÃO OLIST (Algoritmo de Agrupamento) ===

window.getOlistIdForSKU = function(sku) {
    for (let r of warehouseData.racks) {
        for (let l of r.levels) {
            if (l.items) {
                for (let i of l.items) {
                    if (i.sku === sku && i.olistId) return i.olistId;
                }
            }
        }
    }
    return null;
};

window.calculateOlistLocationString = function(sku, simulatedPlacement = null) {
    const placements = [];
    
    warehouseData.racks.forEach(rack => {
        const parentAisle = findParentAisleForRack(rack);
        const corredorNome = parentAisle ? parentAisle.name : 'Sem Corredor';
        
        rack.levels.forEach(level => {
            if (level.items) {
                level.items.forEach((item) => {
                    if (item.sku === sku) {
                        placements.push({ corridor: corredorNome, rack: rack.name, level: level.name });
                    }
                });
            }
        });
    });

    if (simulatedPlacement) {
        placements.push(simulatedPlacement);
    }

    if (placements.length === 0) return "";

    const byCorridor = {};
    placements.forEach(p => {
        if (!byCorridor[p.corridor]) byCorridor[p.corridor] = [];
        byCorridor[p.corridor].push(p);
    });

    const corridorStrings = [];
    const sortedCorridors = Object.keys(byCorridor).sort();

    sortedCorridors.forEach(cName => {
        const cPlacements = byCorridor[cName];
        
        const levelsToRacks = {};
        cPlacements.forEach(p => {
            if (!levelsToRacks[p.level]) levelsToRacks[p.level] = new Set();
            levelsToRacks[p.level].add(p.rack);
        });

        const rackGroupToLevels = {};
        Object.keys(levelsToRacks).forEach(level => {
            const rackSet = levelsToRacks[level];
            const sortedRacks = Array.from(rackSet).sort();
            const rackKey = sortedRacks.join(''); 
            
            if (!rackGroupToLevels[rackKey]) rackGroupToLevels[rackKey] = [];
            rackGroupToLevels[rackKey].push(level);
        });

        const groupStrings = [];
        Object.keys(rackGroupToLevels).sort().forEach(rackKey => {
            const levels = rackGroupToLevels[rackKey];
            const sortedLevels = levels.sort().join('');
            groupStrings.push(`${rackKey}_${sortedLevels}`);
        });

        const joinedGroups = groupStrings.join('+');
        corridorStrings.push(`${cName}_${joinedGroups}`);
    });

    return corridorStrings.join('+');
};

window.syncLocationToOlist = async function(sku, olistId) {
    if (!olistId) return;
    const newLocation = window.calculateOlistLocationString(sku);
    try {
        console.log(`[Olist Sync] Atualizando ${sku} para: "${newLocation}"`);
        const response = await fetch(`${API_BASE_URL}/api/produtos/${olistId}/localizacao`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ localizacao: newLocation })
        });
        if (!response.ok) throw new Error('Falha na API Olist');
    } catch (err) {
        console.error(err);
    }
};

window.locateSKU = function(sku) {
    switchTab('floorplan');
    setTimeout(() => {
        const racksToBlink = [];
        let sumX = 0, sumY = 0;
        
        warehouseData.racks.forEach(r => {
            let hasIt = false;
            r.levels.forEach(l => {
                if(l.items && l.items.some(i => i.sku === sku)) hasIt = true;
            });
            if (hasIt) {
                const el = document.querySelector(`.rack[data-id="${r.id}"]`);
                if (el) racksToBlink.push(el);
            }
        });

        if (racksToBlink.length > 0) {
            racksToBlink.forEach(rackEl => {
                const rRect = rackEl.getBoundingClientRect();
                sumX += rRect.left + rRect.width / 2;
                sumY += rRect.top + rRect.height / 2;
                
                rackEl.classList.add('blink-red');
                setTimeout(() => rackEl.classList.remove('blink-red'), 3000);
            });
            
            const avgX = sumX / racksToBlink.length;
            const avgY = sumY / racksToBlink.length;
            
            const container = dom.containerFloorplan;
            const cRect = container.getBoundingClientRect();
            const viewportCenterX = cRect.left + cRect.width / 2;
            const viewportCenterY = cRect.top + cRect.height / 2;
            
            panX += (viewportCenterX - avgX);
            panY += (viewportCenterY - avgY);
            
            dom.canvas.style.transition = 'transform 0.4s ease-out';
            updateCanvasTransform();
            setTimeout(() => dom.canvas.style.transition = 'none', 400);
        }
    }, 100);
};

window.openDeletePopup = function(sku) {
    const placements = [];
    warehouseData.racks.forEach(rack => {
        const parentAisle = findParentAisleForRack(rack);
        rack.levels.forEach(level => {
            if (level.items) {
                level.items.forEach((item, index) => {
                    if (item.sku === sku) {
                        placements.push({
                            rackId: rack.id, levelId: level.id, index: index,
                            desc: `${parentAisle ? parentAisle.name : 'Sem Corredor'} > ${rack.name} > ${level.name}`
                        });
                    }
                });
            }
        });
    });

    const olistId = window.getOlistIdForSKU(sku);
    const overlay = document.createElement('div');
    overlay.className = 'delete-popup-overlay';
    overlay.style = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(3px);';
    
    let html = `
        <div style="background:var(--bg-surface); padding:2rem; border-radius:8px; width:400px; max-width:90%; border:1px solid var(--border-color); box-shadow:var(--shadow-lg);">
            <h3 style="margin-bottom:1rem; color:var(--text-primary);">Excluir SKU: ${sku}</h3>
            <p style="margin-bottom:1rem; font-size:0.875rem; color:var(--text-secondary);">Selecione os locais de onde deseja remover este produto:</p>
            <div style="max-height:200px; overflow-y:auto; margin-bottom:1.5rem; border:1px solid var(--border-color); border-radius:4px; padding:0.5rem; background:var(--bg-base);">
    `;
    
    placements.forEach((p, i) => {
        html += `
            <label style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem; cursor:pointer; border-bottom:1px solid var(--border-color);">
                <input type="checkbox" class="delete-checkbox" value="${i}" checked>
                <span style="font-size:0.875rem;">${p.desc}</span>
            </label>
        `;
    });
    
    html += `
            </div>
            <div style="display:flex; gap:1rem;">
                <button class="btn btn-primary" id="btn-confirm-delete" style="flex:1; background:var(--accent-danger); border:none;">Excluir Selecionados</button>
                <button class="btn btn-secondary" id="btn-cancel-delete" style="flex:1; border:none;">Cancelar</button>
            </div>
        </div>
    `;
    
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById('btn-cancel-delete').addEventListener('click', () => {
        overlay.remove();
    });

    document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
        const checkboxes = overlay.querySelectorAll('.delete-checkbox');
        const toDeleteIndices = Array.from(checkboxes).filter(c => c.checked).map(c => parseInt(c.value));
        
        if (toDeleteIndices.length === 0) {
            alert('Selecione pelo menos um local.');
            return;
        }

        const btnConf = document.getElementById('btn-confirm-delete');
        btnConf.innerHTML = 'Excluindo...';
        btnConf.disabled = true;

        const itemsToDelete = toDeleteIndices.map(i => placements[i]);
        itemsToDelete.sort((a, b) => b.index - a.index); 

        itemsToDelete.forEach(p => {
            const rack = warehouseData.racks.find(r => r.id === p.rackId);
            const level = rack.levels.find(l => l.id === p.levelId);
            level.items.splice(p.index, 1);
        });

        saveData();

        if (olistId) {
            await window.syncLocationToOlist(sku, olistId);
        }
        
        overlay.remove();
        renderItemList(); 
    });
};

window.getLocalNameForSKU = function(sku) {
    for (let r of warehouseData.racks) {
        for (let l of r.levels) {
            if (l.items) {
                for (let i of l.items) {
                    if (i.sku === sku) return i.name;
                }
            }
        }
    }
    return null;
};

window.editSKUName = function(sku, oldName) {
    const newName = prompt(`Editar nome local para o SKU: ${sku}`, oldName);
    if (newName && newName.trim() !== '' && newName !== oldName) {
        warehouseData.racks.forEach(r => {
            r.levels.forEach(l => {
                if (l.items) {
                    l.items.forEach(i => {
                        if (i.sku === sku) {
                            i.name = newName.trim();
                        }
                    });
                }
            });
        });
        saveData();
        renderItemList();
        
        // Atualiza o inspetor se estiver aberto num rack que contém esse item
        if (selectedItem && selectedItem.dataset.id) {
            openInspector(selectedItem.dataset.id);
        }
    }
};

window.syncOlistForStructuralChange = async function(elementId, type) {
    const skusToUpdate = new Map(); 
    
    warehouseData.racks.forEach(rack => {
        let isAffected = false;
        
        if (type === 'aisle') {
            const parentAisle = findParentAisleForRack(rack);
            if (parentAisle && parentAisle.id === elementId) isAffected = true;
        } else if (type === 'rack') {
            if (rack.id === elementId) isAffected = true;
        }
        
        rack.levels.forEach(level => {
            const levelAffected = (type === 'level') ? (level.id === elementId) : isAffected;
            
            if (levelAffected && level.items) {
                level.items.forEach(item => {
                    const olistId = item.olistId || window.getOlistIdForSKU(item.sku);
                    if (olistId) {
                        skusToUpdate.set(item.sku, olistId);
                    }
                });
            }
        });
    });

    const skusArray = Array.from(skusToUpdate.entries());
    const total = skusArray.length;
    
    if (total === 0) return;

    const overlay = document.createElement('div');
    overlay.className = 'bulk-sync-overlay';
    overlay.innerHTML = `
        <div class="bulk-sync-card">
            <div class="bulk-sync-spinner"></div>
            <div class="bulk-sync-title">Sincronizando com Olist...</div>
            <div class="bulk-sync-progress" id="bulk-sync-text">Preparando ${total} produtos...</div>
        </div>
    `;
    document.body.appendChild(overlay);

    const progressText = document.getElementById('bulk-sync-text');
    
    for (let i = 0; i < total; i++) {
        const [sku, olistId] = skusArray[i];
        progressText.innerText = `Atualizando produto ${i + 1} de ${total} (${sku})...`;
        await window.syncLocationToOlist(sku, olistId);
    }

    progressText.innerText = "Sincronização concluída!";
    const spinner = overlay.querySelector('.bulk-sync-spinner');
    if (spinner) {
        spinner.style.animation = 'none';
        spinner.style.borderColor = 'var(--accent-success)';
    }
    
    setTimeout(() => {
        overlay.remove();
        renderItemList();
    }, 1500);
};

// === LOGIC FOR SETTINGS & THEMES ===
(function() {
    const savedTheme = localStorage.getItem('estoquepro_theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    // Tema
    const btnToggleTheme = document.getElementById('btn-toggle-theme');
    if (btnToggleTheme) {
        if (document.body.classList.contains('light-mode')) {
            btnToggleTheme.innerHTML = '<i class="fa-solid fa-moon"></i> Ativar Modo Escuro';
        }
        
        btnToggleTheme.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('estoquepro_theme', isLight ? 'light' : 'dark');
            
            if (isLight) {
                btnToggleTheme.innerHTML = '<i class="fa-solid fa-moon"></i> Ativar Modo Escuro';
            } else {
                btnToggleTheme.innerHTML = '<i class="fa-solid fa-sun"></i> Ativar Modo Claro';
            }
        });
    }

    // Export Backup
    const btnExport = document.getElementById('btn-export-backup');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(warehouseData));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "armazem_backup_" + new Date().getTime() + ".json");
            document.body.appendChild(downloadAnchorNode); 
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });
    }

    // Import Backup
    const uploadBackup = document.getElementById('upload-backup');
    if (uploadBackup) {
        uploadBackup.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (importedData.racks && importedData.aisles) {
                        warehouseData = importedData;
                        saveData();
                        alert('Backup importado com sucesso!');
                        location.reload();
                    } else {
                        alert('Arquivo JSON inválido para o EstoquePro.');
                    }
                } catch(err) {
                    alert('Erro ao ler arquivo JSON.');
                }
            };
            reader.readAsText(file);
        });
    }

    // === OAUTH CONFIG LOGIC ===
    const spanRedirect = document.getElementById('oauth-redirect-uri');
    const inputClientId = document.getElementById('oauth-client-id');
    const inputClientSecret = document.getElementById('oauth-client-secret');
    const btnOAuthEdit = document.getElementById('btn-oauth-edit');
    const btnOAuthSave = document.getElementById('btn-oauth-save');

    if (spanRedirect) {
        // A URL de callback precisa apontar para o servidor Node.js
        const finalRedirectUri = `${API_BASE_URL}/callback`;
        spanRedirect.innerText = finalRedirectUri;

        // Buscar config inicial
        inputClientId.value = 'Carregando do servidor...';
        inputClientSecret.type = 'text'; // Show text temporarily
        inputClientSecret.value = 'Aguarde...';
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        fetch(`${API_BASE_URL}/api/config`, { signal: controller.signal })
            .then(res => {
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error('Servidor indisponível');
                return res.json();
            })
            .then(data => {
                inputClientSecret.type = 'password'; // Revert back
                inputClientId.value = data.client_id || '';
                inputClientSecret.value = data.client_secret || '';
            })
            .catch(err => {
                console.log('Erro ao buscar config do OAuth', err);
                inputClientId.value = 'Erro de Conexão (Servidor Render Dormindo?)';
                inputClientSecret.type = 'text';
                inputClientSecret.value = 'Dê um F5 na página em 1 minuto para acordá-lo...';
            });

        // Lógica de Editar
        btnOAuthEdit.addEventListener('click', () => {
            inputClientId.removeAttribute('readonly');
            inputClientSecret.removeAttribute('readonly');
            
            inputClientId.style.opacity = '1';
            inputClientSecret.style.opacity = '1';
            
            btnOAuthSave.removeAttribute('disabled');
            btnOAuthSave.style.opacity = '1';
            btnOAuthSave.style.cursor = 'pointer';
        });

        // Lógica de Salvar
        btnOAuthSave.addEventListener('click', async () => {
            btnOAuthSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
            
            try {
                const res = await fetch(`${API_BASE_URL}/api/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        redirect_uri: finalRedirectUri,
                        client_id: inputClientId.value.trim(),
                        client_secret: inputClientSecret.value.trim()
                    })
                });

                if (res.ok) {
                    alert('Credenciais salvas com sucesso!');
                    // Travar novamente
                    inputClientId.setAttribute('readonly', 'true');
                    inputClientSecret.setAttribute('readonly', 'true');
                    
                    inputClientId.style.opacity = '0.7';
                    inputClientSecret.style.opacity = '0.7';
                    
                    btnOAuthSave.setAttribute('disabled', 'true');
                    btnOAuthSave.style.opacity = '0.5';
                    btnOAuthSave.style.cursor = 'not-allowed';
                } else {
                    alert('Erro ao salvar as credenciais no servidor.');
                }
            } catch(e) {
                alert('Erro de comunicação com o servidor local.');
            }
            btnOAuthSave.innerHTML = '<i class="fa-solid fa-save"></i> Salvar Credenciais';
        });

        const btnOAuthConnect = document.getElementById('btn-oauth-connect');
        const oauthOverlay = document.getElementById('oauth-loading-overlay');
        const oauthProgress = document.getElementById('oauth-loading-progress');
        const oauthTitle = document.getElementById('oauth-loading-title');
        const oauthSubtitle = document.getElementById('oauth-loading-subtitle');
        
        let fakeProgressInterval;

        btnOAuthConnect.addEventListener('click', () => {
            const clientId = inputClientId.value.trim();
            const redirectUri = finalRedirectUri;
            
            if (!clientId || !inputClientSecret.value.trim()) {
                alert('Preencha o Client ID e Client Secret antes de conectar.');
                return;
            }

            // Subir Overlay
            oauthOverlay.classList.remove('hidden');
            oauthTitle.innerText = 'Aguardando Autorização...';
            oauthSubtitle.innerText = 'Siga as instruções na janela pop-up do Tiny.';
            oauthProgress.innerText = '0%';
            
            let percent = 0;
            fakeProgressInterval = setInterval(() => {
                if (percent < 85) {
                    percent += Math.floor(Math.random() * 3) + 1;
                    if (percent > 85) percent = 85;
                    oauthProgress.innerText = percent + '%';
                }
            }, 800);

            // Abrir Popup
            const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid&response_type=code`;
            const popup = window.open(authUrl, 'TinyAuth', 'width=600,height=700,status=yes,scrollbars=yes');

            if (!popup) {
                clearInterval(fakeProgressInterval);
                oauthOverlay.classList.add('hidden');
                alert('O Pop-up foi bloqueado pelo navegador. Por favor, permita pop-ups para este site.');
            }
        });

        // Ouvir mensagem de sucesso do popup
        window.addEventListener('message', (event) => {
            if (event.data === 'oauth_success') {
                clearInterval(fakeProgressInterval);
                oauthProgress.innerText = '100%';
                oauthTitle.innerText = 'Autenticação Concluída!';
                oauthSubtitle.innerText = 'Credenciais prontas. Sincronizando...';
                
                setTimeout(() => {
                    oauthOverlay.classList.add('hidden');
                    checkOlistConnection(); 
                }, 1500);
            } else if (event.data === 'oauth_error') {
                clearInterval(fakeProgressInterval);
                oauthProgress.innerText = 'Erro';
                oauthTitle.innerText = 'Falha na Autenticação';
                oauthSubtitle.innerText = 'Não foi possível autorizar o aplicativo.';
                setTimeout(() => oauthOverlay.classList.add('hidden'), 3000);
            }
        });
    }

    // Olist Connection Status Polling
    async function checkOlistConnection() {
        const dot = document.getElementById('olist-status-dot');
        const text = document.getElementById('olist-status-text');
        if (!dot || !text) return;
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/status`);
            if (!res.ok) throw new Error('Not OK');
            const data = await res.json();
            
            if (data.conectado) {
                dot.style.backgroundColor = 'var(--accent-success)';
                text.innerText = 'Conectado ao Olist';
                text.style.color = 'var(--accent-success)';
            } else {
                dot.style.backgroundColor = 'var(--accent-warning)';
                text.innerText = 'Autenticação Pendente';
                text.style.color = 'var(--accent-warning)';
            }
        } catch(e) {
            dot.style.backgroundColor = 'var(--accent-danger)';
            text.innerText = 'Servidor Offline';
            text.style.color = 'var(--accent-danger)';
        }
    }
    
    setInterval(checkOlistConnection, 5000);
    checkOlistConnection();
});

// === 2D RACK VISUALIZER LOGIC ===
let currentRackVisualizerId = null;

window.showCustomPrompt = function(title, defaultValue, onConfirm) {
    const modal = document.getElementById('custom-prompt-modal');
    const titleEl = document.getElementById('custom-prompt-title');
    const inputEl = document.getElementById('custom-prompt-input');
    const btnCancel = document.getElementById('custom-prompt-cancel');
    const btnConfirm = document.getElementById('custom-prompt-confirm');
    
    titleEl.innerText = title;
    inputEl.value = defaultValue;
    modal.classList.remove('hidden');
    inputEl.focus();
    
    // Clean up old listeners
    const newBtnCancel = btnCancel.cloneNode(true);
    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
    
    const close = () => modal.classList.add('hidden');
    
    newBtnCancel.addEventListener('click', close);
    newBtnConfirm.addEventListener('click', () => {
        onConfirm(inputEl.value);
        close();
    });
    
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            onConfirm(inputEl.value);
            close();
        } else if (e.key === 'Escape') {
            close();
        }
    });
};

window.openRackVisualizer = function(rackId) {
    currentRackVisualizerId = rackId;
    const rack = warehouseData.racks.find(r => r.id === rackId);
    if (!rack) return;
    
    const parentAisle = findParentAisleForRack(rack);
    const rvRackName = document.getElementById('rv-rack-name');
    const rvRackAisle = document.getElementById('rv-rack-aisle');
    if (rvRackName) rvRackName.innerText = `Estante ${rack.name}`;
    if (rvRackAisle) rvRackAisle.innerText = parentAisle ? `(Corredor: ${parentAisle.name})` : '(Sem Corredor)';
    
    window.renderRackVisualizer();
    const modal = document.getElementById('rack-visualizer-modal');
    if(modal) modal.classList.remove('hidden');
};

window.closeRackVisualizer = function() {
    currentRackVisualizerId = null;
    const modal = document.getElementById('rack-visualizer-modal');
    if(modal) modal.classList.add('hidden');
};

window.renderRackVisualizer = function() {
    if (!currentRackVisualizerId) return;
    const rack = warehouseData.racks.find(r => r.id === currentRackVisualizerId);
    const container = document.getElementById('rv-shelves-container');
    if(!container) return;
    container.innerHTML = '';
    
    if (!rack.levels || rack.levels.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">Nenhum nível criado ainda. Clique em "+ Adicionar Nível" acima.</div>';
        return;
    }
    
    // Níveis renderizados de baixo para cima (reverse visual pelo flex column-reverse)
    rack.levels.forEach((level, idx) => {
        const shelf = document.createElement('div');
        shelf.className = 'shelf-level-2d';
        shelf.dataset.levelId = level.id;
        
        // Label and Controls
        const labelContainer = document.createElement('div');
        labelContainer.className = 'shelf-level-label';
        labelContainer.style.display = 'flex';
        labelContainer.style.alignItems = 'center';
        labelContainer.style.gap = '0.5rem';
        labelContainer.style.left = '-120px';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = level.name;
        input.style.width = '60px';
        input.style.background = 'transparent';
        input.style.border = '1px dashed var(--border-color)';
        input.style.color = 'var(--text-primary)';
        input.style.fontWeight = 'bold';
        input.style.textAlign = 'center';
        
        input.addEventListener('change', (e) => {
            const newName = e.target.value.trim();
            if (newName && newName !== level.name) {
                level.name = newName;
                saveData();
                window.syncOlistForStructuralChange(level.id, 'level');
            }
        });
        
        const btnDel = document.createElement('button');
        btnDel.innerHTML = '<i class="fa-solid fa-trash"></i>';
        btnDel.style.background = 'none';
        btnDel.style.border = 'none';
        btnDel.style.color = 'var(--accent-danger)';
        btnDel.style.cursor = 'pointer';
        btnDel.title = 'Excluir Nível';
        
        btnDel.addEventListener('click', async () => {
            if (confirm(`Tem certeza que deseja excluir o ${level.name} e todos os seus itens?`)) {
                const itemsToClear = level.items ? [...level.items] : [];
                rack.levels.splice(idx, 1);
                saveData();
                window.renderRackVisualizer();
                
                // Limpar no Olist os itens que foram deletados com o nível
                for (let item of itemsToClear) {
                    await window.syncLocationToOlist(item.sku, item.olistId || window.getOlistIdForSKU(item.sku));
                }
            }
        });
        
        labelContainer.appendChild(input);
        labelContainer.appendChild(btnDel);
        shelf.appendChild(labelContainer);
        
        // Items
        if (level.items) {
            level.items.forEach((item, itemIdx) => {
                const box = document.createElement('div');
                box.className = 'product-box-2d';
                box.draggable = true;
                box.dataset.levelId = level.id;
                box.dataset.itemIdx = itemIdx;
                
                box.innerHTML = `
                    <div class="sku" title="${item.sku}">${item.sku}</div>
                    <div class="name" title="${item.name}">${item.name || ''}</div>
                    <button class="btn-delete-item" onclick="window.deleteItemFromVisualizer('${level.id}', ${itemIdx}, event)" title="Remover"><i class="fa-solid fa-trash"></i></button>
                `;
                
                box.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                        type: 'existing',
                        levelId: level.id,
                        itemIdx: itemIdx
                    }));
                    setTimeout(() => box.classList.add('dragging'), 0);
                });
                
                box.addEventListener('dragend', () => box.classList.remove('dragging'));
                
                box.addEventListener('dblclick', () => {
                    window.showCustomPrompt('Editar Nome de Exibição do Produto:', item.name || '', (newName) => {
                        const trimmed = newName.trim();
                        if (trimmed && trimmed !== item.name) {
                            item.name = trimmed;
                            saveData();
                            window.renderRackVisualizer();
                        }
                    });
                });
                
                shelf.appendChild(box);
            });
        }
        
        // Drag over / drop logic for the shelf
        shelf.addEventListener('dragover', e => {
            e.preventDefault();
            shelf.classList.add('drag-over');
        });
        
        shelf.addEventListener('dragleave', () => {
            shelf.classList.remove('drag-over');
        });
        
        shelf.addEventListener('drop', async (e) => {
            e.preventDefault();
            shelf.classList.remove('drag-over');
            
            const dataStr = e.dataTransfer.getData('text/plain');
            if (!dataStr) return;
            const data = JSON.parse(dataStr);
            
            // Determinar o índice de soltura baseado no mouse X
            const boxes = Array.from(shelf.querySelectorAll('.product-box-2d'));
            let dropIndex = boxes.length;
            for (let i = 0; i < boxes.length; i++) {
                const rect = boxes[i].getBoundingClientRect();
                if (e.clientX < rect.left + rect.width / 2) {
                    dropIndex = i;
                    break;
                }
            }
            
            if (data.type === 'existing') {
                if (data.levelId === level.id) {
                    // Reordenar na mesma prateleira
                    const currentIdx = data.itemIdx;
                    if (currentIdx === dropIndex || (currentIdx === dropIndex - 1 && dropIndex > 0)) return; // Mesma posição
                    
                    const itemToMove = level.items.splice(currentIdx, 1)[0];
                    const newIdx = dropIndex > currentIdx ? dropIndex - 1 : dropIndex;
                    level.items.splice(newIdx, 0, itemToMove);
                    
                    saveData();
                    window.renderRackVisualizer();
                    return; // Sem necessidade de sincronizar com Olist pois não afeta a string de localização
                }
                
                const sourceLevel = rack.levels.find(l => l.id === data.levelId);
                const itemToMove = sourceLevel.items.splice(data.itemIdx, 1)[0];
                if (!level.items) level.items = [];
                level.items.splice(dropIndex, 0, itemToMove);
                
                saveData();
                window.renderRackVisualizer();
                
                await window.syncLocationToOlist(itemToMove.sku, itemToMove.olistId || window.getOlistIdForSKU(itemToMove.sku));
                
            } else if (data.type === 'new') {
                if (!level.items) level.items = [];
                const newItem = {
                    sku: data.olistData.sku,
                    name: data.olistData.name,
                    olistId: data.olistData.id
                };
                level.items.push(newItem);
                
                saveData();
                window.renderRackVisualizer();
                
                await window.syncLocationToOlist(newItem.sku, newItem.olistId || window.getOlistIdForSKU(newItem.sku));
            }
        });
        
        container.appendChild(shelf);
    });
};

window.addLevelToRackVisualizer = function() {
    if (!currentRackVisualizerId) return;
    const rack = warehouseData.racks.find(r => r.id === currentRackVisualizerId);
    if (!rack.levels) rack.levels = [];
    const nextNum = rack.levels.length + 1;
    rack.levels.push({
        id: 'l-' + Date.now(),
        name: 'N' + nextNum,
        capacity: 1000,
        currentLoad: 0,
        items: []
    });
    saveData();
    window.renderRackVisualizer();
    window.syncOlistForStructuralChange(rack.levels[rack.levels.length-1].id, 'level');
};

window.deleteItemFromVisualizer = async function(levelId, itemIdx, e) {
    e.stopPropagation();
    const rack = warehouseData.racks.find(r => r.id === currentRackVisualizerId);
    const level = rack.levels.find(l => l.id === levelId);
    
    if (confirm(`Remover item ${level.items[itemIdx].sku}?`)) {
        const deletedItem = level.items.splice(itemIdx, 1)[0];
        saveData();
        window.renderRackVisualizer();
        await window.syncLocationToOlist(deletedItem.sku, deletedItem.olistId || window.getOlistIdForSKU(deletedItem.sku));
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const rvSearchInput = document.getElementById('rv-search-input');
    const rvSearchResults = document.getElementById('rv-search-results');
    let rvSearchTimeout = null;

    if (rvSearchInput) {
        rvSearchInput.addEventListener('input', (e) => {
            clearTimeout(rvSearchTimeout);
            const termo = e.target.value.trim();
            if (!termo) {
                rvSearchResults.innerHTML = '<div style="color: var(--text-secondary); text-align: center; margin-top: 2rem;"><i class="fa-solid fa-box-open" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i><br>Use a busca acima para encontrar produtos.</div>';
                return;
            }
            
            rvSearchTimeout = setTimeout(async () => {
                try {
                    rvSearchResults.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 1rem;">Buscando...</div>';
                    const response = await fetch(`${API_BASE_URL}/api/produtos?pesquisa=${encodeURIComponent(termo)}`);
                    if (!response.ok) throw new Error('Erro API');
                    
                    const responseData = await response.json();
                    const itens = responseData.itens || [];
                    
                    rvSearchResults.innerHTML = '';
                    if (itens.length === 0) {
                        rvSearchResults.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 1rem;">Nenhum produto encontrado.</div>';
                        return;
                    }
                    
                    itens.forEach(item => {
                        const resultDiv = document.createElement('div');
                        resultDiv.className = 'rv-olist-item';
                        resultDiv.draggable = true;
                        
                        const nomeStr = item.descricao || 'Sem Nome';
                        const skuStr = item.sku || 'Sem SKU';
                        
                        resultDiv.innerHTML = `
                            <div style="background: var(--accent-primary); color: white; border-radius: 4px; padding: 0.5rem; display: flex; align-items: center; justify-content: center;">
                                <i class="fa-solid fa-box"></i>
                            </div>
                            <div style="flex: 1; overflow: hidden;">
                                <div style="font-weight: bold; font-size: 0.875rem; color: var(--text-primary);">${skuStr}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nomeStr}</div>
                            </div>
                            <div style="color: var(--text-secondary);"><i class="fa-solid fa-grip-vertical"></i></div>
                        `;
                        
                        resultDiv.addEventListener('dragstart', (evt) => {
                            evt.dataTransfer.setData('text/plain', JSON.stringify({
                                type: 'new',
                                olistData: { id: item.id, sku: skuStr, name: nomeStr }
                            }));
                        });
                        
                        rvSearchResults.appendChild(resultDiv);
                    });
                } catch (err) {
                    rvSearchResults.innerHTML = '<div style="color: var(--accent-danger); text-align: center; padding: 1rem;">Erro ao buscar produtos.</div>';
                }
            }, 500);
        });
    }
});
// === MOBILE AUDIT LOGIC ===
window.startMobileAudit = async function(rackId) {
    const rack = warehouseData.racks.find(r => r.id === rackId);
    if (!rack) {
        alert("Estante não encontrada.");
        return;
    }

    const titleEl = document.getElementById('mobile-audit-title');
    const cooldownEl = document.getElementById('mobile-audit-cooldown');
    const cooldownMsg = document.getElementById('mobile-audit-cooldown-msg');
    const proceedBtn = document.getElementById('btn-mobile-cooldown-proceed');
    const contentEl = document.getElementById('mobile-audit-content');
    const themeBtn = document.getElementById('btn-mobile-theme');
    const finishBtn = document.getElementById('btn-mobile-audit-finish');

    titleEl.textContent = `Auditoria: ${rack.name}`;
    
    // Theme toggle
    themeBtn.onclick = () => {
        document.body.classList.toggle('light-theme');
        themeBtn.innerHTML = document.body.classList.contains('light-theme') ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    };

    // Check Cooldown
    try {
        const { data } = await supabaseApp.from('contagens_inventario')
            .select('data_contagem')
            .eq('rack_id', rack.id)
            .order('data_contagem', { ascending: false })
            .limit(1);

        if (data && data.length > 0) {
            const lastDate = new Date(data[0].data_contagem);
            const now = new Date();
            const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
            if (diffDays < 10) {
                cooldownMsg.textContent = `Esta estante foi contada há ${diffDays} dias (${lastDate.toLocaleDateString()}). Deseja prosseguir?`;
                cooldownEl.classList.remove('hidden');
                contentEl.classList.add('hidden');
                finishBtn.classList.add('hidden');
            }
        }
    } catch (e) {
        console.warn("Erro ao checar cooldown", e);
    }

    proceedBtn.onclick = () => {
        cooldownEl.classList.add('hidden');
        contentEl.classList.remove('hidden');
        finishBtn.classList.remove('hidden');
    };

    // Calculate "Estoque Existente" (Stock in all OTHER racks)
    const getStockInOtherRacks = (sku) => {
        let total = 0;
        warehouseData.racks.forEach(r => {
            if (r.id === rack.id) return; // Skip current rack
            if (!r.levels) return;
            r.levels.forEach(l => {
                if (!l.items) return;
                l.items.forEach(item => {
                    if (item.sku === sku) total += 1;
                });
            });
        });
        return total;
    };

    // Render Form
    let html = '';
    
    // Reverse levels to show bottom first or top first? Usually top first in mobile view is fine
    const levels = rack.levels || [];
    
    levels.forEach((level, lIndex) => {
        html += `<div class="audit-level-card">`;
        html += `<h3 style="margin-top:0; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem; color:var(--accent-primary);"><i class="fa-solid fa-layer-group"></i> ${level.name}</h3>`;
        
        // Count items in this level to group them by SKU
        const skuGroups = {};
        if (level.items) {
            level.items.forEach(item => {
                if (!skuGroups[item.sku]) {
                    skuGroups[item.sku] = { name: item.name, count: 0 };
                }
                skuGroups[item.sku].count++;
            });
        }
        
        if (Object.keys(skuGroups).length === 0) {
            html += `<p style="color:var(--text-secondary); font-size:0.9rem;">Nenhum item registrado neste nível.</p>`;
        } else {
            Object.keys(skuGroups).forEach(sku => {
                const group = skuGroups[sku];
                const otherStock = getStockInOtherRacks(sku);
                
                html += `
                    <div class="audit-item-row" data-level="${level.id}" data-sku="${sku}" data-name="${group.name}">
                        <div style="font-weight:bold; color:var(--text-primary);">${sku}</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom: 0.5rem;">${group.name || ''}</div>
                        
                        <div class="audit-input-group">
                            <div>
                                <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem;">Outras Estantes</label>
                                <input type="number" value="${otherStock}" disabled style="width:100%; padding:0.5rem; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); color:var(--text-secondary); border-radius:4px; text-align:center;">
                            </div>
                            <div>
                                <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem;">Qtd. Encontrada</label>
                                <input type="number" class="audit-qty-input" value="${group.count}" min="0" style="width:100%; padding:0.5rem; background:var(--bg-base); border:1px solid var(--accent-primary); color:var(--text-primary); border-radius:4px; text-align:center; font-weight:bold;">
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `</div>`;
    });

    html += `
        <div class="audit-level-card">
            <h3 style="margin-top:0; color:var(--text-primary);"><i class="fa-solid fa-plus-circle" style="color:var(--accent-success);"></i> Adicionar Produto Novo</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary);">Encontrou algo nesta estante que não estava no sistema?</p>
            <div id="mobile-new-products-list" style="margin-bottom: 1rem;"></div>
            
            <div style="background:var(--bg-base); padding:1rem; border-radius:6px; border:1px dashed var(--border-color);">
                <input type="text" id="mobile-search-olist" placeholder="Buscar SKU ou Nome..." style="width:100%; padding:0.5rem; margin-bottom:0.5rem; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;">
                <div id="mobile-search-results" class="hidden" style="max-height: 150px; overflow-y: auto; background: var(--bg-surface-elevated); border:1px solid var(--border-color); border-radius:4px; margin-bottom:0.5rem;"></div>
                
                <input type="text" id="mobile-new-sku" readonly placeholder="SKU Selecionado" style="width:100%; padding:0.5rem; margin-bottom:0.5rem; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); color:var(--text-secondary); border-radius:4px;">
                <input type="text" id="mobile-new-name" readonly placeholder="Nome do Produto" style="width:100%; padding:0.5rem; margin-bottom:0.5rem; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); color:var(--text-secondary); border-radius:4px;">
                
                <div style="display:flex; gap:0.5rem; margin-bottom: 0.5rem;">
                    <div style="flex:1;">
                        <label style="font-size:0.75rem; color:var(--text-secondary);">Qtd</label>
                        <input type="number" id="mobile-new-qty" min="1" value="1" style="width:100%; padding:0.5rem; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; text-align:center;">
                    </div>
                    <div style="flex:2;">
                        <label style="font-size:0.75rem; color:var(--text-secondary);">Nível</label>
                        <select id="mobile-new-level" style="width:100%; padding:0.5rem; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;">
                            ${levels.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <button class="btn btn-secondary" id="btn-mobile-add-product" style="width:100%; justify-content:center; border-color:var(--accent-success); color:var(--accent-success);">Adicionar à Lista de Contagem</button>
            </div>
        </div>
    `;

    html += `
        <div class="audit-level-card">
            <h3 style="margin-top:0; color:var(--text-primary);"><i class="fa-solid fa-message"></i> Observação</h3>
            <textarea id="mobile-audit-obs" rows="3" placeholder="Ex: Produto X está avariado. Caixa Y estava aberta..." style="width:100%; padding:0.75rem; background:var(--bg-base); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; resize:vertical; font-family:inherit;"></textarea>
        </div>
    `;

    html += `
        <div class="audit-level-card" style="margin-bottom: 0;">
            <h3 style="margin-top:0; color:var(--text-primary);"><i class="fa-solid fa-signature"></i> Assinatura Digital</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary);">Assine com o dedo no quadro abaixo para validar.</p>
            <canvas id="audit-signature-canvas" class="audit-signature-pad" width="400" height="150"></canvas>
            <div style="text-align:right; margin-top:0.5rem;">
                <button class="btn-icon" id="btn-clear-signature" style="color:var(--text-secondary); background:none; border:none; font-size:0.8rem; cursor:pointer;"><i class="fa-solid fa-eraser"></i> Limpar Assinatura</button>
            </div>
        </div>
    `;

    contentEl.innerHTML = html;

    // --- LOGICA DE ADICIONAR NOVO PRODUTO ---
    const mobileSearchInput = document.getElementById('mobile-search-olist');
    const mobileSearchResults = document.getElementById('mobile-search-results');
    const mobileNewSku = document.getElementById('mobile-new-sku');
    const mobileNewName = document.getElementById('mobile-new-name');
    const mobileNewQty = document.getElementById('mobile-new-qty');
    const mobileNewLevel = document.getElementById('mobile-new-level');
    const btnMobileAdd = document.getElementById('btn-mobile-add-product');
    const mobileNewList = document.getElementById('mobile-new-products-list');
    
    let addedProducts = [];
    let searchTimer = null;

    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            const termo = e.target.value.trim();
            if (!termo) {
                mobileSearchResults.classList.add('hidden');
                return;
            }
            
            searchTimer = setTimeout(async () => {
                mobileSearchResults.classList.remove('hidden');
                mobileSearchResults.innerHTML = '<div style="padding:0.5rem; text-align:center; color:var(--text-secondary); font-size:0.8rem;">Buscando...</div>';
                try {
                    const response = await fetch(`${API_BASE_URL}/api/produtos?pesquisa=${encodeURIComponent(termo)}`);
                    if (!response.ok) throw new Error('Erro API');
                    const responseData = await response.json();
                    const itens = responseData.itens || [];
                    
                    if (itens.length === 0) {
                        mobileSearchResults.innerHTML = '<div style="padding:0.5rem; text-align:center; color:var(--text-secondary); font-size:0.8rem;">Não encontrado.</div>';
                        return;
                    }
                    
                    mobileSearchResults.innerHTML = itens.map(item => `
                        <div class="mobile-search-item" style="padding:0.75rem; border-bottom:1px solid var(--border-color); cursor:pointer;" data-sku="${item.sku || ''}" data-name="${item.descricao || ''}">
                            <div style="font-weight:bold; font-size:0.85rem; color:var(--text-primary); pointer-events:none;">${item.sku}</div>
                            <div style="font-size:0.75rem; color:var(--text-secondary); pointer-events:none;">${item.descricao}</div>
                        </div>
                    `).join('');
                    
                    mobileSearchResults.querySelectorAll('.mobile-search-item').forEach(el => {
                        el.onclick = () => {
                            mobileNewSku.value = el.dataset.sku;
                            mobileNewName.value = el.dataset.name;
                            mobileSearchResults.classList.add('hidden');
                        };
                    });
                } catch(e) {
                    mobileSearchResults.innerHTML = '<div style="padding:0.5rem; text-align:center; color:var(--accent-danger); font-size:0.8rem;">Erro ao buscar.</div>';
                }
            }, 500);
        });
    }

    if (btnMobileAdd) {
        btnMobileAdd.onclick = () => {
            const sku = mobileNewSku.value;
            const name = mobileNewName.value;
            const qty = parseInt(mobileNewQty.value, 10);
            const lvl = mobileNewLevel.value;
            
            if (!sku || isNaN(qty) || qty <= 0) {
                alert("Selecione um produto e uma quantidade válida.");
                return;
            }
            
            addedProducts.push({ sku, name, quantidade: qty, levelId: lvl });
            
            mobileNewList.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface); padding:0.5rem; border:1px solid var(--border-color); border-radius:4px; margin-bottom:0.5rem; font-size:0.85rem;">
                    <div><strong>${sku}</strong> (${qty} un) <br><span style="color:var(--text-secondary); font-size:0.75rem;">${name}</span></div>
                    <div style="color:var(--text-secondary); font-size:0.75rem;">Nível ID: ${lvl}</div>
                </div>
            `;
            
            mobileNewSku.value = '';
            mobileNewName.value = '';
            mobileSearchInput.value = '';
            mobileNewQty.value = '1';
        };
    }

    // --- INICIALIZA THEME ---
    const btnMobileTheme = document.getElementById('btn-mobile-theme');
    if (btnMobileTheme && !btnMobileTheme.hasAttribute('data-theme-listener')) {
        btnMobileTheme.setAttribute('data-theme-listener', 'true');
        btnMobileTheme.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            if (current === 'light') {
                document.documentElement.removeAttribute('data-theme');
                btnMobileTheme.innerHTML = '<i class="fa-solid fa-moon"></i>';
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                btnMobileTheme.innerHTML = '<i class="fa-solid fa-sun"></i>';
            }
        });
    }

    // --- LOGICA DE ASSINATURA CANVAS ---
    const canvas = document.getElementById('audit-signature-canvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let hasSignature = false;
    
    // Resize canvas based on container width
    const resizeCanvas = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        ctx.scale(ratio, ratio);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000'; // Black signature
    };
    // Need a tiny delay for layout to settle
    setTimeout(resizeCanvas, 100);

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDraw = (e) => {
        e.preventDefault();
        isDrawing = true;
        hasSignature = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    const stopDraw = () => {
        isDrawing = false;
        ctx.closePath();
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseout', stopDraw);
    
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);

    document.getElementById('btn-clear-signature').onclick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasSignature = false;
    };

    // --- LOGICA DE FINALIZAR E SALVAR ---
    finishBtn.onclick = async () => {
        if (!hasSignature) {
            alert("Por favor, assine no quadro para finalizar a auditoria.");
            return;
        }

        finishBtn.disabled = true;
        finishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

        try {
            // 1. Update `warehouseData` locally based on inputs
            const rows = contentEl.querySelectorAll('.audit-item-row');
            let itemsReport = [];
            
            // First, clear all existing items in the rack (we rebuild based on audit)
            rack.levels.forEach(l => l.items = []);
            
            // Read inputs
            rows.forEach(row => {
                const levelId = row.dataset.level;
                const sku = row.dataset.sku;
                const name = row.dataset.name;
                const qtyInput = row.querySelector('.audit-qty-input');
                const qty = parseInt(qtyInput.value, 10);
                
                if (qty > 0) {
                    const level = rack.levels.find(l => l.id === levelId);
                    if (level) {
                        level.items.push({ sku, name, qty });
                        itemsReport.push({ sku, name, quantidade: qty, levelId });
                    }
                }
            });

            addedProducts.forEach(prod => {
                const level = rack.levels.find(l => l.id === prod.levelId);
                if (level) {
                    level.items.push({ sku: prod.sku, name: prod.name, qty: prod.quantidade });
                }
                
                // Sincroniza a localização do produto recém adicionado lá no Tiny/Olist
                const olistIdToUse = window.getOlistIdForSKU(prod.sku);
                if (olistIdToUse) {
                    window.syncLocationToOlist(prod.sku, olistIdToUse).catch(console.error);
                }
            });

            // Oculta a UI IMEDIATAMENTE para o usuário não esperar
            document.getElementById('mobile-audit-container').classList.add('hidden');
            
            // Recalculate weights...
            await saveData();
            window.renderRackVisualizer(); // Atualiza a UI imediatamente

            // 2. Upload signature to base64
            const sigBase64 = canvas.toDataURL("image/png");
            const obsText = document.getElementById('mobile-audit-obs').value.trim();

            // 3. Save to `contagens_inventario` no Supabase (Rápido)
            supabaseApp.from('contagens_inventario').insert({
                rack_id: rack.id,
                rack_nome: rack.name,
                funcionario: window.auditWorkerName,
                assinatura: sigBase64,
                itens_contados: itemsReport,
                produtos_adicionados: addedProducts,
                observacao: obsText
            }).then(({error}) => {
                if (error) console.error("Erro ao salvar relatório:", error);
            });

            // 4. Send to Node.js backend para atualizar Olist/Tiny (Pode demorar se o Render estiver dormindo)
            fetch(`${API_BASE_URL}/api/inventario`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rack_id: rack.id,
                    itens: itemsReport,
                    observacoes: obsText
                })
            }).then(res => res.json())
              .then(data => console.log("Inventário sincronizado com backend:", data))
              .catch(err => console.error("Erro ao sincronizar inventário:", err));
              
            // Redireciona o usuário (ou limpa a tela)
            document.body.innerHTML = `
                <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--bg-base); color:var(--text-primary);">
                    <i class="fa-solid fa-circle-check" style="font-size: 5rem; color: var(--accent-success); margin-bottom: 1rem;"></i>
                    <h2>Concluído!</h2>
                    <p style="color:var(--text-secondary);">A auditoria da estante ${rack.name} foi salva.</p>
                </div>
            `;

        } catch (err) {
            console.error(err);
            alert("Erro ao salvar auditoria. Tente novamente.");
            finishBtn.disabled = false;
            finishBtn.innerHTML = 'Assinar e Finalizar Contagem';
        }
    };
};

