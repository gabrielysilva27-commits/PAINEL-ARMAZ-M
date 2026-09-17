(() => {
  const API = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const SAMPLE = ['11191','9084','9071','12948','37144','18341','31207','18267','7977','7703'];
  const X = { data:null, month:null, codes:[...SAMPLE], area:'Regulador', stockArea:'', stockQuery:'', busyStock:false, busyFefo:false };
  let corePromise = null;

  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const dt = x => x ? String(x).slice(0,10).split('-').reverse().join('/') : '—';
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const areaName = a => a === 'Regulador' ? 'Estoque geral' : a;
  const canEdit = () => ['admin','conferente'].includes(String(window.state?.user?.role || '').toLowerCase());
  const badge = c => `<span class="stock-badge ${['A','B','C'].includes(c) ? c.toLowerCase() : 'unknown'}">${esc(c || 'Sem curva')}</span>`;
  const rowsHtml = rows => Array.isArray(rows) ? rows.join('') : String(rows || '');
  const table = (heads, rows, cls='') => `<div class="stock-table-wrap ${cls}"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml(rows)}</tbody></table></div>`;

  async function core(){
    if(!corePromise) corePromise = import('./stock-core.js?v=20260917-3');
    return corePromise;
  }
  async function call(action,payload={}){
    const r = await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token || ''},body:JSON.stringify({action,...payload})});
    const d = await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok) throw new Error(d.error || 'Falha ao consultar estoque');
    return d;
  }
  async function load(force=false){
    const month = window.state?.currentMonth;
    if(!month) throw new Error('Mês de referência não disponível.');
    if(!force && X.data && X.month === month) return X.data;
    X.data = await call('get',{month});
    X.month = month;
    return X.data;
  }
  const meta = () => X.data?.snapshot ? `Base ${dt(X.data.snapshot.as_of)} · Curva ABC ${String(X.month || '').split('-').reverse().join('/')}` : 'Nenhuma base importada';

  function injectCss(){
    if(document.querySelector('link[data-stock-enhancements-v2]')) return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='stock-enhancements.css?v=20260917-3';
    link.dataset.stockEnhancementsV2='1';
    document.head.appendChild(link);
  }
  function dialog(title,body){
    document.getElementById('stockEnhanceDialog')?.remove();
    const d=document.createElement('dialog');
    d.id='stockEnhanceDialog';
    d.className='stock-dialog';
    d.innerHTML=`<div class="stock-heading"><h2>${esc(title)}</h2><button class="outline-button" id="stockEnhanceClose">Fechar</button></div>${body}<p class="stock-error" id="stockEnhanceError"></p>`;
    document.body.appendChild(d);
    d.querySelector('#stockEnhanceClose').onclick=()=>d.close();
    d.showModal();
    return d;
  }
  const toast=(msg,err=false)=>{
    if(typeof window.showToast==='function') window.showToast(msg,err);
    else console[err?'error':'log'](msg);
  };

  function detachActions(view){
    const a=view.querySelector('.stock-actions');
    if(a) a.remove();
    return a || null;
  }
  function stockRows(){
    return (X.data?.rows || []).filter(r => r.source_sheet === 'Base Ruas' && (!X.stockArea || r.area === X.stockArea) && (!X.stockQuery || norm([r.address,r.sku_code,r.sku_name,r.received_on,r.expires_on,r.lock,r.fefo_status,r.curve].join(' ')).includes(norm(X.stockQuery))));
  }

  async function renderStock(force=false){
    const view=document.getElementById('stockBaseView');
    if(!view || view.classList.contains('hidden') || X.busyStock) return;
    if(view.dataset.enhancedV2==='1' && !force) return;
    X.busyStock=true;
    try{
      injectCss();
      const actions=detachActions(view);
      await load(force);
      const rows=stockRows();
      const occupied=rows.filter(r=>r.sku_code);
      const history=await call('history',{limit:50}).catch(()=>({items:[]}));
      view.innerHTML=`<div class="stock-module" data-stock-v2>
        <div class="stock-base-top"><span>${esc(meta())} · ${rows.length} linhas exibidas</span><div id="stockV2Actions" class="stock-actions"></div></div>
        <div class="stock-toolbar">
          <label>Área<select id="stockV2Area"><option value="">Todas</option><option value="Regulador" ${X.stockArea==='Regulador'?'selected':''}>Estoque geral</option><option value="Marketplace" ${X.stockArea==='Marketplace'?'selected':''}>Marketplace</option></select></label>
          <label class="stock-search">Pesquisar<input id="stockV2Search" value="${esc(X.stockQuery)}" placeholder="Rua, código, produto, validade, status..."/></label>
        </div>
        <div class="stock-kpis">
          <article><small>Linhas da Base Ruas</small><strong>${rows.length}</strong></article>
          <article><small>Com produto</small><strong>${occupied.length}</strong></article>
          <article><small>Sem validade</small><strong>${occupied.filter(r=>!r.expires_on).length}</strong></article>
          <article><small>Paletes informados</small><strong>${nf.format(occupied.reduce((s,r)=>s+(Number(r.pallets)||0),0))}</strong></article>
        </div>
        ${table(['RUA','CÓDIGO','PRODUTO','CURVA','RECEBIMENTO','VALIDADE','DIAS','QTD. PLT','STATUS','TRAVA-PALETE',''],rows.map(r=>`<tr>
          <td><strong>${esc(r.address)}</strong><small>${esc(areaName(r.area))}</small></td>
          <td>${esc(r.sku_code||'')}</td><td class="stock-product">${esc(r.sku_name||'')}</td><td>${badge(r.curve)}</td>
          <td>${dt(r.received_on)}</td><td>${dt(r.expires_on)}</td><td>${r.days??'—'}</td><td>${r.pallets==null?'—':nf.format(r.pallets)}</td>
          <td>${esc(r.fefo_status||'')}</td><td>${esc(r.lock||'')}</td><td>${canEdit()?`<button class="stock-link" data-v2-edit="${esc(r.id)}">Editar</button>`:''}</td>
        </tr>`),'base-ruas-table')}
        <details class="panel stock-method"><summary>Histórico de alterações por usuário</summary><div class="stock-audit-list">${history.items.length?history.items.map(h=>{const u=h.app_users?.display_name||h.app_users?.username||'Usuário';const action=h.action==='IMPORT'?'Importação':h.action==='BULK_EDIT'?'Edição em lote':h.action==='CONSUME'?'Consumo':'Edição';return `<div class="stock-audit-row"><strong>${esc(u)}</strong><span>${esc(action)} · ${h.changed_count} registro(s)</span><small>${new Date(h.created_at).toLocaleString('pt-BR')} · ${esc(h.note||'')}</small></div>`;}).join(''):'<p class="stock-empty">Nenhuma alteração registrada.</p>'}</div></details>
      </div>`;
      view.dataset.enhancedV2='1';
      if(actions) view.querySelector('#stockV2Actions')?.appendChild(actions);
      view.querySelector('#stockV2Area').onchange=e=>{X.stockArea=e.target.value;view.dataset.enhancedV2='';renderStock(true);};
      let timer;
      view.querySelector('#stockV2Search').oninput=e=>{X.stockQuery=e.target.value;clearTimeout(timer);timer=setTimeout(()=>{view.dataset.enhancedV2='';renderStock(true);},120);};
      view.querySelectorAll('[data-v2-edit]').forEach(b=>b.onclick=()=>openEdit(b.dataset.v2Edit));
    }catch(err){view.innerHTML=`<p class="stock-error">${esc(err.message)}</p>`;view.dataset.enhancedV2='1';}
    finally{X.busyStock=false;}
  }

  function openEdit(id){
    const row=X.data?.rows?.find(r=>String(r.id)===String(id));
    if(!row || !canEdit()) return;
    const d=dialog('Atualizar Base Ruas',`<p><strong>${esc(row.address)}</strong> · ${esc(areaName(row.area))}</p>
      <form id="stockV2Edit" class="stock-form">
        <label>Código<input name="sku_code" value="${esc(row.sku_code||'')}" pattern="[0-9]*"/></label>
        <label>Produto<input name="sku_name" value="${esc(row.sku_name||'')}"/></label>
        <label>Recebimento<input name="received_on" type="date" value="${esc(row.received_on||'')}"/></label>
        <label>Validade<input name="expires_on" type="date" value="${esc(row.expires_on||'')}"/></label>
        <label>Quantidade (PLT)<input name="pallets" type="number" min="0" step="0.01" value="${row.pallets??''}"/></label>
        <label>Trava-palete<input name="lock" value="${esc(row.lock||'')}"/></label>
        <label class="consume-note">Observação<input name="note" placeholder="Ex.: conferência física"/></label>
        <button class="primary-button" type="submit">Salvar alteração</button>
      </form>`);
    const form=d.querySelector('#stockV2Edit');
    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=e.submitter;btn.disabled=true;
      try{
        const v=Object.fromEntries(new FormData(form));
        const pallets=v.pallets===''?null:Number(v.pallets);
        await call('edit_row',{previous_id:X.data.snapshot.id,row_id:id,patch:{sku_code:v.sku_code||null,sku_name:v.sku_name||'',received_on:v.received_on||null,expires_on:v.expires_on||null,pallets,lock:v.lock||'',inventory_confirmed:true},note:v.note||`Atualização ${row.address}`});
        await load(true);d.close();document.getElementById('stockBaseView').dataset.enhancedV2='';await renderStock(true);toast('Base Ruas atualizada e rastreada.');
      }catch(err){d.querySelector('#stockEnhanceError').textContent=err.message;}
      finally{btn.disabled=false;}
    };
  }

  function parseCodes(text){return [...new Set(String(text||'').split(/[\s,;|]+/).map(x=>x.trim()).filter(x=>/^\d+$/.test(x)))];}
  async function sequence(code){
    const c=await core();
    return c.fefoRows(X.data.rows,code,X.area).filter(r=>['Prioridade FEFO','Aguardar lote anterior'].includes(r.fefo_status)&&r.pallets!==0).slice(0,8);
  }

  async function renderFefo(force=false){
    const view=document.getElementById('replenishmentView');
    if(!view || view.classList.contains('hidden') || X.busyFefo) return;
    if(view.dataset.enhancedV2==='1' && !force) return;
    X.busyFefo=true;
    try{
      injectCss();
      const actions=detachActions(view);
      await load(force);
      const c=await core();
      let codes=X.codes.length?X.codes:[...SAMPLE];
      if(codes.length<10) codes=[...codes,...Array(10-codes.length).fill('')];
      const matrixRows=[];
      for(let i=0;i<codes.length;i++){
        const code=codes[i];
        const all=code ? c.fefoRows(X.data.rows,code,X.area) : [];
        const seq=code ? await sequence(code) : [];
        const name=all[0]?.sku_name||'';
        const slots=Array.from({length:8},(_,j)=>{
          const r=seq[j];
          if(!r) return '<td class="fefo-slot empty">—</td>';
          const consume = canEdit() && r.fefo_status==='Prioridade FEFO' && Number(r.pallets)>0 ? `<button class="stock-consume" data-v2-consume="${esc(r.id)}">Consumir</button>` : '';
          return `<td class="fefo-slot"><strong>${esc(r.address)}</strong><small>${dt(r.expires_on)} · ${r.pallets==null?'saldo ?':nf.format(r.pallets)+' PLT'}</small>${consume}</td>`;
        }).join('');
        matrixRows.push(`<tr><td class="fefo-code"><input data-v2-code value="${esc(code)}" inputmode="numeric" aria-label="Código ${i+1}"/></td><td class="fefo-product">${code?`<strong>${esc(name||'Não localizado')}</strong>`:'—'}</td>${slots}</tr>`);
      }
      view.innerHTML=`<div class="stock-module" data-fefo-v2>
        <div class="stock-heading"><div><p class="eyebrow">REABASTECIMENTO DO PICKING</p><h2>Sequência de consumo</h2><p>${esc(meta())}</p></div><div id="fefoV2Actions" class="stock-actions"></div></div>
        <div class="stock-toolbar fefo-toolbar">
          <label>Área de origem<select id="fefoV2Area"><option ${X.area==='Regulador'?'selected':''}>Regulador</option><option ${X.area==='Marketplace'?'selected':''}>Marketplace</option><option ${X.area==='Câmara Fria'?'selected':''}>Câmara Fria</option></select></label>
          <label class="stock-search">Colar códigos<input id="fefoV2Paste" placeholder="Ex.: 11191 9084 9071 12948"/></label>
          <button class="outline-button" id="fefoV2Fill">Preencher lista</button><button class="outline-button" id="fefoV2Sample">Amostra</button><button class="outline-button" id="fefoV2Clear">Limpar</button><button class="primary-button" id="fefoV2Refresh">Atualizar sequência</button>
        </div>
        <p class="stock-help">Visual em matriz como na planilha: cada produto mostra do 1º ao 8º endereço sugerido pelo FEFO. O botão Consumir só aparece em lote que está liberado como prioridade atual.</p>
        ${table(['CÓDIGO','PRODUTO','1º A SER CONSUMIDO','2º A SER CONSUMIDO','3º A SER CONSUMIDO','4º A SER CONSUMIDO','5º A SER CONSUMIDO','6º A SER CONSUMIDO','7º A SER CONSUMIDO','8º A SER CONSUMIDO'],matrixRows,'fefo-matrix')}
        <details class="stock-method"><summary>Critérios de consumo</summary><p>Primeiro vence, primeiro sai. Lotes bloqueados, vencidos, sem validade ou sem saldo não entram na sequência recomendada.</p></details>
      </div>`;
      view.dataset.enhancedV2='1';
      if(actions) view.querySelector('#fefoV2Actions')?.appendChild(actions);
      view.querySelector('#fefoV2Area').onchange=e=>{X.area=e.target.value;view.dataset.enhancedV2='';renderFefo(true);};
      view.querySelector('#fefoV2Fill').onclick=()=>{const codes=parseCodes(view.querySelector('#fefoV2Paste').value);if(codes.length)X.codes=codes.slice(0,50);view.dataset.enhancedV2='';renderFefo(true);};
      view.querySelector('#fefoV2Sample').onclick=()=>{X.codes=[...SAMPLE];view.dataset.enhancedV2='';renderFefo(true);};
      view.querySelector('#fefoV2Clear').onclick=()=>{X.codes=[];view.dataset.enhancedV2='';renderFefo(true);};
      view.querySelector('#fefoV2Refresh').onclick=()=>{X.codes=[...view.querySelectorAll('[data-v2-code]')].map(i=>i.value.trim()).filter(Boolean);view.dataset.enhancedV2='';renderFefo(true);};
      view.querySelectorAll('[data-v2-code]').forEach(i=>i.onkeydown=e=>{if(e.key==='Enter')view.querySelector('#fefoV2Refresh').click();});
      view.querySelectorAll('[data-v2-consume]').forEach(b=>b.onclick=()=>openConsume(b.dataset.v2Consume));
    }catch(err){view.innerHTML=`<p class="stock-error">${esc(err.message)}</p>`;view.dataset.enhancedV2='1';}
    finally{X.busyFefo=false;}
  }

  function openConsume(id){
    const row=X.data?.rows?.find(r=>String(r.id)===String(id));
    if(!row || !canEdit()) return;
    const current=Number(row.pallets);
    if(!Number.isFinite(current) || current<=0){toast('Este endereço está sem saldo informado.',true);return;}
    const d=dialog('Registrar consumo',`<div class="consume-summary"><strong>${esc(row.sku_code)} · ${esc(row.sku_name)}</strong><span>Rua ${esc(row.address)} · validade ${dt(row.expires_on)}</span><b>Saldo atual: ${nf.format(current)} PLT</b></div>
      <form id="stockV2Consume" class="stock-form consume-form">
        <label class="consume-choice"><input type="radio" name="mode" value="all" ${current===1?'checked':''}/> Consumir tudo desta posição</label>
        <label class="consume-choice"><input type="radio" name="mode" value="partial" ${current!==1?'checked':''}/> Consumo parcial</label>
        <label>Quantidade utilizada (PLT)<input name="used" id="stockV2Used" type="number" min="0.01" max="${current}" step="0.01" value="1"/></label>
        <label>Saldo restante<input id="stockV2Remain" disabled/></label>
        <label class="consume-note">Observação<input name="note" placeholder="Opcional"/></label>
        <button class="primary-button" type="submit">Confirmar consumo</button>
      </form>`);
    const form=d.querySelector('#stockV2Consume'),used=d.querySelector('#stockV2Used'),remain=d.querySelector('#stockV2Remain');
    const calc=()=>{const all=form.elements.mode.value==='all';used.disabled=all;const qty=all?current:Number(used.value||0);remain.value=nf.format(Math.max(0,current-(Number.isFinite(qty)?qty:0)));};
    form.querySelectorAll('[name="mode"]').forEach(x=>x.onchange=calc);used.oninput=calc;calc();
    form.onsubmit=async e=>{
      e.preventDefault();const btn=e.submitter;btn.disabled=true;
      try{
        const all=form.elements.mode.value==='all';const qty=all?current:Number(used.value);
        if(!Number.isFinite(qty)||qty<=0||qty>current) throw new Error('Informe uma quantidade válida.');
        const result=await call('consume',{previous_id:X.data.snapshot.id,row_id:id,used:qty,note:form.elements.note.value||`Consumo ${row.sku_code} · ${row.address}`});
        await load(true);d.close();const view=document.getElementById('replenishmentView');if(view)view.dataset.enhancedV2='';await renderFefo(true);toast(`Consumo registrado. Saldo restante: ${nf.format(result.remaining)} PLT.`);
      }catch(err){d.querySelector('#stockEnhanceError').textContent=err.message;}
      finally{btn.disabled=false;}
    };
  }

  function visible(el){return !!el && !el.classList.contains('hidden') && el.offsetParent!==null;}
  function tick(){
    const stock=document.getElementById('stockBaseView');
    const fefo=document.getElementById('replenishmentView');
    if(visible(stock)) renderStock(false);
    if(visible(fefo)) renderFefo(false);
  }

  injectCss();
  setInterval(tick,250);
  window.__stockEnhancementsV2={renderStock,renderFefo,openConsume};
})();