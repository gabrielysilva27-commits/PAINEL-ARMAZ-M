(() => {
  if (window.__abcAdherenceModule) return;

  const STOCK_API = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const LAYOUT_API = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/layout-api';
  const ADHERENCE_API = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/abc-adherence-api';
  const A = { mode: 'curve', stockCache: new Map(), pickingCache: new Map(), historyCache: new Map(), request: 0 };

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = value => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value) + '%' : '—';
  const compact = value => String(value || '').trim().toUpperCase().replace(/^([A-Z]+)0+(\d)/,'$1$2').replace(/[^A-Z0-9]/g,'');
  const areaLabel = area => area === 'Regulador' ? 'Estoque Geral' : area;
  const classOrder = ['A','B','C'];

  async function post(url, action, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-session-token':state.token || ''},
      body: JSON.stringify(Object.assign({action:action}, payload || {}))
    });
    const data = await res.json().catch(() => ({error:'Resposta inválida'}));
    if (!res.ok) throw new Error(data.error || 'Falha ao consultar dados');
    return data;
  }

  async function stockData(month) {
    if (A.stockCache.has(month)) return A.stockCache.get(month);
    const data = await post(STOCK_API,'get',{month:month});
    A.stockCache.set(month,data);
    return data;
  }

  async function curveData(month, area) {
    const data = await api('curve',{month:month,area:area});
    return data.items || [];
  }

  async function pickingData(month) {
    if (A.pickingCache.has(month)) return A.pickingCache.get(month);
    const data = await post(LAYOUT_API,'get',{month:month});
    A.pickingCache.set(month,data);
    return data;
  }

  async function historyData(area, force=false) {
    if (!force && A.historyCache.has(area)) return A.historyCache.get(area);
    const data = await post(ADHERENCE_API,'history',{area:area});
    const items = data.items || [];
    A.historyCache.set(area,items);
    return items;
  }

  async function captureDaily(month, area, stock) {
    if (!stock?.snapshot?.as_of || String(stock.snapshot.as_of).slice(0,7) !== month) return null;
    const data = await post(ADHERENCE_API,'capture',{month:month,area:area});
    A.historyCache.delete(area);
    return data.item || null;
  }

  const monthLabel = value => {
    const key = String(value || '').slice(0,7);
    const labels = { '01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez' };
    return (labels[key.slice(5,7)] || key.slice(5,7)) + '/' + key.slice(0,4);
  };

  function historyPanelHtml(area, items) {
    const valid = (items || []).filter(x => x.method === 'distance_to_picking' || String(x.method_version || '').startsWith('distance-picking'));
    if (!valid.length) {
      return '<section class="panel abc-history-panel"><div class="panel-heading"><div><h2>Histórico de aderência</h2><small>Acompanhamento da aderência física pela distância ao Picking.</small></div></div><div class="abc-history-loading">Nenhuma medição registrada para este filtro.</div></section>';
    }

    const byMonth = new Map();
    valid.forEach(item => {
      const key = String(item.reference_month || '').slice(0,7);
      if (!key) return;
      if (!byMonth.has(key)) byMonth.set(key,[]);
      byMonth.get(key).push(item);
    });

    const rows = [...byMonth.keys()].sort().map(month => {
      const list = byMonth.get(month) || [];
      const values = list.map(x=>Number(x.rate)).filter(Number.isFinite);
      const avg = values.length ? values.reduce((sum,x)=>sum+x,0)/values.length : null;
      const latest = [...list].sort((a,b)=>String(a.observed_date||'').localeCompare(String(b.observed_date||''))).at(-1);
      return '<tr class="'+(month===state.currentMonth?'current':'')+'"><td><strong>'+esc(monthLabel(month))+'</strong></td><td><strong>'+(avg==null?'—':pct(avg))+'</strong></td><td>'+(latest&&latest.rate!=null?pct(Number(latest.rate)):'—')+'</td><td>'+values.length+'</td><td>'+(values.length?pct(Math.min(...values))+' → '+pct(Math.max(...values)):'—')+'</td></tr>';
    }).join('');

    return '<section class="panel abc-history-panel">' +
      '<div class="panel-heading"><div><h2>Histórico de aderência</h2><small>Curva A mais próxima do Picking, B intermediária e C mais distante.</small></div></div>' +
      '<div class="stock-table-wrap"><table><thead><tr><th>Mês</th><th>Média</th><th>Última medição</th><th>Medições</th><th>Faixa</th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
    '</section>';
  }

  async function renderHistory(area) {
    const host = document.getElementById('abcHistoryPanel');
    if (!host) return;
    host.innerHTML = '<div class="abc-history-loading">Carregando histórico…</div>';
    try {
      const items = await historyData(area);
      host.innerHTML = historyPanelHtml(area,items);
    } catch (e) {
      host.innerHTML = '<div class="abc-history-loading error">'+esc(e.message)+'</div>';
    }
  }

  function addCandidate(map, address, x, y, source) {
    const key = compact(address);
    if (!key) return;
    let item = map.get(key);
    if (!item) {
      item = {key:key,address:String(address),points:[],sources:new Set()};
      map.set(key,item);
    }
    if (Number.isFinite(x) && Number.isFinite(y)) item.points.push({x:x,y:y});
    if (source) item.sources.add(source);
    if (String(address).length > item.address.length) item.address = String(address);
  }

  function finalizeCandidates(map) {
    return [...map.values()].map(item => {
      const points = item.points;
      const x = points.length ? points.reduce((s,p)=>s+p.x,0)/points.length : null;
      const y = points.length ? points.reduce((s,p)=>s+p.y,0)/points.length : null;
      return {key:item.key,address:item.address,x:x,y:y,sources:[...item.sources]};
    });
  }

  function physicalCandidates(stock, area) {
    const map = new Map();
    const anchors = stock.snapshot && stock.snapshot.payload && stock.snapshot.payload.maps && stock.snapshot.payload.maps[area]
      ? stock.snapshot.payload.maps[area].anchors || []
      : [];

    anchors.forEach(a => {
      const x = Number(a.col) + (Number(a.width || 1)-1)/2;
      const y = Number(a.row) + (Number(a.height || 1)-1)/2;
      addCandidate(map,a.address,x,y,'mapa');
    });

    if (area === 'Regulador') {
      [
        ['A37-A',93.5,61],['A37-B',93.5,62],
        ['B36-A',96.5,61],['B36-B',96.5,62],
        ['E64',12.5,45.5]
      ].forEach(x => addCandidate(map,x[0],x[1],x[2],'complemento'));
    }

    const marketRackPoints = new Map();
    if (area === 'Marketplace') {
      anchors.forEach(a => {
        const m = String(a.address || '').match(/^(M\d+)-/i);
        if (!m) return;
        const p = m[1].toUpperCase();
        if (!marketRackPoints.has(p)) marketRackPoints.set(p,[]);
        marketRackPoints.get(p).push({
          x:Number(a.col)+(Number(a.width||1)-1)/2,
          y:Number(a.row)+(Number(a.height||1)-1)/2
        });
      });
    }

    (stock.locations || []).filter(l => l.area === area).forEach(l => {
      const key = compact(l.address);
      if (map.has(key)) {
        addCandidate(map,l.address,null,null,'base');
        return;
      }
      if (area === 'Marketplace') {
        const m = String(l.address || '').match(/^(M\d+)-/i);
        const pts = m ? marketRackPoints.get(m[1].toUpperCase()) : null;
        if (pts && pts.length) {
          const x = pts.reduce((s,p)=>s+p.x,0)/pts.length;
          const y = pts.reduce((s,p)=>s+p.y,0)/pts.length;
          addCandidate(map,l.address,x,y,'rack');
          return;
        }
      }
      addCandidate(map,l.address,null,null,'base');
    });

    return finalizeCandidates(map);
  }

  function pickingReferencePoints(stock, area, candidates) {
    const byKey = new Map(candidates.map(c => [c.key,c]));
    const target = stock.snapshot && stock.snapshot.payload && stock.snapshot.payload.targets
      ? stock.snapshot.payload.targets[area]
      : null;

    // Estoque Geral e Marketplace usam a frente física voltada ao Picking
    // já mapeada na base de ruas. Câmara Fria usa sua borda de acesso.
    const mapped = [];
    (target && target.monitored ? target.monitored : []).forEach(m => {
      const c = byKey.get(compact(m.address));
      if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) mapped.push({x:c.x,y:c.y});
    });
    if (area !== 'Câmara Fria' && mapped.length) return mapped;

    const positioned = candidates.filter(c=>Number.isFinite(c.x)&&Number.isFinite(c.y));
    if (!positioned.length) return [];
    const edgeY = Math.min(...positioned.map(c=>c.y));
    return positioned.filter(c=>Math.abs(c.y-edgeY)<0.001).map(c=>({x:c.x,y:c.y}));
  }

  function rankCandidates(stock, area, candidates) {
    const refs = pickingReferencePoints(stock,area,candidates);
    const positioned = candidates.filter(c=>Number.isFinite(c.x)&&Number.isFinite(c.y));
    const fallbackY = positioned.length ? Math.min(...positioned.map(c=>c.y)) : 0;

    const withScore = candidates.map((c,index) => {
      let distance;
      if (Number.isFinite(c.x) && Number.isFinite(c.y) && refs.length) {
        distance = Math.min(...refs.map(p=>Math.hypot(c.x-p.x,c.y-p.y)));
      } else if (Number.isFinite(c.y)) {
        distance = Math.abs(c.y-fallbackY);
      } else {
        distance = 100000 + index;
      }
      return Object.assign({},c,{score:distance,distance_to_picking:distance});
    });

    withScore.sort((a,b)=>a.score-b.score || (a.y||9999)-(b.y||9999) || (a.x||9999)-(b.x||9999) || a.address.localeCompare(b.address,'pt-BR',{numeric:true}));
    return {
      items:withScore,
      basis:'distância física ao Picking'
    };
  }

  function curveStats(items) {
    const byClass = {A:0,B:0,C:0};
    const skus = {A:new Set(),B:new Set(),C:new Set()};
    items.forEach(x => {
      const c = x.curve_class;
      if (!classOrder.includes(c)) return;
      byClass[c]++;
      skus[c].add(String(x.sku_code || ''));
    });
    return {counts:byClass,skus:skus};
  }

  function actualLocationData(stock, area, curveItems) {
    const curveMap = new Map(curveItems.map(x => [String(x.sku_code || ''),x.curve_class]));
    const locations = new Map();
    const demand = {A:0,B:0,C:0};

    (stock.locations || []).filter(l => l.area === area).forEach(loc => {
      const rows = (loc.rows || []).filter(r => r.sku_code && r.pallets !== 0);
      if (!rows.length) {
        locations.set(compact(loc.address),{address:loc.address,occupied:false,classes:[],unknown:[],rows:[]});
        return;
      }
      const classes = [];
      const unknown = [];
      rows.forEach(r => {
        const c = curveMap.get(String(r.sku_code || ''));
        if (classOrder.includes(c)) classes.push(c);
        else unknown.push(String(r.sku_code || ''));
      });
      const unique = [...new Set(classes)];
      const highest = classOrder.find(c => unique.includes(c));
      if (highest) demand[highest]++;
      locations.set(compact(loc.address),{
        address:loc.address,
        occupied:true,
        classes:unique,
        unknown:[...new Set(unknown)],
        rows:rows
      });
    });
    return {locations:locations,demand:demand,curveMap:curveMap};
  }

  function allocateZones(total, skuCounts, occupiedDemand) {
    const base = {};
    const occupiedTotal = classOrder.reduce((s,c)=>s+Number(occupiedDemand[c]||0),0);
    classOrder.forEach(c => {
      base[c] = occupiedTotal > 0 ? Number(occupiedDemand[c] || 0) : Number(skuCounts[c] || 0);
    });
    let baseTotal = classOrder.reduce((s,c)=>s+base[c],0);
    if (!baseTotal || !total) return {A:0,B:0,C:total || 0,base:base};

    const raw = {};
    const alloc = {};
    classOrder.forEach(c => {
      raw[c] = total * base[c] / baseTotal;
      alloc[c] = Math.floor(raw[c]);
      if (base[c] > 0 && alloc[c] === 0) alloc[c] = 1;
    });

    let used = classOrder.reduce((s,c)=>s+alloc[c],0);
    while (used > total) {
      const reducible = [...classOrder].reverse().filter(c => alloc[c] > (base[c] > 0 ? 1 : 0));
      if (!reducible.length) break;
      reducible.sort((a,b)=>(alloc[b]-raw[b])-(alloc[a]-raw[a]));
      alloc[reducible[0]]--;
      used--;
    }
    while (used < total) {
      const order = [...classOrder].sort((a,b)=>(raw[b]-Math.floor(raw[b]))-(raw[a]-Math.floor(raw[a])) || classOrder.indexOf(a)-classOrder.indexOf(b));
      alloc[order[(used-total+order.length*1000)%order.length]]++;
      used++;
    }
    return Object.assign(alloc,{base:base});
  }

  function matrixForArea(stock, area, curveItems) {
    const candidates = physicalCandidates(stock,area);
    const ranked = rankCandidates(stock,area,candidates);
    const stats = curveStats(curveItems);
    const actual = actualLocationData(stock,area,curveItems);
    const allocation = allocateZones(ranked.items.length,stats.counts,actual.demand);

    const zoneByKey = new Map();
    let cursor = 0;
    classOrder.forEach(c => {
      const n = allocation[c] || 0;
      ranked.items.slice(cursor,cursor+n).forEach(p => zoneByKey.set(p.key,c));
      cursor += n;
    });

    const checks = [];
    const occupiedKeys = new Set();
    actual.locations.forEach((loc,key) => {
      const zone = zoneByKey.get(key);
      if (!zone) return;
      if (!loc.occupied) return;
      occupiedKeys.add(key);
      let status = 'Não aderente';
      let actualClass = 'Mista';
      if (loc.unknown.length) {
        status = 'Sem curva';
        actualClass = loc.classes.length ? loc.classes.join('/') + ' + sem curva' : 'Sem curva';
      } else if (loc.classes.length === 1) {
        actualClass = loc.classes[0];
        status = loc.classes[0] === zone ? 'Aderente' : 'Não aderente';
      } else if (!loc.classes.length) {
        status = 'Sem curva';
        actualClass = 'Sem curva';
      }
      checks.push({
        key:key,address:loc.address,zone:zone,actualClass:actualClass,status:status,rows:loc.rows,unknown:loc.unknown
      });
    });

    const empty = ranked.items.filter(p => !occupiedKeys.has(p.key));
    const emptyByZone = {A:[],B:[],C:[]};
    empty.forEach(p => {
      const z = zoneByKey.get(p.key);
      if (z) emptyByZone[z].push(p.address);
    });

    const adherent = checks.filter(x=>x.status==='Aderente').length;
    const non = checks.filter(x=>x.status==='Não aderente').length;
    const unknown = checks.filter(x=>x.status==='Sem curva').length;
    const rate = adherent + non ? adherent/(adherent+non)*100 : null;

    const severity = item => {
      if (item.actualClass === 'Mista') return 95;
      const a = item.actualClass.charAt(0);
      const pair = a + item.zone;
      return {'AC':100,'AB':90,'CA':85,'BA':75,'CB':60,'BC':50}[pair] || 40;
    };

    const actions = checks.filter(x=>x.status!=='Aderente').map(x => {
      let suggestion;
      const desired = classOrder.includes(x.actualClass) ? x.actualClass : null;
      if (x.status === 'Sem curva') {
        suggestion = 'Classificar o SKU na Curva ABC da própria área antes de realocar.';
      } else if (desired) {
        const free = emptyByZone[desired] && emptyByZone[desired][0];
        suggestion = free ? 'Realocar para ' + free + ' (Zona ' + desired + ').' : 'Realocar para uma posição da Zona ' + desired + '.';
      } else {
        suggestion = 'Separar as curvas misturadas e realocar cada SKU para sua zona.';
      }
      return Object.assign({},x,{suggestion:suggestion,severity:severity(x)});
    }).sort((a,b)=>b.severity-a.severity || a.address.localeCompare(b.address,'pt-BR',{numeric:true}));

    return {
      candidates:ranked.items,
      basis:ranked.basis,
      allocation:allocation,
      zoneByKey:zoneByKey,
      stats:stats,
      actual:actual,
      checks:checks,
      empty:empty,
      adherent:adherent,
      non:non,
      unknown:unknown,
      rate:rate,
      actions:actions
    };
  }

  function zoneCard(c, matrix) {
    const n = matrix.allocation[c] || 0;
    const share = matrix.candidates.length ? n/matrix.candidates.length*100 : 0;
    const actual = matrix.checks.filter(x => x.actualClass === c).length;
    const correct = matrix.checks.filter(x => x.actualClass === c && x.zone === c && x.status === 'Aderente').length;
    return '<article class="abc-zone-card zone-' + c.toLowerCase() + '">' +
      '<div><span>Zona ' + c + '</span><strong>' + n + ' posições</strong></div>' +
      '<small>' + pct(share) + ' da matriz · ' + matrix.stats.counts[c] + ' SKUs Curva ' + c + '</small>' +
      '<p>' + correct + ' de ' + actual + ' posições ocupadas pela Curva ' + c + ' estão na zona correta.</p>' +
    '</article>';
  }

  function statusBadge(status) {
    const cls = status === 'Aderente' ? 'ok' : status === 'Sem curva' ? 'warn' : 'bad';
    return '<span class="abc-status ' + cls + '">' + esc(status) + '</span>';
  }

  function evidenceHtml(area, matrix, month) {
    const info = typeof monthInfo === 'function' ? monthInfo(month) : null;
    const updated = info && info.status === 'imported';
    return '<section class="abc-audit-evidence">' +
      '<article><b>1</b><div><strong>Atualização ABC</strong><span>' + (updated ? 'Curva ' + esc(month.split('-').reverse().join('/')) + ' atualizada' : 'Curva do mês pendente') + '</span></div></article>' +
      '<article><b>2</b><div><strong>Localização verificada</strong><span>' + matrix.checks.length + ' posições ocupadas avaliadas em ' + esc(areaLabel(area)) + '</span></div></article>' +
      '<article><b>3</b><div><strong>Distância ao Picking</strong><span>A na faixa mais próxima · B intermediária · C mais distante</span></div></article>' +
      '<article><b>4</b><div><strong>Adesão ao padrão</strong><span>' + (matrix.rate == null ? 'Sem base suficiente' : pct(matrix.rate)) + ' de aderência física</span></div></article>' +
      '<article><b>5</b><div><strong>Plano de ação</strong><span>' + matrix.actions.length + ' ocorrência(s) priorizada(s) para correção</span></div></article>' +
    '</section>';
  }

  function matrixHtml(area, matrix) {
    const rows = classOrder.map(c => {
      const positions = matrix.candidates.filter(p=>matrix.zoneByKey.get(p.key)===c).map(p=>p.address);
      const preview = positions.slice(0,12).join(', ') + (positions.length>12 ? '…' : '');
      return '<tr><td><strong>Zona ' + c + '</strong></td><td>Curva ' + c + '</td><td>' + (matrix.allocation[c]||0) + '</td><td>' + esc(preview || '—') + '</td></tr>';
    }).join('');
    return '<section class="panel abc-matrix-panel">' +
      '<div class="panel-heading"><div><h2>Matriz de correlação · ' + esc(areaLabel(area)) + '</h2><small>Mais próximo do Picking → A · intermediário → B · mais distante → C</small></div></div>' +
      '<div class="abc-zone-grid">' + classOrder.map(c=>zoneCard(c,matrix)).join('') + '</div>' +
      '<div class="stock-table-wrap"><table><thead><tr><th>Zona</th><th>Curva esperada</th><th>Posições</th><th>Endereços priorizados</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="abc-method-note">Regra da aderência: os endereços físicos são ordenados pela distância ao Picking. A capacidade de cada faixa A/B/C acompanha a necessidade física observada de cada curva; quando não há ocupação suficiente, usa-se a distribuição de SKUs da curva do mês. A classificação ABC usada é sempre a de ' + esc(areaLabel(area)) + '.</p>' +
    '</section>';
  }

  function actionsHtml(matrix) {
    const list = matrix.actions.slice(0,15);
    if (!list.length) {
      return '<section class="panel abc-actions-panel"><div class="panel-heading"><h2>Plano de ação</h2></div><div class="abc-all-good">Nenhum desvio de Curva ABC identificado nas posições ocupadas.</div></section>';
    }
    const rows = list.map((x,i) => {
      const products = x.rows.slice(0,3).map(r => String(r.sku_code || '') + (r.sku_name ? ' · ' + r.sku_name : '')).join(' / ');
      return '<tr><td><strong>' + (i+1) + '</strong></td><td><strong>' + esc(x.address) + '</strong></td><td>Zona ' + esc(x.zone) + '</td><td>' + esc(x.actualClass) + '</td><td>' + statusBadge(x.status) + '</td><td><small>' + esc(products || '—') + '</small></td><td>' + esc(x.suggestion) + '</td></tr>';
    }).join('');
    return '<section class="panel abc-actions-panel">' +
      '<div class="panel-heading"><div><h2>Plano de ação priorizado</h2><small>Prioridade de correção: Curva A distante do Picking; depois B e C fora da faixa correspondente.</small></div></div>' +
      '<div class="stock-table-wrap"><table><thead><tr><th>#</th><th>Endereço</th><th>Zona</th><th>Curva real</th><th>Status</th><th>Produto</th><th>Ação sugerida</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</section>';
  }

  function physicalHtml(area, month, stock, curveItems) {
    if (!stock.snapshot) return '<div class="abc-adherence-empty">Nenhuma fotografia de estoque disponível para cruzar com a Curva ABC.</div>';
    const matrix = matrixForArea(stock,area,curveItems);
    const asOf = stock.snapshot.as_of ? String(stock.snapshot.as_of).split('-').reverse().join('/') : '—';
    const cards =
      '<section class="abc-adherence-kpis">' +
        '<article><span>Aderência ABC</span><strong>' + (matrix.rate==null?'—':pct(matrix.rate)) + '</strong><small>somente posições ocupadas e classificadas</small></article>' +
        '<article><span>Posições corretas</span><strong>' + matrix.adherent + '</strong><small>produto na zona da própria curva</small></article>' +
        '<article><span>Não aderentes</span><strong>' + matrix.non + '</strong><small>realocação recomendada</small></article>' +
        '<article><span>Sem curva</span><strong>' + matrix.unknown + '</strong><small>fora do denominador até classificar</small></article>' +
      '</section>';

    return '<div class="abc-adherence-shell">' +
      '<div class="abc-adherence-intro"><div><p class="eyebrow">ADERÊNCIA AO LAYOUT</p><h2>' + esc(areaLabel(area)) + '</h2><p>Curva ABC de ' + esc(month.split('-').reverse().join('/')) + ' × posição física de ' + esc(asOf) + '. Aderência medida pela distância ao Picking.</p></div><span class="abc-area-rule">Regra: <strong>A próxima · B média · C distante</strong></span></div>' +
      cards +
      evidenceHtml(area,matrix,month) +
      '<div id="abcHistoryPanel"></div>' +
      matrixHtml(area,matrix) +
      actionsHtml(matrix) +
    '</div>';
  }

  function flattenPickingPlan(plan) {
    const slots = [];
    const pushStreet = (group,street,depth) => {
      (street.slots || []).forEach((slot,index) => {
        if (!slot) return;
        slots.push({
          group:group,
          address:String(street.id || group) + '-' + String(index+1),
          curve:slot.curve_class,
          sku:slot.sku_code,
          name:slot.sku_name,
          depth:depth,
          position:index+1
        });
      });
    };

    (plan.flow && plan.flow.items ? plan.flow.items : []).forEach((slot,index) => {
      if (slot) slots.push({group:'Flow Rack',address:'FR-' + String(index+1),curve:slot.curve_class,sku:slot.sku_code,name:slot.sku_name,depth:0,position:index+1});
    });
    (plan.front || []).forEach(s=>pushStreet('Frontal',s,1));
    (plan.main || []).forEach((s,i)=>pushStreet('Ruas',s,2+i));
    (plan.caixaria || []).forEach((s,i)=>pushStreet('Caixaria',s,20+i));
    return slots;
  }

  function pickingDistanceMatrix(plan) {
    const slots = flattenPickingPlan(plan).filter(x=>classOrder.includes(x.curve));
    slots.sort((a,b)=>a.depth-b.depth || a.position-b.position || a.address.localeCompare(b.address,'pt-BR',{numeric:true}));
    const counts={A:0,B:0,C:0};
    slots.forEach(s=>counts[s.curve]++);

    const expected=[];
    classOrder.forEach(c=>{for(let i=0;i<counts[c];i++)expected.push(c);});
    let adherent=0,non=0;
    const checks=slots.map((s,i)=>{
      const zone=expected[i]||'C';
      const ok=s.curve===zone;
      if(ok)adherent++; else non++;
      return Object.assign({},s,{zone:zone,status:ok?'Aderente':'Não aderente'});
    });
    const rate=adherent+non?adherent/(adherent+non)*100:null;
    return {slots,counts,checks,adherent,non,rate,actions:checks.filter(x=>x.status!=='Aderente')};
  }

  function pickingHtml(month, curveItems, data) {
    const plan = data.plan || {};
    const matrix = pickingDistanceMatrix(plan);
    const info = typeof monthInfo === 'function' ? monthInfo(month) : null;
    const curveCounts = curveStats(curveItems).counts;
    const actions = matrix.actions.slice(0,15);

    const actionRows = actions.map((x,i)=>
      '<tr><td><strong>'+(i+1)+'</strong></td><td>'+esc(x.address)+'</td><td>Zona '+esc(x.zone)+'</td><td>Curva '+esc(x.curve)+'</td><td>'+statusBadge(x.status)+'</td><td><small>'+esc(String(x.sku||'')+(x.name?' · '+x.name:''))+'</small></td><td>Reposicionar este SKU para uma vaga compatível com a distância esperada da Curva '+esc(x.curve)+'.</td></tr>'
    ).join('');

    return '<div class="abc-adherence-shell">' +
      '<div class="abc-adherence-intro"><div><p class="eyebrow">ADERÊNCIA ABC POR DISTÂNCIA</p><h2>Picking</h2><p>Aderência calculada pela distância à entrada do Picking: Curva A na frente, B no meio e C no fundo.</p></div><span class="abc-area-rule planned">Referência: <strong>entrada do Picking</strong></span></div>' +
      '<section class="abc-adherence-kpis">' +
        '<article><span>Aderência ABC</span><strong>' + (matrix.rate==null?'—':pct(matrix.rate)) + '</strong><small>posições na faixa correta por distância</small></article>' +
        '<article><span>Posições corretas</span><strong>' + matrix.adherent + '</strong><small>curva compatível com a distância</small></article>' +
        '<article><span>Não aderentes</span><strong>' + matrix.non + '</strong><small>reposicionamento recomendado</small></article>' +
        '<article><span>SKUs ABC</span><strong>' + curveItems.length + '</strong><small>A ' + curveCounts.A + ' · B ' + curveCounts.B + ' · C ' + curveCounts.C + '</small></article>' +
      '</section>' +
      '<section class="panel abc-matrix-panel"><div class="panel-heading"><div><h2>Faixas por distância</h2><small>Entrada do Picking → A · meio → B · fundo → C</small></div></div>' +
        '<div class="abc-zone-grid">' + classOrder.map(c=>'<article class="abc-zone-card zone-'+c.toLowerCase()+'"><div><span>Zona '+c+'</span><strong>'+matrix.counts[c]+' posições</strong></div><small>Curva '+c+'</small><p>Faixa física dimensionada pela quantidade de posições ocupadas por esta curva.</p></article>').join('') + '</div>' +
        '<p class="abc-method-note">A aderência compara a Curva ABC de cada SKU com sua posição no fluxo físico do Picking. Quanto maior o giro, menor deve ser a distância até a entrada/saída operacional.</p>' +
      '</section>' +
      (actions.length
        ? '<section class="panel abc-actions-panel"><div class="panel-heading"><div><h2>Plano de ação priorizado</h2><small>Curva A distante da entrada recebe prioridade de correção.</small></div></div><div class="stock-table-wrap"><table><thead><tr><th>#</th><th>Posição</th><th>Faixa esperada</th><th>Curva real</th><th>Status</th><th>Produto</th><th>Ação sugerida</th></tr></thead><tbody>'+actionRows+'</tbody></table></div></section>'
        : '<section class="panel abc-actions-panel"><div class="panel-heading"><h2>Plano de ação</h2></div><div class="abc-all-good">Nenhum desvio de distância identificado no Picking.</div></section>') +
    '</div>';
  }

  async function render() {
    if (A.mode !== 'adherence') return;
    const root = document.getElementById('abcAdherenceView');
    if (!root || !state.token) return;
    const request = ++A.request;
    const month = state.currentMonth;
    const area = state.currentArea;
    root.innerHTML = '<div class="abc-adherence-loading">Cruzando Curva ABC de ' + esc(areaLabel(area)) + ' com o layout…</div>';
    try {
      const curveItems = await curveData(month,area);
      if (request !== A.request) return;
      if (!curveItems.length) {
        root.innerHTML = '<div class="abc-adherence-empty">Não há Curva ABC calculada para ' + esc(areaLabel(area)) + ' neste mês.</div>';
        return;
      }
      if (area === 'Picking') {
        const picking = await pickingData(month);
        if (request !== A.request) return;
        root.innerHTML = pickingHtml(month,curveItems,picking);
      } else {
        const stock = await stockData(month);
        if (request !== A.request) return;
        root.innerHTML = physicalHtml(area,month,stock,curveItems);
        try { await captureDaily(month,area,stock); } catch (e) { console.warn('Falha ao registrar aderência diária',e); }
      }
      if (request !== A.request) return;
      if (area !== 'Picking') renderHistory(area);
    } catch (e) {
      if (request !== A.request) return;
      root.innerHTML = '<div class="abc-adherence-empty error">' + esc(e.message) + '</div>';
    }
  }

  function setMode(mode) {
    A.mode = mode;
    const abc = document.getElementById('abcView');
    if (!abc) return;
    abc.classList.toggle('abc-adherence-mode',mode==='adherence');
    document.querySelectorAll('[data-abc-subview]').forEach(b=>b.classList.toggle('active',b.dataset.abcSubview===mode));
    const adherence = document.getElementById('abcAdherenceView');
    if (adherence) adherence.classList.toggle('hidden',mode!=='adherence');
    if (mode === 'adherence') {
      document.getElementById('pageTitle').textContent = 'Curva ABC';
      document.getElementById('pageSubtitle').textContent = 'Aderência da Curva ABC pela distância física ao Picking.';
      render();
    } else {
      document.getElementById('pageTitle').textContent = 'Curva ABC';
      document.getElementById('pageSubtitle').textContent = 'Classificação mensal dos SKUs por participação de volume em Hectos.';
    }
  }

  function invalidate() {
    A.stockCache.clear();
    A.pickingCache.clear();
    A.historyCache.clear();
    if (A.mode === 'adherence') render();
  }

  function mount() {
    const abc = document.getElementById('abcView');
    const toolbar = abc && abc.querySelector('.abc-toolbar');
    if (!abc || !toolbar) return setTimeout(mount,100);
    if (document.getElementById('abcSubviewNav')) return;

    const nav = document.createElement('nav');
    nav.id = 'abcSubviewNav';
    nav.className = 'abc-subview-nav';
    nav.setAttribute('aria-label','Visões da Curva ABC');
    nav.innerHTML = '<button type="button" class="active" data-abc-subview="curve">Análise ABC</button><button type="button" data-abc-subview="adherence">Aderência por distância</button>';
    toolbar.insertAdjacentElement('afterend',nav);

    const view = document.createElement('section');
    view.id = 'abcAdherenceView';
    view.className = 'abc-adherence-view hidden';
    nav.insertAdjacentElement('afterend',view);

    nav.querySelectorAll('[data-abc-subview]').forEach(b=>b.onclick=()=>setMode(b.dataset.abcSubview));
    ['monthFilter','areaFilter'].forEach(id=>{
      const el = document.getElementById(id);
      if (el) el.addEventListener('change',()=>setTimeout(()=>{ if(A.mode==='adherence') render(); },0));
    });

    const originalApi = api;
    if (!window.__abcAdherenceApiWrapped) {
      api = async function(action,payload,auth) {
        const result = await originalApi(action,payload,auth);
        if (['import','marketplace_import'].includes(action)) invalidate();
        return result;
      };
      window.__abcAdherenceApiWrapped = true;
    }

    document.querySelector('[data-view="abc"]')?.addEventListener('click',()=>setTimeout(()=>setMode(A.mode),0));
    window.addEventListener('stock-snapshot-updated',()=>{ A.stockCache.clear(); A.historyCache.clear(); if(A.mode==='adherence') render(); });
    window.__abcAdherenceModule = {render:render,setMode:setMode,invalidate:invalidate};
  }

  setTimeout(mount,80);
})();