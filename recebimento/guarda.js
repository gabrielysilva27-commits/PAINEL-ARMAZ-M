(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/putaway-api';
  const $=id=>document.getElementById(id);
  const token=new URLSearchParams(location.search).get('token')||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fd=v=>{const p=String(v||'').slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:'—'};
  const area=a=>a==='Regulador'?'Estoque Geral':a||'—';
  const label=s=>({planned:'A guardar',stored_pending_validation:'Aguardando conferente',validated:'Validado',rejected:'Rejeitado'}[s]||s||'—');
  let order=null;

  async function call(action,payload={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Falha na Ordem de Guarda');
    return d;
  }
  function toast(msg,error=false){const t=$('toast');t.textContent=msg;t.classList.toggle('error',error);t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),2800)}
  function show(which){['loadingView','errorView','orderView'].forEach(id=>$(id).classList.toggle('hidden',id!==which))}
  async function load(){
    if(!token){$('errorText').textContent='O link não contém uma Ordem de Guarda válida.';return show('errorView')}
    show('loadingView');
    try{const d=await call('public_order');order=d.order;render();show('orderView')}catch(e){$('errorText').textContent=e.message;show('errorView')}
  }
  function render(){
    const r=order.receipt||{},tasks=order.tasks||[];
    $('orderCode').textContent=order.order_code;
    $('orderMeta').textContent=(r.receipt_code||'')+' · Carreta '+(r.truck_number||'—')+' · '+(r.factory_name||'—')+' · '+fd(r.arrival_date);
    const old=localStorage.getItem('putaway_worker_name')||'';if(!$('workerName').value)$('workerName').value=old;
    const validated=tasks.filter(x=>x.status==='validated').length,pending=tasks.filter(x=>x.status==='stored_pending_validation').length;
    $('summary').innerHTML='<article><span>Total</span><strong>'+tasks.length+'</strong></article><article><span>Aguardando conferente</span><strong>'+pending+'</strong></article><article><span>Validados</span><strong>'+validated+'</strong></article>';
    $('taskList').innerHTML=tasks.map(taskCard).join('');
    $('taskList').querySelectorAll('[data-store]').forEach(b=>b.onclick=()=>store(b.dataset.store));
  }
  function taskCard(t){
    const interactive=['planned','rejected'].includes(t.status);
    const state=t.status==='validated'
      ?'<div class="task-state good">Validado pelo conferente. O Estoque x Estoque já foi atualizado.</div>'
      :t.status==='stored_pending_validation'
        ?'<div class="task-state">Guardado em <strong>'+esc(t.actual_address||'—')+'</strong> por '+esc(t.worker_name||'empilhador')+'. Aguardando validação do conferente.</div>'
        :t.status==='rejected'
          ?'<div class="task-state bad">A confirmação anterior foi rejeitada. '+esc(t.validation_note||'Informe o endereço correto e confirme novamente.')+'</div>'
          :'';
    return '<article class="task-card"><div class="task-head"><div><div class="task-title">'+esc(t.sku_code)+' · '+esc(t.sku_name)+'</div><div class="task-meta"><span>Palete '+t.pallet_seq+'</span><span>'+esc(area(t.area))+'</span><span>Curva '+esc(t.curve_class||'—')+'</span><span>Validade '+fd(t.expiry_date)+'</span></div></div><span class="badge '+esc(t.status)+'">'+esc(label(t.status))+'</span></div>'+
      '<div class="destination"><article><span>Destino sugerido</span><strong>'+esc(t.suggested_address||'Definir')+'</strong><small>Zona '+esc(t.suggested_zone||'—')+' · '+esc(t.suggestion_reason||'')+'</small></article><article><span>Área</span><strong>'+esc(area(t.area))+'</strong><small>'+esc(t.area_source||'')+'</small></article></div>'+
      state+
      (interactive?'<div class="task-form"><label>Endereço real<input id="addr-'+t.id+'" value="'+esc(t.actual_address||t.suggested_address||'')+'" autocomplete="off" /></label><button class="primary" data-store="'+t.id+'">Confirmar guarda</button><label class="note">Observação<input id="note-'+t.id+'" value="'+esc(t.worker_note||'')+'" placeholder="Opcional: posição alternativa, bloqueio, etc." /></label></div>':'')+
      '</article>';
  }
  async function store(taskId){
    const worker=$('workerName').value.trim();if(worker.length<2)return toast('Informe seu nome antes de confirmar.',true);
    localStorage.setItem('putaway_worker_name',worker);
    const address=$('addr-'+taskId)?.value.trim(),note=$('note-'+taskId)?.value.trim()||'';
    const btn=document.querySelector('[data-store="'+taskId+'"]');if(btn)btn.disabled=true;
    try{const d=await call('public_store',{task_id:taskId,worker_name:worker,actual_address:address,note});order=d.order;render();toast('Guarda registrada. Aguardando validação do conferente.')}catch(e){toast(e.message,true);if(btn)btn.disabled=false}
  }
  $('refreshButton').onclick=load;
  load();
})();