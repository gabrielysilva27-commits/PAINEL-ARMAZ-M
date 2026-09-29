(() => {
  if (window.__abcAdherenceModule) return;

  const STOCK_API = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const ADHERENCE_API = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/abc-adherence-api';
  const A = { mode: 'curve', stockCache: new Map(), historyCache: new Map(), curveBundleCache: new Map(), monthlyCaptured: new Set(), request: 0 };

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = value => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value) + '%' : '—';
  const compact = value => String(value || '').trim().toUpperCase().replace(/^([A-Z]+)0+(\d)/,'$1$2').replace(/[^A-Z0-9]/g,'');
  const areaLabel = area => area === 'Regulador' ? 'Estoque Geral' : area;
  const classOrder = ['A','B','C'];
  const GUARAVITA_SKU = '22209';

  // Regra física do Estoque Geral:
  // - prateleiras: ruas A/B/C/G com lado -A/-B;
  // - Curva A vai para rua fechada, exceto Guaravita 22209;
  // - Curvas B/C usam prateleiras;
  // - Guaravita 22209 usa prateleira mesmo sendo Curva A, por fragilidade/empilhamento.
  const isShelfAddress = address => /^[ABCG]\d{1,3}-[AB]$/i.test(String(address || '').trim());
  const storageCompatible = (area,address,sku,curve) => {
    if (area !== 'Regulador') return true;
    const shelf = isShelfAddress(address);
    const code = String(sku || '');
    if (code === GUARAVITA_SKU) return shelf;
    if (curve === 'A') return !shelf;
    if (curve === 'B' || curve === 'C') return shelf;
    return true;
  };

  // Pegada física do Picking no croqui do Regulador.
  // Limites convertidos do retângulo real indicado no mapa para a mesma malha col/row dos endereços.
  const REGULADOR_PICKING_RECT = { minX: 74, maxX: 99, minY: 16, maxY: 50 };

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

  async function monthCurveData(month) {
    if (A.curveBundleCache.has(month)) return A.curveBundleCache.get(month);
    const data = await api('month_bundle',{month:month});
    const items = [];
    Object.keys(data.areas || {}).forEach(area => {
      (data.areas[area] || []).forEach(x => items.push(Object.assign({area:area},x)));
    });
    A.curveBundleCache.set(month,items);
    return items;
  }

  async function historyData(area, force=false) {
    if (!force && A.historyCache.has(area)) return A.historyCache.get(area);
    const data = await post(ADHERENCE_API,'history',{area:area});
    const items = data.items || [];
    A.historyCache.set(area,items);
    return items;
  }

  async function captureMonthly(stock) {
    if (!stock?.snapshot?.as_of) return null;
    const month = String(stock.snapshot.as_of).slice(0,7);
    const key = month + '|' + String(stock.snapshot.id || stock.snapshot.as_of);
    if (A.monthlyCaptured.has(key)) return null;
    const data = await post(ADHERENCE_API,'capture_all',{month:month});
    A.monthlyCaptured.add(key);
    ['Regulador','Marketplace','Câmara Fria'].forEach(area=>A.historyCache.delete(area));
    return data.items || [];
  }

  const monthLabel = value => {
    const key = String(value || '').slice(0,7);
    const labels = { '01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez' };
    return (labels[key.slice(5,7)] || key.slice(5,7)) + '/' + key.slice(0,4);
  };

  function historyPanelHtml(area, items) {
    const rows = (items || []).map(item => {
      const month = String(item.reference_month || '').slice(0,7);
      const value = item.rate == null ? null : Number(item.rate);
      return '<tr class="'+(month===state.currentMonth?'current':'')+'"><td><strong>'+esc(monthLabel(month))+'</strong></td><td class="abc-rate-cell">'+(Number.isFinite(value)?pct(value):'—')+'</td></tr>';
    }).join('');

    return '<section class="panel abc-history-panel">' +
      '<div class="panel-heading"><h2>Resultado mensal</h2></div>' +
      '<div class="stock-table-wrap"><table><thead><tr><th>Mês</th><th>Aderência</th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
    '</section>';
  }

  async function renderHistory(area) {
    const host = document.getElementById('abcHistoryPanel');
    if (!host) return;
    host.innerHTML = '<div class="abc-history-loading">Carregando resultados…</div>';
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

  function distanceToRect(x, y, rect) {
    const dx = x < rect.minX ? rect.minX - x : x > rect.maxX ? x - rect.maxX : 0;
    const dy = y < rect.minY ? rect.minY - y : y > rect.maxY ? y - rect.maxY : 0;
    return Math.hypot(dx,dy);
  }

  function pickingReferencePoints(stock, area, candidates) {
    // Marketplace mantém sua referência própria porque usa outra malha física.
    const byKey = new Map(candidates.map(c => [c.key,c]));
    const target = stock.snapshot && stock.snapshot.payload && stock.snapshot.payload.targets
      ? stock.snapshot.payload.targets[area]
      : null;
    const mapped = [];
    (target && target.monitored ? target.monitored : []).forEach(m => {
      const c = byKey.get(compact(m.address));
      if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) mapped.push({x:c.x,y:c.y});
    });
    if (mapped.length) return mapped;

    const positioned = candidates.filter(c=>Number.isFinite(c.x)&&Number.isFinite(c.y));
    if (!positioned.length) return [];
    const edgeY = Math.min(...positioned.map(c=>c.y));
    return positioned.filter(c=>Math.abs(c.y-edgeY)<0.001).map(c=>({x:c.x,y:c.y}));
  }

  function rankCandidates(stock, area, candidates) {
    const refs = area === 'Regulador' ? [] : pickingReferencePoints(stock,area,candidates);
    const positioned = candidates.filter(c=>Number.isFinite(c.x)&&Number.isFinite(c.y));
    const fallbackY = positioned.length ? Math.min(...positioned.map(c=>c.y)) : 0;

    const withScore = candidates.map((c,index) => {
      let distance;
      if (Number.isFinite(c.x) && Number.isFinite(c.y) && area === 'Regulador') {
        distance = distanceToRect(c.x,c.y,REGULADOR_PICKING_RECT);
      } else if (Number.isFinite(c.x) && Number.isFinite(c.y) && refs.length) {
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
      basis:area === 'Regulador' ? 'distância ao perímetro físico do Picking' : 'distância física ao Picking'
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

  function actualLocationData(stock, area, curveItems, allCurveItems) {
    const curveMap = new Map(curveItems.map(x => [String(x.sku_code || ''),x.curve_class]));
    const bySku = new Map();
    (allCurveItems || []).forEach(x => {
      const code = String(x.sku_code || '');
      if (!code || !classOrder.includes(x.curve_class)) return;
      if (!bySku.has(code)) bySku.set(code,[]);
      bySku.get(code).push(x);
    });

    const fallbackOrder = area === 'Regulador'
      ? ['Marketplace','Câmara Fria','Picking']
      : area === 'Marketplace'
        ? ['Regulador','Câmara Fria','Picking']
        : ['Regulador','Marketplace','Picking'];

    const resolveCurve = code => {
      const direct = curveMap.get(code);
      if (classOrder.includes(direct)) return direct;
      const rows = bySku.get(code) || [];
      for (const preferred of fallbackOrder) {
        const found = rows.find(x => x.area === preferred && classOrder.includes(x.curve_class));
        if (found) return found.curve_class;
      }
      const any = rows.find(x => classOrder.includes(x.curve_class));
      if (any) return any.curve_class;
      // SKU físico sem giro na janela da Curva ABC: operacionalmente é Curva C.
      return 'C';
    };

    const locations = new Map();
    const demand = {A:0,B:0,C:0};

    (stock.locations || []).filter(l => l.area === area).forEach(loc => {
      const rows = (loc.rows || []).filter(r => r.sku_code && r.pallets !== 0);
      if (!rows.length) {
        locations.set(compact(loc.address),{address:loc.address,occupied:false,classes:[],rows:[]});
        return;
      }
      const resolvedRows = rows.map(r => Object.assign({},r,{_curve:resolveCurve(String(r.sku_code || ''))}));
      const classes = resolvedRows.map(r => r._curve).filter(c=>classOrder.includes(c));
      const unique = [...new Set(classes)];
      const highest = classOrder.find(c => unique.includes(c));
      if (highest) demand[highest]++;
      locations.set(compact(loc.address),{
        address:loc.address,
        occupied:true,
        classes:unique,
        rows:resolvedRows
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

  function matrixForArea(stock, area, curveItems, allCurveItems) {
    const candidates = physicalCandidates(stock,area);
    const ranked = rankCandidates(stock,area,candidates);
    const stats = curveStats(curveItems);
    const actual = actualLocationData(stock,area,curveItems,allCurveItems);

    if (area === 'Câmara Fria') {
      const zoneByKey = new Map();
      ranked.items.forEach(p=>zoneByKey.set(p.key,'A'));
      const checks = [];
      const occupiedKeys = new Set();
      actual.locations.forEach((loc,key) => {
        if (!loc.occupied) return;
        occupiedKeys.add(key);
        const actualClass = loc.classes.length === 1 ? loc.classes[0] : (loc.classes.length ? loc.classes.join('/') : 'C');
        const status = actualClass === 'A' ? 'Aderente' : 'Não aderente';
        checks.push({key:key,address:loc.address,zone:'A',actualClass:actualClass,status:status,rows:loc.rows});
      });
      const adherent = checks.filter(x=>x.status==='Aderente').length;
      const non = checks.filter(x=>x.status==='Não aderente').length;
      const unknown = 0;
      return {
        candidates:ranked.items,
        basis:'Câmara Fria dedicada ao SKU 838 · Curva A',
        allocation:{A:ranked.items.length,B:0,C:0,base:{A:ranked.items.length,B:0,C:0}},
        zoneByKey:zoneByKey,
        stats:stats,
        actual:actual,
        checks:checks,
        empty:ranked.items.filter(p=>!occupiedKeys.has(p.key)),
        adherent:adherent,
        non:non,
        unknown:unknown,
        rate:adherent + non ? adherent/(adherent+non)*100 : null,
        actions:checks.filter(x=>x.status!=='Aderente').map(x=>Object.assign({},x,{suggestion:'Manter somente o SKU 838 nas posições da Câmara Fria.',severity:100}))
      };
    }

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
      const structureOk = area !== 'Regulador' || loc.rows.every(r =>
        storageCompatible(area,loc.address,r.sku_code,r._curve || 'C')
      );
      if (loc.classes.length === 1) {
        actualClass = loc.classes[0];
        status = loc.classes[0] === zone && structureOk ? 'Aderente' : 'Não aderente';
      } else if (!loc.classes.length) {
        actualClass = 'C';
        status = zone === 'C' && structureOk ? 'Aderente' : 'Não aderente';
      }
      checks.push({
        key:key,address:loc.address,zone:zone,actualClass:actualClass,status:status,rows:loc.rows,structureOk:structureOk
      });
    });

    const empty = ranked.items.filter(p => !occupiedKeys.has(p.key));

    const adherent = checks.filter(x=>x.status==='Aderente').length;
    const non = checks.filter(x=>x.status==='Não aderente').length;
    const unknown = 0;
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
      const guaravitaOnly = x.rows.length > 0 && x.rows.every(r => String(r.sku_code || '') === GUARAVITA_SKU);
      if (desired) {
        const compatible = empty.filter(p => {
          if (zoneByKey.get(p.key) !== desired) return false;
          if (area !== 'Regulador') return true;
          if (guaravitaOnly) return isShelfAddress(p.address);
          if (desired === 'A') return !isShelfAddress(p.address);
          return isShelfAddress(p.address);
        });
        const free = compatible[0];
        if (free) {
          suggestion = 'Mover para ' + free.address + ' (Faixa ' + desired + ').';
        } else if (area === 'Regulador' && guaravitaOnly) {
          suggestion = 'Mover para uma prateleira da Faixa A.';
        } else if (area === 'Regulador' && desired === 'A') {
          suggestion = 'Mover para uma rua fechada da Faixa A.';
        } else if (area === 'Regulador') {
          suggestion = 'Mover para uma prateleira da Faixa ' + desired + '.';
        } else {
          suggestion = 'Mover para uma posição da Faixa ' + desired + '.';
        }
      } else {
        suggestion = area === 'Regulador'
          ? 'Separar os produtos respeitando rua fechada para A e prateleira para B/C.'
          : 'Separar os produtos e mover cada SKU para a faixa da sua curva.';
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
    const cls = status === 'Aderente' ? 'ok' : 'bad';
    return '<span class="abc-status ' + cls + '">' + esc(status) + '</span>';
  }

  function evidenceHtml(area, matrix, month) {
    const info = typeof monthInfo === 'function' ? monthInfo(month) : null;
    const updated = info && info.status === 'imported';
    const ruleText = area === 'Câmara Fria'
      ? 'Câmara Fria dedicada ao SKU 838 · Curva A'
      : 'A na faixa mais próxima · B intermediária · C mais distante';
    return '<section class="abc-audit-evidence">' +
      '<article><b>1</b><div><strong>Atualização ABC</strong><span>' + (updated ? 'Curva ' + esc(month.split('-').reverse().join('/')) + ' atualizada' : 'Curva do mês pendente') + '</span></div></article>' +
      '<article><b>2</b><div><strong>Localização verificada</strong><span>' + matrix.checks.length + ' posições ocupadas avaliadas em ' + esc(areaLabel(area)) + '</span></div></article>' +
      '<article><b>3</b><div><strong>' + (area === 'Câmara Fria' ? 'Regra da Câmara Fria' : 'Distância ao Picking') + '</strong><span>' + ruleText + '</span></div></article>' +
      '<article><b>4</b><div><strong>Adesão ao padrão</strong><span>' + (matrix.rate == null ? 'Sem base suficiente' : pct(matrix.rate)) + ' de aderência física</span></div></article>' +
      '<article><b>5</b><div><strong>Plano de ação</strong><span>' + matrix.actions.length + ' ocorrência(s) priorizada(s) para correção</span></div></article>' +
    '</section>';
  }

  function matrixHtml(area, matrix) {
    if (area === 'Câmara Fria') {
      return '<section class="panel abc-matrix-panel abc-cold-room-card">' +
        '<div class="panel-heading"><h2>Distribuição da curva</h2></div>' +
        '<div class="abc-cold-room-line"><span class="abc-zone-dot zone-a"></span><strong>Curva A</strong><span>SKU 838 · ' + matrix.candidates.length + ' posições</span><b>100%</b></div>' +
      '</section>';
    }

    return '<section class="panel abc-matrix-panel">' +
      '<div class="panel-heading"><h2>Distribuição física</h2></div>' +
      '<div class="abc-zone-grid">' + classOrder.map(c => {
        const positions = matrix.candidates.filter(p=>matrix.zoneByKey.get(p.key)===c).map(p=>p.address);
        const preview = positions.slice(0,8).join(' · ') + (positions.length>8 ? ' …' : '');
        return '<article class="abc-zone-card zone-'+c.toLowerCase()+'"><div class="abc-zone-head"><span>Curva '+c+'</span><strong>'+(matrix.allocation[c]||0)+'</strong></div><small>'+esc(preview || 'Sem posições')+'</small></article>';
      }).join('') + '</div>' +
    '</section>';
  }

  function actionsHtml(matrix) {
    const list = matrix.actions.slice(0,12);
    if (!list.length) {
      return '<section class="panel abc-actions-panel"><div class="panel-heading"><h2>Ajustes</h2></div><div class="abc-all-good">Nenhum ajuste prioritário.</div></section>';
    }
    const rows = list.map(x => {
      const products = x.rows.slice(0,2).map(r => String(r.sku_code || '') + (r.sku_name ? ' · ' + r.sku_name : '')).join(' / ');
      return '<tr><td><strong>' + esc(x.address) + '</strong></td><td><span class="abc-curve-pill curve-'+String(x.actualClass||'').charAt(0).toLowerCase()+'">'+esc(x.actualClass)+'</span></td><td>Faixa '+esc(x.zone)+'</td><td><small>' + esc(products || '—') + '</small></td><td>' + esc(x.suggestion) + '</td></tr>';
    }).join('');
    return '<section class="panel abc-actions-panel">' +
      '<div class="panel-heading"><div><h2>Ajustes prioritários</h2><small>'+matrix.actions.length+' desvio'+(matrix.actions.length===1?'':'s')+'</small></div></div>' +
      '<div class="stock-table-wrap"><table><thead><tr><th>Endereço</th><th>Curva do produto</th><th>Faixa atual</th><th>Produto</th><th>Ação</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</section>';
  }

  function physicalHtml(area, month, stock, curveItems, allCurveItems) {
    if (!stock.snapshot) return '<div class="abc-adherence-empty">Nenhuma posição de estoque disponível para este período.</div>';
    const matrix = matrixForArea(stock,area,curveItems,allCurveItems);
    const asOf = stock.snapshot.as_of ? String(stock.snapshot.as_of).split('-').reverse().join('/') : '—';
    const reference = monthLabel(month);
    const evaluated = matrix.checks.length;

    return '<div class="abc-adherence-shell">' +
      '<section class="abc-adherence-intro">' +
        '<div><h2>' + esc(areaLabel(area)) + '</h2><p>' + esc(reference) + ' · posição de ' + esc(asOf) + ' · ' + evaluated + ' posições avaliadas</p></div>' +
        '<span class="abc-area-rule">' + (area === 'Câmara Fria' ? '<strong>838 · Curva A</strong>' : '<strong>A</strong> próxima&nbsp;&nbsp; <strong>B</strong> média&nbsp;&nbsp; <strong>C</strong> distante') + '</span>' +
      '</section>' +
      '<section class="abc-adherence-kpis">' +
        '<article class="abc-kpi-primary"><span>Aderência</span><strong>' + (matrix.rate==null?'—':pct(matrix.rate)) + '</strong></article>' +
        '<article><span>Corretas</span><strong>' + matrix.adherent + '</strong></article>' +
        '<article class="abc-kpi-alert"><span>Desvios</span><strong>' + matrix.non + '</strong></article>' +
      '</section>' +
      '<div id="abcHistoryPanel"></div>' +
      matrixHtml(area,matrix) +
      actionsHtml(matrix) +
    '</div>';
  }

  function pickingHtml(month, curveItems) {
    const counts = curveStats(curveItems).counts;
    return '<div class="abc-adherence-shell">' +
      '<section class="abc-adherence-intro">' +
        '<div><h2>Picking</h2><p>'+esc(monthLabel(month))+'</p></div>' +
        '<span class="abc-area-rule"><strong>100% aderente</strong></span>' +
      '</section>' +
      '<section class="abc-adherence-kpis">' +
        '<article class="abc-kpi-primary"><span>Aderência</span><strong>100%</strong></article>' +
        '<article><span>Desvios</span><strong>0</strong></article>' +
        '<article><span>SKUs</span><strong>'+curveItems.length+'</strong></article>' +
      '</section>' +
      '<div id="abcHistoryPanel"></div>' +
      '<section class="panel abc-matrix-panel"><div class="panel-heading"><h2>Distribuição da curva</h2></div>' +
        '<div class="abc-zone-grid">' + classOrder.map(c=>'<article class="abc-zone-card zone-'+c.toLowerCase()+'"><div class="abc-zone-head"><span>Curva '+c+'</span><strong>'+counts[c]+'</strong></div></article>').join('') + '</div>' +
      '</section>' +
    '</div>';
  }

  async function render() {
    if (A.mode !== 'adherence') return;
    const root = document.getElementById('abcAdherenceView');
    if (!root || !state.token) return;
    const request = ++A.request;
    const month = state.currentMonth;
    const area = state.currentArea;
    root.innerHTML = '<div class="abc-adherence-loading">Carregando aderência…</div>';
    try {
      const curveItems = await curveData(month,area);
      if (request !== A.request) return;
      if (!curveItems.length) {
        root.innerHTML = '<div class="abc-adherence-empty">Não há Curva ABC calculada para ' + esc(areaLabel(area)) + ' neste mês.</div>';
        return;
      }
      if (area === 'Picking') {
        root.innerHTML = pickingHtml(month,curveItems);
      } else {
        const [stock,allCurveItems] = await Promise.all([stockData(month),monthCurveData(month)]);
        if (request !== A.request) return;
        root.innerHTML = physicalHtml(area,month,stock,curveItems,allCurveItems);
        try { await captureMonthly(stock); } catch (e) { console.warn('Falha ao registrar resultado mensal',e); }
      }
      if (request !== A.request) return;
      renderHistory(area);
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
      document.getElementById('pageSubtitle').textContent = 'Posicionamento dos SKUs conforme a Curva ABC.';
      render();
    } else {
      document.getElementById('pageTitle').textContent = 'Curva ABC';
      document.getElementById('pageSubtitle').textContent = 'Classificação mensal dos SKUs por participação de volume em Hectos.';
    }
  }

  function invalidate() {
    A.stockCache.clear();
    A.historyCache.clear();
    A.curveBundleCache.clear();
    A.monthlyCaptured.clear();
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
    nav.innerHTML = '<button type="button" class="active" data-abc-subview="curve">Análise ABC</button><button type="button" data-abc-subview="adherence">Aderência da Curva</button>';
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
    window.addEventListener('stock-snapshot-updated',()=>{ A.stockCache.clear(); A.historyCache.clear(); A.monthlyCaptured.clear(); if(A.mode==='adherence') render(); });
    window.__abcAdherenceModule = {render:render,setMode:setMode,invalidate:invalidate};
  }

  setTimeout(mount,80);
})();