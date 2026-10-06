// Derive the same source sums used by the workbook, without changing historical
// archive rows or substituting missing maps with zero quantities.
export function ocpInputs(rows){
 const items=new Map(),demand=new Map();
 for(const r of rows){
  if(!r.date||!r.map||!Number.isFinite(r.boxes))continue;
  const key=r.date+'|'+r.map;
  if(!items.has(key))items.set(key,{id:'ocp:items:'+key,date:r.date,map:r.map,boxes:0,closed_boxes:0,units:0,closed_units:0,lines:0,source:'03023601 agente'});
  const item=items.get(key);item.lines++;item[r.closed?'closed_boxes':'boxes']+=r.boxes;item[r.closed?'closed_units':'units']+=Number(r.units)||0;
  if(!r.closed){const dk=r.date+'|'+r.product;
   if(!demand.has(dk))demand.set(dk,{id:'ocp:demand:'+dk,date:r.date,sku:r.product,description:r.raw_values?.[20]||'',boxes:0,units:0,source:'03023601 agente'});
   const d=demand.get(dk);d.boxes+=r.boxes;d.units+=Number(r.units)||0;
  }
 }
 return{items:[...items.values()],demand:[...demand.values()]};
}
export function withOcpInputs(data,month){
 if(month<='2026-09'||!(data.ocp||[]).length)return data;
 const live=ocpInputs(data.ocp);
 // Replace the current period, rather than leaving September rows masquerading
 // as an October input or adding a second copy of the same imported map.
 return{...data,...live};
}
