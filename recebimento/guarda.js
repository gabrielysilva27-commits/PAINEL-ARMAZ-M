(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/putaway-api';
  const $=id=>document.getElementById(id);
  const orderToken=new URLSearchParams(location.search).get('token')||'';
  let session=sessionStorage.getItem('forklift_token')||'',operator=null,order=null,poll=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fd=v=>{const p=String(v||'').slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'—'};
  const ft=v=>String(v||'').slice(0,5)||'—';
  const area=a=>a==='Regulador'?'Estoque Geral':a||'—';
  const label=s=>({pending:'Aguardando empilhador',in_progress:'Descarga iniciada',completed:'Descarga concluída',awaiting_conference:'Aguardando conferência',in_conference:'Em conferência',conference_completed:'Conferência concluída',planned:'A guardar',stored_pending_validation:'Aguardando conferente',validated:'Validado',rejected:'Rejeitado'}[s]||s||'—');

  async function call(action,payload={},auth=true){
    const headers={'Content-Type':'application/json'};if(auth&&session)headers['x-forklift-token']=session;
    const r=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Falha na operação');
    return d;
  }
  function toast(msg,error=false){const t=$('toast');t.textContent=msg;t.classList.toggle('error',error);t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),2800)}
  function show(id){['loginView','homeView','orderView'].forEach(x=>$(x).classList.toggle('hidden',x!==id))}
  function logout(){
    if(session)call('forklift_logout',{},true).catch(()=>{});
    session='';operator=null;order=null;sessionStorage.removeItem('forklift_token');clearInterval(poll);poll=null;show('loginView');loadOperators();
  }

  async function loadOperators(){
    try{
      const d=await call('forklift_users',{},false),items=d.operators||[];
      $('operatorSelect').innerHTML='<option value="">Selecione...</option>'+items.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.display_name)+'</option>').join('');
      $('loginError').textContent=items.length?'':'Nenhum empilhador cadastrado. Solicite o cadastro no painel Recebimento → Guarda.';
    }catch(e){$('loginError').textContent=e.message}
  }
  async function restore(){
    if(!session)return show('loginView');
    try{const d=await call('forklift_session');operator=d.operator;enter()}catch{session='';sessionStorage.removeItem('forklift_token');show('loginView');loadOperators()}
  }
  $('loginForm').onsubmit=async e=>{
    e.preventDefault();$('loginError').textContent='';const b=$('loginButton');b.disabled=true;
    try{
      const d=await call('forklift_login',{operator_id:$('operatorSelect').value,pin:$('pinInput').value},false);
      session=d.token;operator=d.operator;sessionStorage.setItem('forklift_token',session);$('pinInput').value='';enter();
    }catch(err){$('loginError').textContent=err.message}finally{b.disabled=false}
  };
  function enter(){
    $('loggedName').textContent='Empilhador: '+operator.display_name;show('homeView');refreshAll();
    if(orderToken)openOrderToken(orderToken);
    clearInterval(poll);poll=setInterval(()=>{if(!$('homeView').classList.contains('hidden'))refreshAll(false)},30000);
  }
  async function refreshAll(showErrors=true){
    try{await Promise.all([loadQueue(),loadOrders()])}catch(e){if(showErrors)toast(e.message,true)}
  }
  async function loadQueue(){
    const d=await call('forklift_queue'),rows=d.receipts||[];
    const mine=rows.filter(x=>x.unload_operator_id===operator.id),waiting=rows.filter(x=>x.unload_status==='pending');
    $('queueSummary').innerHTML='<article><span>Aguardando início</span><strong>'+waiting.length+'</strong></article><article><span>Minhas descargas</span><strong>'+mine.filter(x=>x.unload_status==='in_progress').length+'</strong></article><article><span>Liberadas à conferência</span><strong>'+mine.filter(x=>x.unload_started_at).length+'</strong></article>';
    $('unloadList').innerHTML=rows.length?rows.map(unloadCard).join(''):'<div class="empty">Nenhuma carreta aguardando início de descarga.</div>';
    $('unloadList').querySelectorAll('[data-start-unload]').forEach(b=>b.onclick=()=>startUnload(Number(b.dataset.startUnload),b));
    $('unloadList').querySelectorAll('[data-finish-unload]').forEach(b=>b.onclick=()=>finishUnload(Number(b.dataset.finishUnload),b));
  }
  function unloadCard(r){
    const mine=r.unload_operator_id===operator.id,assigned=r.unload_operator?.display_name||r.operator?.display_name||'';
    let actions='';
    if(r.unload_status==='pending')actions='<button class="primary" data-start-unload="'+r.id+'">Iniciar descarga</button>';
    else if(mine&&r.unload_status==='in_progress')actions='<button class="secondary" data-finish-unload="'+r.id+'">Finalizar descarga</button>';
    const status=r.unload_status==='pending'?'pending':r.unload_status;
    return '<article class="task-card"><div class="task-head"><div><div class="task-title">'+esc(r.truck_number)+' · '+esc(r.factory_name)+'</div><div class="task-meta"><span>Placa '+esc(r.plate||'—')+'</span><span>Chegada '+fd(r.arrival_date)+' '+ft(r.arrival_time)+'</span><span>'+esc(r.receipt_code)+'</span><span>Conferência: '+esc(label(r.status))+'</span></div></div><span class="badge '+esc(status)+'">'+esc(label(status))+'</span></div>'+
      (assigned?'<div class="task-state">Responsável pela descarga: <strong>'+esc(assigned)+'</strong>'+(r.unload_started_at?' · início '+new Date(r.unload_started_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</div>':'')+
      (actions?'<div class="task-actions">'+actions+'</div>':'')+'</article>';
  }
  async function startUnload(id,button){
    button.disabled=true;
    try{await call('forklift_start_unload',{receipt_id:id});toast('Descarga iniciada. A carreta foi liberada para o conferente.');await loadQueue()}catch(e){toast(e.message,true);button.disabled=false}
  }
  async function finishUnload(id,button){
    if(!confirm('Confirmar que a descarga física desta carreta terminou?'))return;
    button.disabled=true;
    try{await call('forklift_finish_unload',{receipt_id:id});toast('Descarga concluída.');await loadQueue()}catch(e){toast(e.message,true);button.disabled=false}
  }

  async function loadOrders(){
    const d=await call('forklift_orders'),rows=d.orders||[];
    $('orderList').innerHTML=rows.length?rows.map(x=>'<article class="task-card"><div class="task-head"><div><div class="task-title">'+esc(x.order_code)+'</div><div class="task-meta"><span>'+esc(x.receipt?.receipt_code||'')+'</span><span>Carreta '+esc(x.receipt?.truck_number||'—')+'</span><span>'+fd(x.receipt?.arrival_date)+'</span></div></div><span class="badge '+esc(x.status)+'">'+esc(label(x.status))+'</span></div><div class="task-actions"><button class="secondary" data-open-order-token="'+esc(x.public_token)+'">Abrir Ordem de Guarda</button></div></article>').join(''):'<div class="empty">Nenhuma Ordem de Guarda liberada para suas descargas.</div>';
    $('orderList').querySelectorAll('[data-open-order-token]').forEach(b=>b.onclick=()=>openOrderToken(b.dataset.openOrderToken));
  }
  async function openOrderToken(token){
    try{const d=await call('forklift_order',{token});order=d.order;renderOrder();show('orderView')}catch(e){toast(e.message,true)}
  }
  function renderOrder(){
    const r=order.receipt||{},tasks=order.tasks||[];
    $('orderCode').textContent=order.order_code;
    $('orderMeta').textContent=(r.receipt_code||'')+' · Carreta '+(r.truck_number||'—')+' · '+(r.factory_name||'—')+' · '+fd(r.arrival_date);
    const validated=tasks.filter(x=>x.status==='validated').length,pending=tasks.filter(x=>x.status==='stored_pending_validation').length;
    $('orderSummary').innerHTML='<article><span>Total</span><strong>'+tasks.length+'</strong></article><article><span>Aguardando conferente</span><strong>'+pending+'</strong></article><article><span>Validados</span><strong>'+validated+'</strong></article>';
    $('taskList').innerHTML=tasks.map(taskCard).join('');
    $('taskList').querySelectorAll('[data-store]').forEach(b=>b.onclick=()=>store(b.dataset.store,b));
  }
  function taskCard(t){
    const interactive=['planned','rejected'].includes(t.status);
    const state=t.status==='validated'
      ?'<div class="task-state good">Validado pelo conferente. O Estoque x Estoque já foi atualizado.</div>'
      :t.status==='stored_pending_validation'
        ?'<div class="task-state">Guardado em <strong>'+esc(t.actual_address||'—')+'</strong>. Aguardando validação do conferente.</div>'
        :t.status==='rejected'
          ?'<div class="task-state bad">A confirmação anterior foi rejeitada. '+esc(t.validation_note||'Informe o endereço correto e confirme novamente.')+'</div>'
          :'';
    return '<article class="task-card"><div class="task-head"><div><div class="task-title">'+esc(t.sku_code)+' · '+esc(t.sku_name)+'</div><div class="task-meta"><span>Palete '+t.pallet_seq+'</span><span>'+esc(area(t.area))+'</span><span>Curva '+esc(t.curve_class||'—')+'</span><span>Validade '+fd(t.expiry_date)+'</span></div></div><span class="badge '+esc(t.status)+'">'+esc(label(t.status))+'</span></div>'+
      '<div class="destination"><article><span>Destino sugerido</span><strong>'+esc(t.suggested_address||'Definir')+'</strong><small>Zona '+esc(t.suggested_zone||'—')+' · '+esc(t.suggestion_reason||'')+'</small></article><article><span>Área</span><strong>'+esc(area(t.area))+'</strong><small>'+esc(t.area_source||'')+'</small></article></div>'+
      state+
      (interactive?'<div class="task-form"><label>Endereço real<input id="addr-'+t.id+'" value="'+esc(t.actual_address||t.suggested_address||'')+'" autocomplete="off" /></label><button class="primary" data-store="'+t.id+'">Confirmar guarda</button><label class="note">Observação<input id="note-'+t.id+'" value="'+esc(t.worker_note||'')+'" placeholder="Opcional: posição alternativa, bloqueio, etc." /></label></div>':'')+
      '</article>';
  }
  async function store(taskId,button){
    const address=$('addr-'+taskId)?.value.trim(),note=$('note-'+taskId)?.value.trim()||'';button.disabled=true;
    try{const d=await call('forklift_store',{token:order.public_token,task_id:taskId,actual_address:address,note});order=d.order;renderOrder();toast('Guarda registrada. Aguardando validação do conferente.')}catch(e){toast(e.message,true);button.disabled=false}
  }

  $('refreshButton').onclick=()=>refreshAll();
  $('logoutButton').onclick=logout;
  $('orderLogoutButton').onclick=logout;
  $('backHomeButton').onclick=()=>{show('homeView');refreshAll(false)};
  loadOperators();restore();
})();