const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderGroupControl(root,call,onSaved){
 try{
  const {lists}=await call('confront_group_pending');
  if(!root.isConnected)return;
  root.innerHTML='<style>.bo-group-distribution{min-width:0}.bo-group-distribution details{overflow-wrap:anywhere}.bo-group-distribution summary{padding:12px 0;line-height:1.5;cursor:pointer}.bo-group-allocation{display:grid;grid-template-columns:minmax(0,1fr) 120px 120px;gap:12px;align-items:end;margin:12px 0}.bo-group-allocation label{display:grid;gap:6px;min-width:0}.bo-group-allocation input{width:100%;min-width:0;box-sizing:border-box;min-height:44px;font:inherit}.bo-group-distribution [role=status]{overflow-wrap:anywhere}.bo-group-distribution button{min-height:44px;white-space:normal}@media(max-width:600px){.bo-group-allocation{grid-template-columns:repeat(2,minmax(0,1fr))}.bo-group-allocation>span{grid-column:1/-1}.bo-group-allocation input{font-size:16px}.bo-group-distribution button{width:100%}}</style>'+(lists.length?'<h2>Confrontos · diferenças a distribuir</h2>':'');
  for(const list of lists){
   const form=document.createElement('form');form.className='bo-control-panel bo-group-distribution';
   form.innerHTML='<p>Conferido em '+esc(new Date(list.created_at).toLocaleString('pt-BR'))+'</p>'+list.groups.map(group=>'<details '+(group.allocations?'':'open')+'><summary>'+esc(group.sku)+' · '+esc(group.name)+' · Turno C: '+esc(group.expected)+' · Turno A: '+esc(group.total)+'</summary>'+group.items.map(item=>{
    const allocation=group.allocations?.find(x=>String(x.item_id)===String(item.item_id));
    return '<div class="bo-group-allocation"><span>'+esc(item.bo_number)+' · '+esc(item.employee)+' · '+esc(item.reason)+' · '+esc(item.location)+' · Informado: '+esc(item.total)+'</span><label>Total<input data-item="'+esc(item.item_id)+'" type="number" inputmode="decimal" min="0" max="1000000" step="0.001" required value="'+esc(allocation?.total??'')+'"></label><label>Reembalado<input data-repacked="'+esc(item.item_id)+'" type="number" inputmode="decimal" min="0" max="1000000" step="0.001" required value="'+esc(allocation?.repacked??item.repacked)+'"></label></div>';
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
