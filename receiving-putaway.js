(() => {
  if (window.__receivingPutaway) return;
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/putaway-api';
  const NRI_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/receiving-nri-api';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fd=v=>{const p=String(v||'').slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'—'};
  const area=a=>a==='Regulador'?'Estoque Geral':a||'—';
  const statusLabel=s=>({planned:'Planejada',in_progress:'Em guarda',awaiting_validation:'Aguardando validação',completed:'Concluída',cancelled:'Cancelada',stored_pending_validation:'Aguardando conferente',validated:'Validado',rejected:'Rejeitado'}[s]||s||'—');
  const token=()=>window.state?.token||localStorage.getItem('pa_session')||'';
  const isAdmin=()=>String(window.state?.user?.role||'').toLowerCase()==='admin';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const monthStart=()=>today().slice(0,8)+'01';
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});

  async function call(action,payload={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':token()},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Erro na operação de descarga/guarda');
    return d;
  }
  async function nriCall(action,payload={}){
    const r=await fetch(NRI_API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':token()},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Erro no recebimento');
    return d;
  }
  function hideViews(){
    document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
    $('sidebar')?.classList.remove('open');
  }
  function shell(){
    return '<div class="put-shell">'+
      '<section class="put-flow">'+
        '<div><p class="eyebrow">FLUXO DE RECEBIMENTO</p><h2>Portaria → Empilhador → Conferente → Guarda</h2><p>O empilhador precisa iniciar a descarga para liberar a carreta na fila de conferência. Depois da conferência, a mesma identidade acompanha a produtividade da descarga e a Ordem de Guarda.</p></div>'+
        '<div class="put-flow-steps"><span>1 · Portaria</span><b>→</b><span class="fork">2 · Descarga</span><b>→</b><span>3 · Conferência</span><b>→</b><span>4 · Guarda</span></div>'+
      '</section>'+
      '<section class="put-panel">'+
        '<div class="put-toolbar"><div><p class="eyebrow">PRODUTIVIDADE DE DESCARGA</p><h2>Empilhadores</h2><p>Carretas e paletes equivalentes atribuídos a quem iniciou a descarga.</p></div><div class="put-filter"><label>De<input id="putProdFrom" type="date" value="'+monthStart()+'"></label><label>Até<input id="putProdTo" type="date" value="'+today()+'"></label><button class="outline-button" id="putProdRefresh">Atualizar</button></div></div>'+
        '<div class="put-table-wrap"><table><thead><tr><th>Empilhador</th><th>Carretas concluídas</th><th>Paletes</th><th>PLT/carreta</th><th>Tempo médio</th><th>Em aberto</th></tr></thead><tbody id="putProdBody"></tbody></table></div>'+
        '<div id="putProdEmpty" class="put-empty hidden">Nenhuma descarga registrada no período.</div>'+
      '</section>'+
      '<section class="put-kpis">'+
        '<article><span>Ordens planejadas</span><strong id="putPlanned">—</strong></article>'+
        '<article><span>Em movimentação</span><strong id="putProgress">—</strong></article>'+
        '<article><span>Aguardando validação</span><strong id="putPending">—</strong></article>'+
        '<article><span>Concluídas</span><strong id="putDone">—</strong></article>'+
      '</section>'+
      '<section class="put-panel">'+
        '<div class="put-toolbar"><div><p class="eyebrow">ENDEREÇAMENTO DIRIGIDO</p><h2>Ordens de Guarda</h2><p>Documento separado da NRI. As posições são sugeridas pela Curva ABC da própria área e pela disponibilidade atual do estoque.</p></div><div><button class="outline-button" id="putRefresh">Atualizar</button></div></div>'+
        '<div class="put-note"><strong>Fluxo da guarda:</strong> conferência finalizada → destino sugerido → empilhador confirma endereço → conferente valida → Estoque x Estoque atualizado.</div>'+
        '<div class="put-table-wrap"><table><thead><tr><th>Ordem</th><th>Recebimento</th><th>Empilhador da descarga</th><th>Status</th><th>Paletes</th><th>Pendentes</th><th>Validados</th><th>Ação</th></tr></thead><tbody id="putBody"></tbody></table></div>'+
        '<div id="putEmpty" class="put-empty hidden">Nenhuma conferência concluída disponível para Ordem de Guarda.</div>'+
      '</section>'+
      (isAdmin()?'<section class="put-panel"><div class="put-toolbar"><div><p class="eyebrow">CADASTRO OPERACIONAL</p><h2>Empilhadores</h2><p>Cada empilhador entra na tela móvel com nome + PIN. O PIN aparece somente quando é criado ou redefinido.</p></div><div class="put-add-operator"><input id="putOperatorName" placeholder="Nome do empilhador"><button class="primary-button" id="putOperatorAdd">+ Cadastrar</button></div></div><div id="putIssuedPin" class="put-pin hidden"></div><div class="put-table-wrap"><table><thead><tr><th>Nome</th><th>PIN</th><th>Status</th><th>Ações</th></tr></thead><tbody id="putOperatorsBody"></tbody></table></div></section>':'')+
      '<dialog id="putDialog" class="put-dialog"><div class="put-dialog-inner"><div class="put-dialog-head"><div><p class="eyebrow">ORDEM DE GUARDA</p><h2 id="putDialogTitle"></h2><p id="putDialogMeta"></p></div><button id="putClose" class="put-close">×</button></div><div class="put-dialog-actions"><button class="outline-button" id="putGuide">Abrir tela do empilhador</button><button class="outline-button" id="putRefreshPlan">Recalcular sugestões</button><button class="primary-button" id="putPrint">Imprimir Ordem de Guarda</button></div><div id="putDialogBody"></div></div></dialog>'+
    '</div>';
  }

  async function open(){
    hideViews();const root=$('receivingPutawayView');root.classList.remove('hidden');
    document.querySelector('[data-view="receiving-putaway"]')?.classList.add('active');
    document.querySelector('.receiving-nav-group')?.classList.add('open');
    $('pageTitle').textContent='Recebimento · Descarga e Guarda';
    $('pageSubtitle').textContent='Produtividade dos empilhadores, endereçamento dirigido e validação no Estoque x Estoque.';
    if(!root.dataset.mounted){
      root.innerHTML=shell();root.dataset.mounted='1';
      $('putRefresh').onclick=loadOrders;
      $('putProdRefresh').onclick=loadProductivity;
      $('putClose').onclick=()=>$('putDialog').close();
      if(isAdmin()){
        $('putOperatorAdd').onclick=addOperator;
      }
    }
    await Promise.all([loadProductivity(),loadOrders(),isAdmin()?loadOperators():Promise.resolve()]);
  }

  async function loadProductivity(){
    const body=$('putProdBody');if(!body)return;
    body.innerHTML='<tr><td colspan="6" class="put-loading">Carregando produtividade...</td></tr>';
    try{
      const d=await call('forklift_productivity',{from:$('putProdFrom').value,to:$('putProdTo').value}),items=d.items||[];
      body.innerHTML=items.map(x=>'<tr><td><strong>'+esc(x.display_name)+'</strong></td><td><strong>'+x.trucks+'</strong></td><td><strong>'+nf.format(x.pallets)+'</strong></td><td>'+nf.format(x.avg_pallets_per_truck)+'</td><td>'+(x.avg_minutes==null?'—':nf.format(x.avg_minutes)+' min')+'</td><td>'+x.open+'</td></tr>').join('');
      $('putProdEmpty').classList.toggle('hidden',items.length>0);
    }catch(e){body.innerHTML='<tr><td colspan="6" class="put-error">'+esc(e.message)+'</td></tr>'}
  }

  async function loadOrders(){
    const body=$('putBody');if(!body)return;
    body.innerHTML='<tr><td colspan="8" class="put-loading">Carregando ordens...</td></tr>';
    try{
      const [o,r]=await Promise.all([call('list_orders'),nriCall('list_receipts',{status:'conference_completed',search:''})]);
      const orders=o.orders||[],byReceipt=new Map(orders.map(x=>[Number(x.receipt_id),x]));
      const receipts=(r.receipts||[]).filter(x=>x.status==='conference_completed'),rows=[];
      for(const rec of receipts){
        const ord=byReceipt.get(Number(rec.id));
        if(ord){
          const c=ord.counts||{},fork=ord.receipt?.operator?.display_name||rec.unload_operator?.display_name||'—';
          rows.push('<tr><td><strong>'+esc(ord.order_code)+'</strong><small>'+fd(ord.created_at)+'</small></td>'+
            '<td><strong>'+esc(rec.display_name||rec.receipt_code)+'</strong><small>'+esc(rec.receipt_code)+' · '+fd(rec.arrival_date)+'</small></td>'+
            '<td>'+esc(fork)+'</td><td><span class="put-status '+esc(ord.status)+'">'+esc(statusLabel(ord.status))+'</span></td>'+
            '<td>'+Number(c.total||0)+'</td><td>'+Number((c.planned||0)+(c.pending||0)+(c.rejected||0))+'</td><td>'+Number(c.validated||0)+'</td>'+
            '<td><button class="outline-button compact" data-open-order="'+ord.id+'">Abrir</button></td></tr>');
        }else{
          rows.push('<tr><td><strong>—</strong></td><td><strong>'+esc(rec.display_name||rec.receipt_code)+'</strong><small>'+esc(rec.receipt_code)+' · '+fd(rec.arrival_date)+'</small></td>'+
            '<td>'+esc(rec.unload_operator?.display_name||'—')+'</td><td><span class="put-status not-created">Não gerada</span></td><td>'+Number(rec.nri_count||0)+'</td><td>—</td><td>—</td>'+
            '<td><button class="primary-button compact" data-generate="'+rec.id+'">Gerar ordem</button></td></tr>');
        }
      }
      body.innerHTML=rows.join('');
      $('putEmpty').classList.toggle('hidden',rows.length>0);
      $('putPlanned').textContent=orders.filter(x=>x.status==='planned').length;
      $('putProgress').textContent=orders.filter(x=>x.status==='in_progress').length;
      $('putPending').textContent=orders.filter(x=>x.status==='awaiting_validation').length;
      $('putDone').textContent=orders.filter(x=>x.status==='completed').length;
      body.querySelectorAll('[data-open-order]').forEach(b=>b.onclick=()=>openOrder(Number(b.dataset.openOrder)));
      body.querySelectorAll('[data-generate]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const d=await call('get_or_create',{receipt_id:Number(b.dataset.generate)});await showOrder(d.order);await loadOrders()}catch(e){showToast(e.message,true)}finally{b.disabled=false}});
    }catch(e){body.innerHTML='<tr><td colspan="8" class="put-error">'+esc(e.message)+'</td></tr>'}
  }

  async function loadOperators(){
    const body=$('putOperatorsBody');if(!body)return;
    try{
      const d=await call('forklift_admin_list'),items=d.operators||[];
      body.innerHTML=items.map(x=>'<tr><td><strong>'+esc(x.display_name)+'</strong></td><td>'+(x.pin_ready?'Configurado':'Pendente')+'</td><td><span class="put-status '+(x.active?'completed':'not-created')+'">'+(x.active?'Ativo':'Inativo')+'</span></td><td><div class="put-row-actions"><button class="outline-button compact" data-reset-pin="'+x.id+'">Redefinir PIN</button><button class="outline-button compact" data-toggle-op="'+x.id+'" data-active="'+(x.active?'0':'1')+'">'+(x.active?'Desativar':'Ativar')+'</button></div></td></tr>').join('');
      if(!items.length)body.innerHTML='<tr><td colspan="4" class="put-empty">Cadastre o primeiro empilhador para liberar a tela de descarga.</td></tr>';
      body.querySelectorAll('[data-reset-pin]').forEach(b=>b.onclick=()=>resetPin(b.dataset.resetPin));
      body.querySelectorAll('[data-toggle-op]').forEach(b=>b.onclick=()=>toggleOperator(b.dataset.toggleOp,b.dataset.active==='1'));
    }catch(e){body.innerHTML='<tr><td colspan="4" class="put-error">'+esc(e.message)+'</td></tr>'}
  }
  function showIssued(op){
    const box=$('putIssuedPin');if(!box)return;
    box.classList.remove('hidden');box.innerHTML='<strong>PIN de '+esc(op.display_name)+': '+esc(op.pin)+'</strong><span>Anote e entregue ao empilhador. Por segurança, este PIN não ficará visível depois.</span>';
  }
  async function addOperator(){
    const name=$('putOperatorName').value.trim();if(!name)return showToast('Informe o nome do empilhador.',true);
    const b=$('putOperatorAdd');b.disabled=true;
    try{const d=await call('forklift_admin_create',{display_name:name});$('putOperatorName').value='';showIssued(d.operator);await loadOperators();showToast('Empilhador cadastrado.')}catch(e){showToast(e.message,true)}finally{b.disabled=false}
  }
  async function resetPin(id){
    if(!confirm('Gerar um novo PIN para este empilhador? O PIN anterior deixará de funcionar.'))return;
    try{const d=await call('forklift_admin_reset_pin',{id});showIssued(d.operator);await loadOperators()}catch(e){showToast(e.message,true)}
  }
  async function toggleOperator(id,active){
    try{await call('forklift_admin_toggle',{id,active});await loadOperators();showToast(active?'Empilhador ativado.':'Empilhador desativado.')}catch(e){showToast(e.message,true)}
  }

  async function openOrder(id){
    try{const d=await call('order',{order_id:id});await showOrder(d.order)}catch(e){showToast(e.message,true)}
  }
  function taskRow(t){
    const areaOptions=['Regulador','Marketplace','Câmara Fria'].map(a=>'<option value="'+a+'" '+(t.area===a?'selected':'')+'>'+area(a)+'</option>').join('');
    const editable=['planned','rejected'].includes(t.status);
    return '<tr><td><strong>'+esc(t.sku_code)+'</strong><small>'+esc(t.sku_name)+'</small></td>'+
      '<td>'+t.pallet_seq+'</td>'+
      '<td>'+(editable?'<select class="put-area-select" data-area-task="'+t.id+'">'+areaOptions+'</select>':'<strong>'+esc(area(t.area))+'</strong>')+'<small>'+esc(t.area_source||'')+'</small></td>'+
      '<td><span class="put-curve '+String(t.curve_class||'').toLowerCase()+'">'+esc(t.curve_class||'Sem curva')+'</span></td>'+
      '<td><strong>'+esc(t.suggested_address||'Definir manualmente')+'</strong><small>Zona '+esc(t.suggested_zone||'—')+' · '+esc(t.suggestion_reason||'')+'</small></td>'+
      '<td><strong>'+esc(t.actual_address||'—')+'</strong><small>'+esc(t.worker_name||'')+'</small></td>'+
      '<td><span class="put-task-status '+esc(t.status)+'">'+esc(statusLabel(t.status))+'</span></td></tr>';
  }
  async function showOrder(order){
    const d=$('putDialog'),receipt=order.receipt||{};
    d.dataset.orderId=order.id;
    $('putDialogTitle').textContent=order.order_code;
    $('putDialogMeta').textContent=(receipt.receipt_code||'')+' · '+(receipt.truck_number||'')+' · '+(receipt.factory_name||'')+' · '+fd(receipt.arrival_date);
    const tasks=order.tasks||[],pending=tasks.filter(x=>x.status==='stored_pending_validation').length,valid=tasks.filter(x=>x.status==='validated').length;
    $('putDialogBody').innerHTML='<div class="put-summary"><article><span>Status</span><strong>'+esc(statusLabel(order.status))+'</strong></article><article><span>Paletes</span><strong>'+tasks.length+'</strong></article><article><span>Aguardando conferente</span><strong>'+pending+'</strong></article><article><span>Validados no estoque</span><strong>'+valid+'</strong></article></div>'+
      '<div class="put-note"><strong>NRI preservada:</strong> esta Ordem de Guarda é um documento operacional separado. Nenhum campo ou impressão da NRI é alterado.</div>'+
      '<div class="put-table-wrap"><table><thead><tr><th>Produto</th><th>Palete</th><th>Área</th><th>Curva</th><th>Destino sugerido</th><th>Guardado em</th><th>Status</th></tr></thead><tbody>'+tasks.map(taskRow).join('')+'</tbody></table></div>';
    $('putGuide').onclick=()=>window.open(order.public_url,'_blank','noopener,noreferrer');
    $('putPrint').onclick=()=>printOrder(order);
    const canRefresh=!tasks.some(x=>['stored_pending_validation','validated'].includes(x.status));
    $('putRefreshPlan').disabled=!canRefresh;
    $('putRefreshPlan').onclick=async()=>{if(!confirm('Recalcular todas as sugestões usando o estoque atual?'))return;try{const x=await call('refresh_plan',{order_id:order.id});await showOrder(x.order);showToast('Sugestões recalculadas.')}catch(e){showToast(e.message,true)}};
    $('putDialogBody').querySelectorAll('[data-area-task]').forEach(sel=>sel.onchange=async()=>{sel.disabled=true;try{const x=await call('set_task_area',{order_id:order.id,task_id:sel.dataset.areaTask,area:sel.value});await showOrder(x.order)}catch(e){showToast(e.message,true);sel.disabled=false}});
    d.showModal();
  }

  function printOrder(order){
    const receipt=order.receipt||{},tasks=order.tasks||[];
    const rows=tasks.map(t=>'<tr><td>'+esc(t.sku_code)+'<br><small>'+esc(t.sku_name)+'</small></td><td>'+t.pallet_seq+'</td><td>'+esc(area(t.area))+'</td><td>'+esc(t.curve_class||'—')+'</td><td><strong>'+esc(t.suggested_address||'DEFINIR')+'</strong><br><small>Zona '+esc(t.suggested_zone||'—')+'</small></td><td></td><td></td></tr>').join('');
    const html='<!doctype html><html><head><meta charset="utf-8"><title>'+esc(order.order_code)+'</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial,sans-serif;color:#111;font-size:10pt}h1{font-size:18pt;margin:0 0 4mm}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:2mm 8mm;margin-bottom:5mm}.meta div{border-bottom:1px solid #bbb;padding:2mm 0}.notice{border:1px solid #999;padding:3mm;margin:4mm 0;font-size:9pt}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:2.2mm;text-align:left;vertical-align:top}th{background:#eee;font-size:8pt;text-transform:uppercase}td{font-size:9pt}small{font-size:7.5pt}.sign{margin-top:7mm;display:grid;grid-template-columns:1fr 1fr;gap:12mm}.sign div{border-top:1px solid #444;padding-top:2mm;text-align:center}.link{font-size:7pt;word-break:break-all;margin-top:5mm}</style></head><body><h1>ORDEM DE GUARDA · '+esc(order.order_code)+'</h1>'+
      '<div class="meta"><div><b>Recebimento:</b> '+esc(receipt.receipt_code||'—')+'</div><div><b>Data:</b> '+fd(receipt.arrival_date)+'</div><div><b>Carreta:</b> '+esc(receipt.truck_number||'—')+' · '+esc(receipt.plate||'—')+'</div><div><b>Origem:</b> '+esc(receipt.factory_name||'—')+'</div></div>'+
      '<div class="notice"><b>Documento separado da NRI.</b> O empilhador deve guardar o palete no endereço sugerido ou registrar o endereço real. O Estoque x Estoque só é alterado depois da validação do conferente.</div>'+
      '<table><thead><tr><th>Produto</th><th>Palete</th><th>Área</th><th>Curva</th><th>Destino sugerido</th><th>Endereço real</th><th>Visto</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div class="sign"><div>Empilhador</div><div>Conferente</div></div><div class="link"><b>Tela do empilhador:</b> '+esc(order.public_url)+'</div></body></html>';
    const w=window.open('','_blank','width=900,height=700');if(!w)return showToast('O navegador bloqueou a janela de impressão.',true);
    w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{w.focus();w.print()},250);
  }

  window.__receivingPutaway={open};
})();