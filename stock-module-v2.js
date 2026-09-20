(() => {
  const API = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const SAMPLE_SIZE = 10;
  const FEFO_POSITIONS = 8;
  const PAGE_SIZE = 100;
  const S = {
    data: null,
    cache: new Map(),
    month: state.currentMonth,
    area: 'Regulador',
    query: '',
    mode: 'map',
    active: '',
    request: 0,
    origin: 'Regulador',
    fefoSample: Array(SAMPLE_SIZE).fill(''),
    stockQuery: '',
    stockArea: '',
    stockPage: 1,
    history: null,
    zoom: {}
  };
  let core;

  const $ = id => document.getElementById(id);
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const dt = x => x ? String(x).slice(0, 10).split('-').reverse().join('/') : '—';
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const areaName = a => a === 'Regulador' ? 'Estoque geral' : a;
  const canEdit = () => ['admin', 'conferente'].includes(String(state.user?.role || '').toLowerCase());
  const badge = c => `<span class="stock-badge ${['A','B','C'].includes(c) ? c.toLowerCase() : 'unknown'}">${esc(c || '—')}</span>`;
  const table = (heads, rows, cls = '') => `<div class="stock-table-wrap ${cls}"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

  async function call(action, payload = {}) {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': state.token },
      body: JSON.stringify({ action, ...payload })
    });
    const d = await r.json().catch(() => ({ error: 'Resposta inválida do serviço de estoque.' }));
    if (!r.ok) throw new Error(d.error || 'Falha ao consultar estoque.');
    return d;
  }

  async function load(force = false) {
    const month = S.month;
    if (!force && S.cache.has(month)) {
      S.data = S.cache.get(month);
      return S.data;
    }
    const request = ++S.request;
    const data = await call('get', { month });
    if (request !== S.request) return null;
    const finalData = { ...data, month };
    S.cache.set(month, finalData);
    S.data = finalData;
    return finalData;
  }

  function invalidate() {
    S.cache.clear();
    S.data = null;
    S.history = null;
  }

  const meta = () => S.data?.snapshot
    ? `Base de ${dt(S.data.snapshot.as_of)} · Curva ABC ${S.month.split('-').reverse().join('/')} · última atualização do estoque`
    : 'Nenhuma base importada';
  const matches = r => !S.query || norm([r.address, r.sku_code, r.sku_name].join(' ')).includes(norm(S.query));
  const actions = () => `<button class="outline-button" data-refresh>Atualizar consulta</button>${state.user?.role === 'admin' ? '<button class="primary-button" data-import>Importar estoque</button>' : ''}`;

  function bindActions(root) {
    root.querySelector('[data-refresh]')?.addEventListener('click', refresh);
    root.querySelector('[data-import]')?.addEventListener('click', openImport);
  }

  async function refresh() {
    try {
      await load(true);
      renderActive();
      showToast('Consulta atualizada.');
    } catch (e) {
      showToast(e.message, true);
    }
  }

  function hideViews() {
    document.querySelectorAll('main > .view').forEach(x => x.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    $('sidebar')?.classList.remove('open');
  }

  function renderActive() {
    if (S.active === 'layout') renderLayout();
    if (S.active === 'fefo') renderFefo();
    if (S.active === 'stock') renderStockBase();
    if ($('abcView') && !$('abcView').classList.contains('hidden')) renderAdherence();
  }

  function openArea(area) {
    S.active = 'layout';
    S.area = area;
    hideViews();
    $('layoutView').classList.remove('hidden');
    document.querySelector('[data-view="layout"]')?.classList.add('active');
    $('pageTitle').textContent = 'Layout';
    $('pageSubtitle').textContent = 'Áreas físicas e estoque por endereço.';
    document.querySelectorAll('[data-layout-panel]').forEach(x => x.classList.add('hidden'));
    document.querySelectorAll('[data-layout-tab]').forEach(x => x.classList.toggle('active', x.dataset.stockArea === area));
    $('stockLayoutPanel').classList.remove('hidden');
    $('stockLayoutPanel').innerHTML = '<p class="stock-empty">Carregando estoque…</p>';
    load().then(renderLayout).catch(e => $('stockLayoutPanel').innerHTML = `<p class="stock-error">${esc(e.message)}</p>`);
  }

  function setFefoCodes(codes) {
    const list = parseCodes(codes).slice(0, SAMPLE_SIZE);
    S.fefoSample = Array(SAMPLE_SIZE).fill('');
    list.forEach((c, i) => S.fefoSample[i] = c);
  }

  function openFefo(codes = '', area = 'Regulador') {
    if (codes) setFefoCodes(codes);
    S.active = 'fefo';
    S.origin = area || S.origin;
    hideViews();
    $('replenishmentView').classList.remove('hidden');
    document.querySelector('[data-view="replenishment"]')?.classList.add('active');
    $('pageTitle').textContent = 'Reabastecimento';
    $('pageSubtitle').textContent = 'Amostra FEFO com sequência de consumo por produto.';
    $('replenishmentView').innerHTML = '<p class="stock-empty">Carregando estoque…</p>';
    load().then(renderFefo).catch(e => $('replenishmentView').innerHTML = `<p class="stock-error">${esc(e.message)}</p>`);
  }

  function openStockBase() {
    S.active = 'stock';
    hideViews();
    $('stockBaseView').classList.remove('hidden');
    document.querySelector('[data-view="stock-base"]')?.classList.add('active');
    $('pageTitle').textContent = 'Estoque x Estoque';
    $('pageSubtitle').textContent = 'Base Ruas operacional, editável e rastreada por usuário.';
    $('stockBaseView').innerHTML = '<p class="stock-empty">Carregando Base Ruas…</p>';
    load().then(renderStockBase).catch(e => $('stockBaseView').innerHTML = `<p class="stock-error">${esc(e.message)}</p>`);
  }

  function renderLayout() {
    if (S.active !== 'layout') return;
    const root = $('stockLayoutPanel'), d = S.data;
    if (!d?.snapshot) {
      root.innerHTML = '<p class="stock-empty">Nenhuma base importada.</p>';
      return;
    }
    const locs = d.locations.filter(l => l.area === S.area);
    const rows = d.rows.filter(r => r.area === S.area && r.sku_code);
    const known = rows.reduce((s, r) => s + (r.pallets || 0), 0);
    root.innerHTML = `<div class="stock-module">
      <div class="stock-heading"><div><p class="eyebrow">ÁREA FÍSICA</p><h2>${esc(areaName(S.area))}</h2><p>${esc(meta())}</p></div><div class="stock-actions">${actions()}</div></div>
      <div class="stock-toolbar">
        <label>Curva ABC de referência<select id="stockMonth">${MONTHS.map(([k,l]) => `<option value="${k}" ${k === S.month ? 'selected' : ''}>${l}/2026</option>`).join('')}</select></label>
        <label class="stock-search">Localizar produto ou endereço<input id="stockSearch" value="${esc(S.query)}" placeholder="Código, descrição ou rua"/></label>
        <div class="stock-view-toggle"><button id="stockMapToggle" class="${S.mode === 'map' ? 'active' : ''}">Mapa</button><button id="stockListToggle" class="${S.mode === 'list' ? 'active' : ''}">Base de ruas</button></div>
      </div>
      <div class="stock-kpis"><article><small>Endereços ocupados</small><strong>${locs.filter(l => l.occupied).length}<em> / ${locs.length}</em></strong></article><article><small>SKUs presentes</small><strong>${new Set(rows.map(r => r.sku_code)).size}</strong></article><article><small>Paletes informados</small><strong>${nf.format(known)}</strong></article><article><small>Produtos sem validade</small><strong>${rows.filter(r => !r.expires_on).length}</strong></article></div>
      <div class="stock-legend">${badge('A')} ${badge('B')} ${badge('C')} ${badge('Mista')}</div>
      <div id="stockMapContent"></div><div id="stockLocationDetails"></div>
    </div>`;
    bindActions(root);
    $('stockMonth').onchange = async e => { S.month = e.target.value; await load(); renderLayout(); };
    $('stockSearch').oninput = e => { S.query = e.target.value; renderMapContent(); };
    $('stockMapToggle').onclick = () => { S.mode = 'map'; renderLayout(); };
    $('stockListToggle').onclick = () => { S.mode = 'list'; renderLayout(); };
    renderMapContent();
  }

  function locationButton(loc, label, style = '') {
    const codes = [...new Set((loc?.rows || []).filter(r => r.sku_code).map(r => r.sku_code))];
    return `<button class="stock-cell ${loc?.occupied ? 'occupied' : ''} ${['A','B','C'].includes(loc?.curve) ? loc.curve.toLowerCase() : 'unknown'} ${S.query && (!loc || !loc.rows.some(matches)) ? 'muted' : ''}" style="${style}" data-location="${esc(loc?.key || '')}" title="${esc(label + ' · ' + codes.join(', '))}"><strong>${esc(label)}</strong><span>${codes.length > 1 ? codes.length + ' SKUs' : codes[0] || (loc ? 'Vazio' : 'Sem base')}</span></button>`;
  }

  function renderMapContent() {
    const root = $('stockMapContent'), d = S.data;
    const locs = d.locations.filter(l => l.area === S.area), byKey = new Map(locs.map(l => [l.key, l]));
    if (S.mode === 'list') {
      const rows = d.rows.filter(r => r.area === S.area && matches(r));
      root.innerHTML = table(['Endereço','Código / produto','Curva','Recebimento','Validade','Paletes','Situação',''], rows.map(r => `<tr><td><button class="stock-link" data-location="${esc(core.keyOf(r))}">${esc(r.address)}</button></td><td><strong>${esc(r.sku_code || 'Vazio')}</strong><small>${esc(r.sku_name)}</small></td><td>${badge(r.curve)}</td><td>${dt(r.received_on)}</td><td>${dt(r.expires_on)}</td><td>${r.pallets == null ? '—' : nf.format(r.pallets)}</td><td>${esc(stockStatus(r))}</td><td>${canEdit() ? `<button class="stock-link" data-edit="${esc(r.id)}">Editar</button>` : ''}</td></tr>`));
    } else {
      const anchors = d.snapshot.payload.maps[S.area]?.anchors || [];
      if (!anchors.length) { root.innerHTML = '<p class="stock-empty">Sem mapa cadastrado para esta área.</p>'; return; }
      const mapped = new Set(anchors.map(a => S.area + ':' + core.normalizeAddress(a.address)));
      const minC = Math.min(...anchors.map(a => a.col)), minR = Math.min(...anchors.map(a => a.row));
      const maxC = Math.max(...anchors.map(a => a.col + (a.width || 1) - 1)), maxR = Math.max(...anchors.map(a => a.row + (a.height || 1) - 1));
      const unit = S.area === 'Regulador' ? 46 : 68, rh = S.area === 'Regulador' ? 42 : 52;
      const mapWidth = (maxC-minC+2)*unit, mapHeight = (maxR-minR+2)*rh;
      root.innerHTML = `<div class="stock-map-controls"><div><strong>Visão geral</strong><span>Passe o mouse sobre uma posição para ampliar. Clique para abrir os detalhes.</span></div><button class="outline-button" id="stockMapFit" type="button">Ajustar à tela</button></div><div class="stock-map-scroll"><div class="stock-map-stage"><div class="stock-map" style="width:${mapWidth}px;height:${mapHeight}px">${anchors.map(a => locationButton(byKey.get(S.area + ':' + core.normalizeAddress(a.address)), a.address, `left:${(a.col-minC)*unit}px;top:${(a.row-minR)*rh}px;width:${unit*(a.width||1)-3}px;height:${rh*(a.height||1)-4}px`)).join('')}</div></div></div>`;
      const extras = locs.filter(l => !mapped.has(l.key));
      if (extras.length) root.innerHTML += `<details class="stock-unmapped"><summary>${extras.length} endereços fora do desenho</summary><div class="stock-extra-grid">${extras.map(l => locationButton(l, l.address)).join('')}</div></details>`;
      const scroll = root.querySelector('.stock-map-scroll'), stage = root.querySelector('.stock-map-stage'), map = root.querySelector('.stock-map');
      const fitMap = () => {
        const available = Math.max(280, scroll.clientWidth - 24);
        const scale = Math.min(1, available / mapWidth);
        map.style.transform = `scale(${scale})`;
        map.style.transformOrigin = 'top left';
        stage.style.width = Math.ceil(mapWidth * scale) + 'px';
        stage.style.height = Math.ceil(mapHeight * scale) + 'px';
        S.zoom[S.area] = scale;
      };
      fitMap();
      $('stockMapFit').onclick = fitMap;
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(fitMap);
        ro.observe(scroll);
        setTimeout(() => ro.disconnect(), 5000);
      }
    }
    root.querySelectorAll('[data-location]').forEach(b => b.onclick = () => showLocation(b.dataset.location));
    root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editRow(b.dataset.edit));
  }

  function showLocation(key) {
    const loc = S.data.locations.find(l => l.key === key);
    if (!loc) { showToast('Endereço sem registro.', true); return; }
    const root = $('stockLocationDetails');
    root.innerHTML = `<article class="panel stock-details"><div class="stock-heading"><h3>${esc(areaName(loc.area))} · ${esc(loc.address)}</h3><button class="outline-button" id="stockDetailClose">Fechar</button></div>${table(['Produto','Validade','Paletes','FEFO',''], loc.rows.map(r => `<tr><td><strong>${esc(r.sku_code || 'Vazio')}</strong><small>${esc(r.sku_name)}</small></td><td>${dt(r.expires_on)}</td><td>${r.pallets == null ? '—' : nf.format(r.pallets)}</td><td>${esc(stockStatus(r))}</td><td>${r.sku_code ? `<button class="stock-link" data-fefo="${esc(r.sku_code)}">FEFO</button>` : ''} ${canEdit() ? `<button class="stock-link" data-edit="${esc(r.id)}">Editar</button>` : ''}</td></tr>`))}</article>`;
    $('stockDetailClose').onclick = () => root.innerHTML = '';
    root.querySelectorAll('[data-fefo]').forEach(b => b.onclick = () => openFefo(b.dataset.fefo, loc.area));
    root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editRow(b.dataset.edit));
  }

  function parseCodes(text) {
    return [...new Set(String(text || '').split(/[\s,;|]+/).map(x => x.trim()).filter(x => /^\d+$/.test(x)))];
  }

  function fefoRowsFor(code) {
    const rows = core.fefoRows(S.data.rows, code, S.origin);
    const ready = rows.filter(r => ['Prioridade FEFO', 'Aguardar lote anterior'].includes(r.fefo_status));
    return { code, rows, ready, name: rows[0]?.sku_name || '' };
  }

  function renderFefo() {
    if (S.active !== 'fefo') return;
    const root = $('replenishmentView');
    if (!S.data?.snapshot) { root.innerHTML = '<p class="stock-empty">Nenhuma base importada.</p>'; return; }
    const groups = S.fefoSample.map(code => code ? fefoRowsFor(code) : { code: '', rows: [], ready: [], name: '' });
    const rowsHtml = groups.map((g, idx) => {
      const cells = Array.from({ length: FEFO_POSITIONS }, (_, pos) => {
        const r = g.ready[pos];
        if (!r) return '<td class="fefo-slot empty">—</td>';
        const priority = r.fefo_status === 'Prioridade FEFO';
        return `<td class="fefo-slot ${priority ? 'priority' : ''}"><strong>${esc(r.address)}</strong><small>${dt(r.expires_on)} · ${r.pallets == null ? 'saldo?' : nf.format(r.pallets) + ' plt'}</small>${priority && canEdit() ? `<button class="stock-consume-button" data-consume="${esc(r.id)}">Consumir</button>` : ''}</td>`;
      }).join('');
      return `<tr><td class="fefo-code"><input class="fefo-code-input" data-sample-index="${idx}" inputmode="numeric" value="${esc(g.code)}" placeholder="Código"/></td><td class="fefo-product">${g.code ? `<strong>${esc(g.name || 'Não localizado')}</strong>${!g.rows.length ? '<small>Sem posição nesta área</small>' : ''}` : '<span>—</span>'}</td>${cells}</tr>`;
    }).join('');

    root.innerHTML = `<div class="stock-module fefo-module">
      <div class="stock-toolbar fefo-toolbar">
        <label>Área de origem<select id="fefoArea"><option value="Regulador" ${S.origin === 'Regulador' ? 'selected' : ''}>Estoque geral</option><option value="Marketplace" ${S.origin === 'Marketplace' ? 'selected' : ''}>Marketplace</option></select></label>
        <div class="stock-help fefo-hint">Amostra com até 10 produtos. Cole vários códigos na primeira célula e eles serão distribuídos nas linhas.</div>
        <button class="outline-button" id="fefoClear">Limpar amostra</button>
        <button class="outline-button" data-refresh>Atualizar estoque</button>
      </div>
      <div class="fefo-sample-wrap"><table class="fefo-sample"><thead><tr><th>CÓDIGO</th><th>PRODUTO</th>${Array.from({length:FEFO_POSITIONS}, (_,i) => `<th>${i+1}º A SER CONSUMIDO</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>
      <div class="fefo-legend"><span><i class="fefo-dot priority"></i> Liberado para consumo agora</span><span>Os demais endereços ficam em sequência FEFO.</span></div>
      <details class="stock-method"><summary>Critérios de consumo</summary><p>A sequência segue a planilha: menor validade válida primeiro. Lotes vencidos, vencendo hoje, sem validade, com trava-palete, com menos de 40 dias entre recebimento e validade ou sem saldo não entram como recomendação.</p></details>
    </div>`;

    bindActions(root);
    $('fefoArea').onchange = e => { S.origin = e.target.value; renderFefo(); };
    $('fefoClear').onclick = () => { S.fefoSample = Array(SAMPLE_SIZE).fill(''); renderFefo(); };
    root.querySelectorAll('.fefo-code-input').forEach(input => {
      input.onchange = e => {
        const i = Number(e.target.dataset.sampleIndex);
        S.fefoSample[i] = String(e.target.value || '').replace(/\D/g, '');
        renderFefo();
      };
      input.onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };
      input.onpaste = e => {
        const list = parseCodes(e.clipboardData?.getData('text') || '');
        if (list.length <= 1) return;
        e.preventDefault();
        const start = Number(e.target.dataset.sampleIndex);
        list.slice(0, SAMPLE_SIZE - start).forEach((code, j) => S.fefoSample[start + j] = code);
        renderFefo();
      };
    });
    root.querySelectorAll('[data-consume]').forEach(b => b.onclick = () => consumeRow(b.dataset.consume));
  }

  function stockStatus(r) {
    const s = r.fefo_status;
    if (s === 'Prioridade FEFO') return 'LIBERADO';
    if (s === 'Aguardar lote anterior') return 'BLOQUEADO';
    if (s === 'Solicitar devolução') return 'SOLICITAR DEVOLUÇÃO';
    if (s === 'Vencido' || s === 'Vence hoje') return 'BLOQUEAR PRODUTO';
    if (s === 'Sem saldo') return 'SEM SALDO';
    if (s === 'Trava-palete') return 'TRAVA-PALETE';
    if (s === 'Sem validade') return 'SEM VALIDADE';
    if (s === 'Datas inconsistentes') return 'DATAS INCONSISTENTES';
    if (s === 'Recebimento futuro') return 'RECEBIMENTO FUTURO';
    if (s === 'Vazio') return '';
    return s || '';
  }

  function stockRows() {
    return (S.data?.rows || []).filter(r => r.source_sheet === 'Base Ruas' && (!S.stockArea || r.area === S.stockArea) && (!S.stockQuery || norm([r.address, r.sku_code, r.sku_name, r.received_on, r.expires_on, r.lock, stockStatus(r)].join(' ')).includes(norm(S.stockQuery))));
  }

  function renderStockBase() {
    if (S.active !== 'stock') return;
    const root = $('stockBaseView');
    if (!S.data?.snapshot) { root.innerHTML = '<p class="stock-empty">Nenhuma Base Ruas importada.</p>'; return; }
    const allBase = (S.data.rows || []).filter(r => r.source_sheet === 'Base Ruas');
    const filtered = stockRows();
    const occupied = allBase.filter(r => r.sku_code && r.pallets !== 0);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    S.stockPage = Math.min(Math.max(1, S.stockPage), pages);
    const start = (S.stockPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);
    const knownPallets = occupied.reduce((s, r) => s + (Number(r.pallets) || 0), 0);

    root.innerHTML = `<div class="stock-module stock-base-module">
      <div class="stock-toolbar stock-base-toolbar">
        <label>Área<select id="baseArea"><option value="">Todas</option><option value="Regulador" ${S.stockArea === 'Regulador' ? 'selected' : ''}>Estoque geral</option><option value="Marketplace" ${S.stockArea === 'Marketplace' ? 'selected' : ''}>Marketplace</option></select></label>
        <label class="stock-search">Pesquisar<input id="baseSearch" value="${esc(S.stockQuery)}" placeholder="Rua, código, produto, validade, status..."/></label>
        <div class="stock-actions">${actions()}</div>
      </div>
      <div class="stock-source-line"><strong>Base Ruas da planilha</strong><span>${esc(meta())}</span></div>
      <div class="stock-kpis"><article><small>Posições da base</small><strong>${allBase.length}</strong></article><article><small>Posições ocupadas</small><strong>${occupied.length}</strong></article><article><small>Paletes informados</small><strong>${nf.format(knownPallets)}</strong></article><article><small>Sem validade</small><strong>${occupied.filter(r => !r.expires_on).length}</strong></article></div>
      ${table(['RUA','CÓDIGO','PRODUTO','CURVA','RECEBIMENTO','VALIDADE','DIAS DE VALIDADE','QUANTIDADE (PLT)','STATUS','TRAVA-PALETE',''], pageRows.map(r => `<tr><td><strong>${esc(r.address)}</strong></td><td>${esc(r.sku_code || '')}</td><td class="stock-product-cell">${esc(r.sku_name || '')}</td><td>${badge(r.curve)}</td><td>${dt(r.received_on)}</td><td>${dt(r.expires_on)}</td><td>${r.days == null ? '—' : r.days}</td><td>${r.pallets == null ? '—' : nf.format(r.pallets)}</td><td><span class="stock-status-text">${esc(stockStatus(r))}</span></td><td>${esc(r.lock || '')}</td><td>${canEdit() ? `<button class="stock-link" data-edit="${esc(r.id)}">Editar</button>` : ''}</td></tr>`), 'stock-base-table')}
      <div class="stock-pagination"><span>${filtered.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, filtered.length)} de ${filtered.length}</span><div><button class="outline-button" id="stockPrev" ${S.stockPage <= 1 ? 'disabled' : ''}>Anterior</button><strong>${S.stockPage} / ${pages}</strong><button class="outline-button" id="stockNext" ${S.stockPage >= pages ? 'disabled' : ''}>Próxima</button></div></div>
      <details class="panel stock-method" id="stockHistory"><summary>Histórico de alterações</summary><div id="stockHistoryBody"><p class="stock-help">Abra para carregar o rastreio por usuário.</p></div></details>
    </div>`;

    bindActions(root);
    $('baseArea').onchange = e => { S.stockArea = e.target.value; S.stockPage = 1; renderStockBase(); };
    let timer;
    $('baseSearch').oninput = e => { S.stockQuery = e.target.value; S.stockPage = 1; clearTimeout(timer); timer = setTimeout(renderStockBase, 120); };
    $('stockPrev').onclick = () => { if (S.stockPage > 1) { S.stockPage--; renderStockBase(); } };
    $('stockNext').onclick = () => { if (S.stockPage < pages) { S.stockPage++; renderStockBase(); } };
    root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editRow(b.dataset.edit));
    $('stockHistory').ontoggle = () => { if ($('stockHistory').open) loadHistory(); };
  }

  async function loadHistory() {
    const body = $('stockHistoryBody');
    if (!body) return;
    if (!S.history) {
      body.innerHTML = '<p class="stock-help">Carregando histórico…</p>';
      try { S.history = (await call('history', { limit: 80 })).items || []; }
      catch (e) { body.innerHTML = `<p class="stock-error">${esc(e.message)}</p>`; return; }
    }
    body.innerHTML = S.history.length ? `<div class="stock-audit-list">${S.history.map(h => {
      const u = h.app_users?.display_name || h.app_users?.username || 'Usuário';
      const action = h.action === 'IMPORT' ? 'Importação' : h.action === 'BULK_EDIT' ? 'Edição em lote' : h.action === 'CONSUME' ? 'Consumo FEFO' : 'Edição';
      return `<div class="stock-audit-row"><strong>${esc(u)}</strong><span>${esc(action)} · ${h.changed_count} registro(s)</span><small>${new Date(h.created_at).toLocaleString('pt-BR')} · ${esc(h.note || '')}</small></div>`;
    }).join('')}</div>` : '<p class="stock-empty">Nenhuma alteração registrada após a ativação do rastreio.</p>';
  }

  async function consumeRow(id) {
    const row = S.data?.rows?.find(r => r.id === id);
    if (!row || !canEdit()) return;
    if (row.pallets == null || Number(row.pallets) <= 0) { showToast('Informe o saldo desta posição antes de registrar consumo.', true); return; }
    const current = Number(row.pallets);
    const d = dialog('Consumir palete', `<div class="consume-summary"><strong>${esc(row.sku_code)} · ${esc(row.sku_name)}</strong><span>Rua ${esc(row.address)} · validade ${dt(row.expires_on)}</span></div><form id="consumeForm" class="stock-form"><label class="stock-checkbox"><input id="consumeAll" type="checkbox" checked/> Consumiu todo o saldo desta posição</label><label>Paletes consumidos<input id="consumeQty" name="used" type="number" min="0.01" max="${current}" step="0.01" value="${current}"/></label><div class="consume-remaining"><small>Saldo atual</small><strong>${nf.format(current)} plt</strong></div><div class="consume-remaining"><small>Restará na rua</small><strong id="consumeRemaining">0 plt</strong></div><label class="stock-form-wide">Observação<input name="note" placeholder="Opcional: motivo, destino, conferência..."/></label><button class="primary-button stock-form-wide" type="submit">Confirmar consumo</button></form>`);
    const all = $('consumeAll'), qty = $('consumeQty'), remaining = $('consumeRemaining');
    const recalc = () => {
      if (all.checked) { qty.value = String(current); qty.disabled = true; }
      else qty.disabled = false;
      const used = Math.min(current, Math.max(0, Number(qty.value) || 0));
      remaining.textContent = `${nf.format(Math.max(0, current - used))} plt`;
    };
    all.onchange = recalc; qty.oninput = recalc; recalc();
    $('consumeForm').onsubmit = async e => {
      e.preventDefault();
      const b = e.submitter, note = new FormData(e.target).get('note') || '';
      b.disabled = true;
      try {
        const used = Number(qty.value);
        const result = await call('consume', { previous_id: S.data.snapshot.id, row_id: id, used, note });
        invalidate();
        await load(true);
        d.close();
        renderActive();
        showToast(`Consumo registrado. Restante: ${nf.format(result.remaining)} palete(s).`);
      } catch (err) {
        $('stockDialogError').textContent = err.message;
      } finally { b.disabled = false; }
    };
  }

  async function openAdherence() {
    S.month = state.currentMonth;
    const root = $('stockAdherenceBody');
    root.innerHTML = '<p class="stock-empty">Cruzando estoque com Curva ABC…</p>';
    try { await load(); renderAdherence(); }
    catch (e) { root.innerHTML = `<p class="stock-error">${esc(e.message)}</p>`; }
  }

  function renderAdherence() {
    const root = $('stockAdherenceBody');
    if (!root || !S.data?.snapshot) return;
    root.innerHTML = `<p class="stock-help">${esc(meta())}. Estoque atual comparado à curva do mês selecionado.</p><div class="stock-adherence-cards">${S.data.adherence.map(a => `<article><small>${esc(areaName(a.area))}</small><strong>${a.rate === null ? '—' : nf.format(a.rate * 100) + '%'}</strong><p>${a.real} posições A / meta ${a.planned}</p><span>${a.monitored} endereços monitorados</span></article>`).join('')}</div>`;
  }

  function dialog(title, body) {
    $('stockDialog')?.remove();
    const d = document.createElement('dialog');
    d.id = 'stockDialog'; d.className = 'stock-dialog';
    d.innerHTML = `<div class="stock-heading"><h2>${esc(title)}</h2><button class="outline-button" id="stockDialogClose">Fechar</button></div>${body}<p class="stock-error" id="stockDialogError"></p>`;
    document.body.appendChild(d);
    $('stockDialogClose').onclick = () => d.close();
    d.showModal();
    return d;
  }

  function editRow(id) {
    const row = S.data?.rows?.find(r => r.id === id);
    if (!row || !canEdit()) return;
    const d = dialog('Atualizar Base Ruas', `<p><strong>${esc(row.address)}</strong> · ${esc(areaName(row.area))}</p><form id="stockEditForm" class="stock-form"><label>Código<input name="sku_code" value="${esc(row.sku_code || '')}" pattern="[0-9]*"/></label><label>Produto<input name="sku_name" value="${esc(row.sku_name || '')}"/></label><label>Recebimento<input name="received_on" type="date" value="${esc(row.received_on || '')}"/></label><label>Validade<input name="expires_on" type="date" value="${esc(row.expires_on || '')}"/></label><label>Quantidade (paletes)<input name="pallets" type="number" min="0" step="0.01" value="${row.pallets ?? ''}"/></label><label>Trava-palete / motivo<input name="lock" value="${esc(row.lock || '')}"/></label><label class="stock-form-wide">Observação da alteração<input name="note" placeholder="Ex.: conferência física / ajuste de validade"/></label><button class="primary-button stock-form-wide" type="submit">Salvar atualização</button></form>`);
    $('stockEditForm').onsubmit = async e => {
      e.preventDefault(); const b = e.submitter; b.disabled = true;
      try {
        const f = Object.fromEntries(new FormData(e.target));
        const patch = { sku_code: f.sku_code || null, sku_name: f.sku_name || '', received_on: f.received_on || null, expires_on: f.expires_on || null, pallets: f.pallets === '' ? null : Number(f.pallets), lock: f.lock || '', inventory_confirmed: true };
        await call('edit_row', { previous_id: S.data.snapshot.id, row_id: id, patch, note: f.note || `Atualização ${row.address}` });
        invalidate(); await load(true); d.close(); renderActive(); showToast('Base Ruas atualizada e alteração registrada.');
      } catch (err) { $('stockDialogError').textContent = err.message; }
      finally { b.disabled = false; }
    };
  }

  async function openImport() {
    if (state.user?.role !== 'admin') return;
    const d = dialog('Importar Estoque x Estoque', `<p>A importação usa a aba <strong>Base Ruas</strong> da planilha. A fotografia anterior é preservada no histórico.</p><div class="stock-form"><label>Planilha<input id="stockFile" type="file" accept=".xlsx"/></label><label>Data de referência<input id="stockAsOf" type="date" value="${esc(S.data?.snapshot?.as_of || new Date().toISOString().slice(0,10))}"/></label></div><div id="stockImportPreview"></div><button class="primary-button" id="stockImportConfirm" disabled>Publicar base</button>`);
    let pending;
    $('stockFile').onchange = async e => {
      pending = null; $('stockImportConfirm').disabled = true;
      const file = e.target.files[0]; if (!file) return;
      try {
        $('stockImportPreview').textContent = 'Lendo Base Ruas…';
        if (!window.XLSX) await readRows(file);
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        pending = parseWorkbook(wb, file.name);
        $('stockAsOf').value = pending.as_of;
        const base = pending.rows.filter(r => r.source_sheet === 'Base Ruas');
        $('stockImportPreview').innerHTML = `<p>${base.length} posições · ${base.filter(r => r.sku_code).length} com produto · ${base.filter(r => r.sku_code && !r.expires_on).length} sem validade.</p>`;
        $('stockImportConfirm').disabled = false;
      } catch (err) { $('stockDialogError').textContent = err.message; }
    };
    $('stockImportConfirm').onclick = async () => {
      const b = $('stockImportConfirm'); b.disabled = true;
      try {
        pending.as_of = $('stockAsOf').value;
        core.validateSnapshot(pending);
        await call('save', { previous_id: S.data.snapshot.id, payload: pending, change_type: 'IMPORT', note: `Importação ${pending.source_name}` });
        invalidate(); await load(true); d.close(); renderActive(); showToast('Base Ruas importada e registrada no histórico.');
      } catch (err) { $('stockDialogError').textContent = err.message; }
      finally { b.disabled = false; }
    };
  }

  function parseWorkbook(wb, name) {
    const sheetName = wb.SheetNames.find(n => norm(n) === 'base ruas');
    if (!sheetName) throw new Error('Aba Base Ruas não encontrada.');
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
    const head = data.findIndex(r => r.some(x => norm(x) === 'rua') && r.some(x => norm(x) === 'validade'));
    if (head < 0) throw new Error('Cabeçalhos da Base Ruas não encontrados.');
    const headers = data[head].map(norm), col = n => headers.indexOf(n);
    const loc = col('rua'), sku = col('codigo'), prod = col('produto'), rec = col('recebimento'), exp = col('validade'), qty = col('quantidade (plt)'), lock = col('trava-palete');
    if ([loc, sku, rec, exp, qty].some(i => i < 0)) throw new Error('Colunas obrigatórias ausentes.');
    const iso = (x, line) => {
      if (x == null || x === '') return null;
      if (x instanceof Date) return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
      if (typeof x === 'number') { const z = XLSX.SSF.parse_date_code(x); return z ? `${z.y}-${String(z.m).padStart(2,'0')}-${String(z.d).padStart(2,'0')}` : null; }
      const m = String(x).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(x))) return String(x);
      throw new Error('Data inválida na linha ' + line);
    };
    const rows = [];
    for (let i = head + 1; i < data.length; i++) {
      const r = data[i], address = String(r[loc] || '').trim(); if (!address) continue;
      const code = r[sku] ? String(r[sku]).trim().replace(/\.0+$/, '') : null;
      rows.push({ id: 'base-' + (i+1), source_row: i+1, source_sheet: 'Base Ruas', area: /^M\d/i.test(address) ? 'Marketplace' : 'Regulador', address, sku_code: code, sku_name: code ? String(r[prod] || '') : '', received_on: iso(r[rec], i+1), expires_on: iso(r[exp], i+1), pallets: r[qty] == null || r[qty] === '' ? null : Number(String(r[qty]).replace(',', '.')), lock: String(r[lock] || ''), inventory_confirmed: true });
    }
    const cold = wb.Sheets.Chopp;
    if (cold) for (const c of ['C','F']) for (let row = 4; row <= 10; row++) {
      const cell = c + row, code = cold[cell]?.v;
      rows.push({ id: 'chopp-' + cell, source_row: row, source_sheet: 'Chopp', area: 'Câmara Fria', address: cell, sku_code: code ? String(code) : null, sku_name: code === '838' || code === 838 ? 'CHOPP BRAHMA CLARO BARRIL KEG 50L' : '', received_on: null, expires_on: null, pallets: null, lock: '', inventory_confirmed: false });
    }
    const p = structuredClone(S.data.snapshot.payload);
    p.rows = rows; p.source_name = name; p.as_of = iso(wb.Sheets[sheetName].I4?.v, 4) || new Date().toISOString().slice(0,10);
    core.validateSnapshot(p);
    return p;
  }

  async function mount() {
    const layout = $('layoutView'), tabs = layout?.querySelector('.layout-tabs');
    if (!tabs) return setTimeout(mount, 100);
    core = await import('./stock-core.js?v=20260917-1');
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = 'stock-module-v2.css?v=20260917-1'; document.head.appendChild(style);

    const panel = document.createElement('section'); panel.id = 'stockLayoutPanel'; panel.className = 'layout-section hidden'; panel.dataset.layoutPanel = 'stock'; layout.querySelector('.layout-module').appendChild(panel);
    for (const area of core.AREAS) {
      const b = document.createElement('button'); b.className = 'layout-tab'; b.dataset.layoutTab = 'stock-' + area; b.dataset.stockArea = area; b.textContent = areaName(area); b.onclick = () => openArea(area); tabs.appendChild(b);
    }
    tabs.querySelector('[data-layout-tab="picking"]')?.addEventListener('click', () => {
      S.active = '';
      document.querySelectorAll('[data-layout-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.layoutPanel !== 'picking'));
      tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.layoutTab === 'picking'));
      window.__pickingLayout?.open();
    });

    const stockNav = document.createElement('button'); stockNav.className = 'nav-link'; stockNav.dataset.view = 'stock-base'; stockNav.innerHTML = '<span>▦</span> Estoque x Estoque'; stockNav.onclick = openStockBase;
    document.querySelector('[data-view="layout"]').insertAdjacentElement('afterend', stockNav);
    const nav = document.createElement('button'); nav.className = 'nav-link'; nav.dataset.view = 'replenishment'; nav.innerHTML = '<span>↻</span> Reabastecimento'; nav.onclick = () => openFefo(); stockNav.insertAdjacentElement('afterend', nav);

    const stockView = document.createElement('section'); stockView.id = 'stockBaseView'; stockView.className = 'view hidden'; layout.insertAdjacentElement('afterend', stockView);
    const view = document.createElement('section'); view.id = 'replenishmentView'; view.className = 'view hidden'; stockView.insertAdjacentElement('afterend', view);

    for (const name of ['abc','layout']) document.querySelector(`[data-view="${name}"]`)?.addEventListener('click', () => {
      stockView.classList.add('hidden'); view.classList.add('hidden'); S.active = '';
      if (name === 'layout') {
        panel.classList.add('hidden');
        document.querySelector('[data-layout-panel="picking"]')?.classList.remove('hidden');
        tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.layoutTab === 'picking'));
      }
    });

    const adherence = document.createElement('details'); adherence.className = 'panel stock-adherence'; adherence.innerHTML = '<summary>Aderência do estoque à Curva ABC</summary><div id="stockAdherenceBody"></div>';
    const abcAnchor = $('abcView').querySelector('.abc-layout'); if (abcAnchor) abcAnchor.before(adherence); else $('abcView').appendChild(adherence);
    adherence.ontoggle = () => { if (adherence.open) openAdherence(); };
    const previous = renderCurve; renderCurve = function() { previous(); if (adherence.open) openAdherence(); };
    const originalApi = api; api = async function(action, payload = {}, auth = true) { const result = await originalApi(action, payload, auth); if (['import','marketplace_import'].includes(action)) invalidate(); return result; };
    window.__stockModule = { refresh, openArea, openFefo, openStockBase };
  }

  setTimeout(mount, 50);
})();
