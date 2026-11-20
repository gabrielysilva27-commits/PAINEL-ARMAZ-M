const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function openGrouped({root,call,user}){
 root.textContent='Carregando confrontos…';
 try{
  const response=await call('confront_queue'),sources=response.occurrences||[];
  if(!sources.length){root.textContent='Nenhum confronto pendente para o Turno A.';return;}
  const groups=new Map();
  for(const source of sources)for(const item of source.items||[]){
   if(!groups.has(item.sku_code))groups.set(item.sku_code,{code:item.sku_code,name:item.sku_name,total:0,origins:[]});
   const group=groups.get(item.sku_code);group.total+=Number(item.discarded_qty??0);
   group.origins.push({source,item});
  }
  const signature=sources.map(source=>source.id+':'+source.updated_at).join('|');
  const key='bo-group-discard-draft:'+user.id;
  let draft={};
  try{const stored=JSON.parse(sessionStorage.getItem(key)||'null');if(stored?.signature===signature)draft=stored;}catch{}
  const requestId=draft.requestId||crypto.randomUUID(),counts=draft.counts||{};
  root.innerHTML='<form class="group-confront-form"><p>Informe o TT Descarte conferido por produto. Expanda somente quando precisar consultar as origens.</p>'+[...groups.values()].map(group=>'<article class="history-card group-confront-card"><strong>'+esc(group.code)+' · '+esc(group.name)+'</strong><p>TT Descarte · Turno C: '+esc(group.total)+' unidades · '+new Set(group.origins.map(x=>x.source.id)).size+' B.O.(s)</p><label>TT Descarte conferido pelo Turno A<input data-code="'+esc(group.code)+'" type="number" inputmode="decimal" min="0" max="1000000" step="0.001" required value="'+esc(counts[group.code]??'')+'" style="width:100%;padding:12px;box-sizing:border-box"></label><details><summary>Ver B.O.s de origem</summary>'+group.origins.map(({source,item})=>'<p>'+esc(source.bo_number)+' · '+esc(source.employee_name||source.factory_name||source.subject_type)+' · '+esc(source.reason)+' · '+esc(source.location)+' · '+esc(item.discarded_qty??0)+' unidades</p>').join('')+'</details></article>').join('')+'<p role="status"></p><button type="submit" class="primary large">Salvar confronto</button></form>';
  const form=root.querySelector('form'),message=form.querySelector('[role="status"]'),button=form.querySelector('button');
  function saveDraft(){sessionStorage.setItem(key,JSON.stringify({signature,requestId,counts:Object.fromEntries([...form.querySelectorAll('[data-code]')].map(input=>[input.dataset.code,input.value]))}));}
  form.oninput=saveDraft;
  form.onsubmit=async event=>{
   event.preventDefault();if(!form.reportValidity())return;button.disabled=true;saveDraft();message.textContent='Salvando…';
   try{
    const result=await call('confront_group_submit',{quantity_basis:"discarded_qty",request_id:requestId,sources:sources.map(source=>({id:source.id,updated_at:source.updated_at})),counts:Object.fromEntries([...form.querySelectorAll('[data-code]')].map(input=>[input.dataset.code,input.value]))});
    sessionStorage.removeItem(key);
    root.textContent=result.result.status==='completed'?'Confronto salvo. Os B.O.s foram enviados para validação do Controle.':'Contagens salvas. A lista aguarda o Controle distribuir as diferenças entre os B.O.s.';
   }catch(error){message.textContent=error.message;button.disabled=false;}
  };
 }catch(error){root.textContent=error.message;}
}
