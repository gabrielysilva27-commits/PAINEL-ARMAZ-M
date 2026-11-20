export function productGroups(sources,counts=null,allocations=null){
 const groups=new Map();
 for(const source of sources)for(const item of source.items||[]){
  const key=String(item.sku_code);
  if(!groups.has(key))groups.set(key,{sku:key,name:item.sku_name,expected:0,items:[]});
  const group=groups.get(key);
  group.expected+=Number(item.total_qty);
  group.items.push({item_id:item.id,source_id:source.id,bo_number:source.bo_number,employee:source.employee_name||source.factory_name||source.subject_type,reason:source.reason,location:source.location,total:Number(item.total_qty),repacked:Number(item.repacked_qty)});
 }
 return [...groups.values()].map(group=>{
  if(counts===null)return group;
  const value=counts[group.sku];
  if(value===''||value==null||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1000000)throw Error('Informe o total conferido do produto '+group.sku+'.');
  const total=Number(value);
  let assigned=null;
  if(allocations){
   assigned=group.items.map(item=>{
    const input=allocations[String(item.item_id)];
    if(!input||input.total===''||input.total==null)throw Error('Distribua a quantidade entre todos os B.O.s.');
    const qty=Number(input.total),repacked=Number(input.repacked??item.repacked);
    if(!Number.isFinite(qty)||!Number.isFinite(repacked)||qty<0||qty>1000000||repacked<0||repacked>qty)throw Error('Quantidade ou reembalagem inválida.');
    return {item_id:item.item_id,total:qty,repacked};
   });
   if(Math.abs(assigned.reduce((sum,item)=>sum+item.total,0)-total)>0.000001)throw Error('A distribuição do produto '+group.sku+' precisa somar '+total+'.');
  }else if(Math.abs(total-group.expected)<0.000001){
   assigned=group.items.map(item=>({item_id:item.item_id,total:item.total,repacked:item.repacked}));
  }else if(group.items.length===1&&total>=group.items[0].repacked){
   assigned=[{item_id:group.items[0].item_id,total,repacked:group.items[0].repacked}];
  }
  return {...group,total,allocations:assigned};
 });
}
export async function submitGrouped(db,conferencer,body){
 const ids=body.sources;
 if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids.map(x=>Number(x.id))).size!==ids.length)throw Error('Lista de origem inválida.');
 if(!/^[0-9a-f-]{36}$/i.test(body.request_id||''))throw Error('Identificação da lista inválida.');
 const previous=await db.from('bo_confront_lists').select('id,status,counted_by').eq('id',body.request_id).maybeSingle();
 if(previous.error)throw previous.error;
 if(previous.data){
  if(previous.data.counted_by!==conferencer.id)throw Error('Lista de outro conferente.');
  return previous.data;
 }
 const result=await db.from('bo_occurrences').select('*,items:bo_occurrence_items(*)').in('id',ids.map(x=>Number(x.id))).order('id');
 if(result.error)throw result.error;
 const sources=result.data||[];
 if(sources.length!==ids.length||sources.some(source=>source.record_kind!=='turn_c_origin'||source.confront_state!=='awaiting'||source.status==='cancelled'||!ids.some(x=>Number(x.id)===source.id&&x.updated_at===source.updated_at)))throw Error('A lista mudou. Atualize os confrontos.');
 const groups=productGroups(sources,body.counts||{});
 const saved=await db.rpc('bo_save_confront_list',{p_id:body.request_id,p_counted_by:conferencer.id,p_sources:sources,p_groups:groups,p_resolved_by:null});
 if(saved.error)throw saved.error;return saved.data;
}
export async function resolveGrouped(db,user,body){
 const result=await db.from('bo_confront_lists').select('*').eq('id',body.id).single();
 if(result.error)throw result.error;
 const list=result.data;
 if(list.status==='completed')return {id:list.id,status:'completed'};
 const counts=Object.fromEntries(list.groups.map(group=>[group.sku,group.total]));
 const groups=productGroups(list.sources,counts,body.allocations||{});
 const saved=await db.rpc('bo_save_confront_list',{p_id:list.id,p_counted_by:list.counted_by,p_sources:list.sources,p_groups:groups,p_resolved_by:user.id});
 if(saved.error)throw saved.error;return saved.data;
}
