const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderGroupControl(root,call,onSaved){
 try{
  const {lists}=await call('confront_group_pending');
  if(!root.isConnected)return;
  root.innerHTML=lists.length?'<h2>Confrontos · diferenças a distribuir</h2>':'';
  for(const list of lists){
   const form=document.createElement('form');form.className='bo-control-panel';
   form.innerHTML='<p>Conferido em '+esc(new Date(list.created_at).toLocaleString('pt-BR'))+'</p>'+list.groups.map(group=>'<details '+(group.allocations?'':'open')+'><summary>'+esc(group.sku)+' · '+esc(group.name)+' · Turno C: '+esc(group.expected)+' · Turno A: '+esc(group.total)+'</summary>'+group.items.map(item=>{
    const allocation=group.allocations?.find(x=>String(x.item_id)===String(item.item_id));
    return '<div style="display:flex;flex-wrap:wrap;gap:12px;margin:12px 0"><span style="flex:1 1 250px">'+esc(item.bo_number)+' · '+esc(item.employee)+' · '+esc(item.reason)+' · '+esc(item.location)+' · Informado: '+esc(item.total)+'</span><label>Total<input data-item="'+esc(item.item_id)+'" type="number" min="0" max="1000000" step="0.001" required value="'+esc(allocation?.total??'')+'"></label><label>Reembalado<input data-repacked="'+esc(item.item_id)+'" type="number" min="0" max="1000000" step="0.001" required value="'+esc(allocation?.repacked??item.repacked)+'"></label></div>';
   }).join('')+'</details>').join('')+'<p role="status"></p><button type="submit" class="bo-btn-primary">Confirmar distribuição</button>';
   form.onsubmit=async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const button=form.querySelector('button'),message=form.querySelector('[role="status"]');button.disabled=true;
    try{
     const allocations=Object.fromEntries([...form.querySelectorAll('[data-item]')].map(input=>[input.dataset.item,{total:input.value,repacked:form.querySelector('[data-repacked="'+input.dataset.item+'"]').value}]));
     await call('confront_group_resolve',{id:list.id,allocations});
     await onSaved();
    }catch(error){message.textContent=error.message;button.disabled=false;}
   };
   root.append(form);
  }
 }catch(error){root.textContent='Não foi possível carregar as divergências: '+error.message;}
}
