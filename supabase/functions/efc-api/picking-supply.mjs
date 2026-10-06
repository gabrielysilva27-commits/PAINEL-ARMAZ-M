const sku=v=>String(v??'').replace(/^0+(?=\d)/,'');
const up=v=>v>0?Math.ceil(v*10-1e-8)/10:0;
const sum=(rows,key)=>rows.reduce((s,r)=>s+(Number(r[key])||0),0);
// Reabastecimento!D7: excess in pallets; CI10/CJ10: demand below
// capacity, otherwise demand minus capacity. Both are workbook estimates.
export function pickingSupply(ocp,capacities,catalog,days){
 const products=new Map(catalog.map(p=>[sku(p.sku_code),p]));
 const cap=new Map(capacities.map(c=>{const p=products.get(sku(c.sku));return[sku(c.sku),{...c,positions:Math.max(1,Number(c.positions)||0),palletization:c.adjustment_reason?c.palletization:p?.boxes_per_pallet>0?Number(p.boxes_per_pallet):c.palletization}];}));
 const groups=new Map(),demand=new Map(),observed=new Set(ocp.map(r=>r.date));
 for(const r of ocp){if(r.closed||!(r.boxes>0)||!r.product)continue;
  const key=[r.date,r.map,r.pallet||'',sku(r.product)].join('|');
  if(!groups.has(key))groups.set(key,{...r,boxes:0,units:0});
  const g=groups.get(key);g.boxes+=r.boxes;g.units+=Number(r.units)||0;
 }
 for(const r of groups.values()){
  const code=sku(r.product),c=cap.get(code),p=products.get(code),palletization=c?.adjustment_reason?c.palletization:p?.boxes_per_pallet>0?Number(p.boxes_per_pallet):c?.palletization;
  // False "Não" rows that are full pallets never become picking demand.
  const full=palletization>0&&!r.units&&Math.abs(r.boxes/palletization-Math.round(r.boxes/palletization))<1e-9;
  const key=r.date+'|'+code;
  if(!demand.has(key))demand.set(key,{id:'picking:'+key,date:r.date,sku:code,description:p?.sku_name||r.raw_values?.[20]||'',boxes:0,excluded_boxes:0,units:0,positions:Math.max(1,Number(c?.positions)||0),palletization:palletization??null});
  const d=demand.get(key);if(full)d.excluded_boxes+=r.boxes;else{d.boxes+=r.boxes;d.units+=r.units;}
 }
 const rows=[...demand.values()].map(d=>{const known=d.palletization>0&&d.positions!=null,capacity=known?d.positions*d.palletization:null;return{...d,capacity,excess:known?Math.max(0,d.boxes-capacity):null,estimated_pallets:known?up(Math.max(0,up(d.boxes/d.palletization)-d.positions)):null,replenishment_boxes:known?(d.boxes<capacity?d.boxes:d.boxes-capacity):null};});
 for(const d of rows)if(!cap.has(d.sku)&&d.palletization>0)cap.set(d.sku,{positions:1,palletization:d.palletization});
 const base=sum([...cap.values()].filter(c=>c.palletization>0).map(c=>({capacity:c.positions*c.palletization})),'capacity');
 const daily=[...observed].sort().map(date=>{const r=rows.filter(x=>x.date===date),missing=r.filter(x=>x.boxes>0&&x.capacity==null),complete=days.some(d=>d.reference_date===date&&d.status==='completed'),estimated=sum(r,'estimated_pallets'),boxes=sum(r,'replenishment_boxes');return{date,label:date.slice(8),estimated:up(estimated),positions:estimated>0?208:0,boxes,capacity:boxes>0?base:0,missing_skus:missing.map(x=>x.sku),missing_boxes:sum(missing,'boxes'),missing_positions:missing.filter(x=>x.positions==null).map(x=>x.sku),complete:complete&&!missing.length};});
 return {rows,daily};
}
