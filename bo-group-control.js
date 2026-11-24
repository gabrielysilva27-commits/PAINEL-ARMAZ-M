const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(value||0));
export async function renderGroupControl(root,call,onSaved){
 try{
  const {lists=[]}=await call('confront_group_pending');
  if(!root.isConnected)return;
  const pending=lists.map(list=>({...list,groups:(list.groups||[]).filter(group=>{
   const distinctSources=new Set((group.items||[]).map(item=>String(item.source_id))).size;
   return group.needs_distribution===true||(distinctSources>1&&Math.abs(Number(group.total||0)-Number(group.expected||0))>0.000001);
  })})).filter(list=>list.groups.length);
  if(!pending.length){root.innerHTML='';return;}
  root.innerHTML='<style>'+
   '#boGroupedPending{display:grid;gap:14px;margin-bottom:18px}'+
   '.bo-group-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}'+
   '.bo-group-head h2{margin:0;font:800 18px/1.25 Montserrat,sans-serif;color:#25252b}'+
   '.bo-group-head p{margin:5px 0 0;color:#707078;font-size:12px}'+
   '.bo-group-count{border-radius:999px;background:#fff1e6;color:#a94d0a;padding:6px 10px;font-size:11px;font-weight:800}'+
   '.bo-group-list{display:grid;gap:12px}'+
   '.bo-group-card{background:#fff;border:1px solid #e4e4e8;border-radius:14px;padding:16px;box-shadow:0 4px 18px rgba(30,30,35,.04);min-width:0}'+
   '.bo-group-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}'+
   '.bo-group-product{font-weight:800;font-size:15px;color:#25252b}'+
   '.bo-group-code{color:#707078;font-size:11px;font-weight:700;margin-right:7px}'+
   '.bo-group-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}'+
   '.bo-group-metric{background:#f7f7f8;border:1px solid #ededf0;border-radius:10px;padding:10px;min-width:0}'+
   '.bo-group-metric span{display:block;color:#707078;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}'+
   '.bo-group-metric strong{display:block;margin-top:4px;font-size:17px;font-variant-numeric:tabular-nums}'+
   '.bo-group-metric.diff{background:#fff8f1;border-color:#f4d7bd}'+
   '.bo-group-rows{display:grid;gap:8px}'+
   '.bo-group-row{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:12px;align-items:center;border:1px solid #ececf0;border-radius:10px;padding:11px 12px;min-width:0}'+
   '.bo-group-row-info{min-width:0}'+
   '.bo-group-row-info strong{display:block;font-size:12px;color:#25252b}'+
   '.bo-group-row-info span{display:block;margin-top:3px;color:#707078;font-size:11px;line-height:1.4;overflow-wrap:anywhere}'+
   '.bo-group-row label{display:grid;gap:5px;font-size:10px;font-weight:800;color:#555}'+
   '.bo-group-row input{width:100%;min-width:0;box-sizing:border-box;min-height:42px;border:1px solid #d7d8dd;border-radius:9px;padding:9px 10px;font:600 15px "DM Sans",sans-serif;font-variant-numeric:tabular-nums}'+
   '.bo-group-row input:focus{outline:2px solid rgba(244,122,32,.18);border-color:#f47a20}'+
   '.bo-group-total{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;border-radius:10px;background:#f7f7f8;font-size:12px}'+
   '.bo-group-total strong{font-variant-numeric:tabular-nums}'+
   '.bo-group-total.ok{background:#edf8f1;color:#176b45}'+
   '.bo-group-total.bad{background:#fff1f1;color:#9b252c}'+
   '.bo-group-submit{display:flex;justify-content:flex-end;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}'+
   '.bo-group-submit [role=status]{font-size:12px;color:#9b252c;flex:1;min-width:180px}'+
   '.bo-group-submit button{border:0;border-radius:9px;padding:11px 16px;min-height:44px;background:#f47a20;color:#fff;font:800 12px "DM Sans",sans-serif;cursor:pointer}'+
   '.bo-group-submit button:disabled{opacity:.45;cursor:not-allowed}'+
   '@media(max-width:620px){.bo-group-metrics{grid-template-columns:1fr 1fr}.bo-group-metric.diff{grid-column:1/-1}.bo-group-row{grid-template-columns:minmax(0,1fr) 112px;gap:8px;padding:10px}.bo-group-card{padding:13px}.bo-group-submit{display:grid;grid-template-columns:1fr}.bo-group-submit button{width:100%}}'+
   '</style>'+
   '<header class="bo-group-head"><div><h2>Distribuição de divergências</h2><p>Somente produtos com mais de um B.O. e diferença entre o Turno C e o Turno A.</p></div><span class="bo-group-count">'+pending.reduce((n,list)=>n+list.groups.length,0)+' produto(s) pendente(s)</span></header>'+
   '<div class="bo-group-list"></div>';
  const listRoot=root.querySelector('.bo-group-list');
  for(const list of pending){
   const form=document.createElement('form');
   form.className='bo-group-card';
   const cards=list.groups.map(group=>{
    const items=group.items||[];
    const expected=Number(group.expected||0),total=Number(group.total||0);
    return '<section class="bo-group-product-card">'+
     '<div class="bo-group-card-head"><div><div class="bo-group-product"><span class="bo-group-code">'+esc(group.sku)+'</span>'+esc(group.name)+'</div><div style="margin-top:4px;color:#707078;font-size:11px">'+new Set(items.map(x=>String(x.source_id))).size+' B.O.s envolvidos</div></div><span class="bo-group-count">Divergência</span></div>'+
     '<div class="bo-group-metrics"><div class="bo-group-metric"><span>TT Descarte · Turno C</span><strong>'+fmt(expected)+'</strong></div><div class="bo-group-metric"><span>Conferido · Turno A</span><strong>'+fmt(total)+'</strong></div><div class="bo-group-metric diff"><span>Diferença a distribuir</span><strong>'+fmt(total-expected)+'</strong></div></div>'+
     '<div class="bo-group-rows">'+items.map(item=>'<div class="bo-group-row"><div class="bo-group-row-info"><strong>'+esc(item.bo_number)+' · '+esc(item.employee)+'</strong><span>'+esc(item.reason)+' · '+esc(item.location)+' · TT Descarte C: '+fmt(item.discarded)+'</span></div><label>TT Descarte A<input data-item="'+esc(item.item_id)+'" type="number" inputmode="decimal" min="0" max="1000000" step="0.001" required value=""></label></div>').join('')+'</div>'+
     '<div class="bo-group-total bad" data-total-row><span>Total distribuído</span><strong data-sum>0 / '+fmt(total)+'</strong></div>'+
     '<input type="hidden" data-group-total="'+esc(group.sku)+'" value="'+esc(total)+'">'+
     '</section>';
   }).join('<div style="height:1px;background:#ececf0;margin:15px 0"></div>');
   form.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><strong style="font-size:13px">Confronto de '+esc(new Date(list.created_at).toLocaleString('pt-BR'))+'</strong><span style="font-size:11px;color:#707078">'+list.groups.length+' produto(s) com diferença</span></div>'+cards+'<div class="bo-group-submit"><p role="status"></p><button type="submit">Confirmar distribuição</button></div>';
   const button=form.querySelector('button[type=submit]');
   const message=form.querySelector('[role=status]');
   function updateSums(){
    let allValid=true;
    for(const section of form.querySelectorAll('.bo-group-product-card')){
     const target=Number(section.querySelector('[data-group-total]').value);
     const inputs=[...section.querySelectorAll('[data-item]')];
     const values=inputs.map(input=>input.value===''?NaN:Number(input.value));
     const sum=values.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);
     const complete=values.every(v=>Number.isFinite(v)&&v>=0);
     const matches=complete&&Math.abs(sum-target)<=0.000001;
     const totalRow=section.querySelector('[data-total-row]');
     totalRow.classList.toggle('ok',matches);totalRow.classList.toggle('bad',!matches);
     section.querySelector('[data-sum]').textContent=fmt(sum)+' / '+fmt(target);
     if(!matches)allValid=false;
    }
    button.disabled=!allValid;
   }
   form.oninput=updateSums;
   updateSums();
   form.onsubmit=async event=>{
    event.preventDefault();if(!form.reportValidity())return;updateSums();if(button.disabled)return;
    button.disabled=true;message.textContent='Salvando distribuição…';
    try{
     const allocations=Object.fromEntries([...form.querySelectorAll('[data-item]')].map(input=>[input.dataset.item,{discarded:input.value}]));
     await call('confront_group_resolve',{id:list.id,allocations});
     await onSaved();
    }catch(error){message.textContent=error.message;button.disabled=false;}
   };
   listRoot.append(form);
  }
 }catch(error){root.textContent='Não foi possível carregar as divergências: '+error.message;}
}
