const sku=v=>String(v??'').replace(/^0+(?=\d)/,'');
const up=v=>v>0?Math.ceil(v*10-1e-8)/10:0;
const sum=(rows,key)=>rows.reduce((s,r)=>s+(Number(r[key])||0),0);
export function supplyCapacities(layout,ocp,catalog,marketplace){
 const excluded=new Set(marketplace.map(x=>sku(x.sku_code))),products=new Map(catalog.map(p=>[sku(p.sku_code),p]));
 const positions=new Map(layout.map(x=>[sku(x.sku_code),Number(x.assigned_slots)||1]));
 const codes=new Set([...positions.keys(),...ocp.map(x=>sku(x.product))]);
 return [...codes].filter(code=>{
  const p=products.get(code),text=String((p?.sku_name||'')+' '+(p?.packaging||'')+' '+(p?.subtype||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  return code&&!excluded.has(code)&&!/(BARRIL|\bKEG\b|\bCHOPP?\b.*\b(?:10|20|30|50)\s*L\b|BAG|\bSACO\b|VASILHAME|ATIVO DE GIRO|MATERIAL)/.test(text);
 }).map(code=>({sku:code,positions:Math.max(1,positions.get(code)||1),palletization:null,source:positions.has(code)?'Layout do Picking':'Padrão 1P sem posição cadastrada'}));
}
// Reabastecimento!D7: excess in pallets; CI10/CJ10: demand below
// capacity, otherwise demand minus capacity. Both are workbook estimates.
export function pickingSupply(ocp,capacities,catalog,days){
 const products=new Map(catalog.map(p=>[sku(p.sku_code),p]));
 const cap=new Map(capacities.filter(c=>Number(c.positions)>0).map(c=>{const p=products.get(sku(c.sku));return[sku(c.sku),{...c,positions:Math.max(1,Number(c.positions)||0),palletization:p?.boxes_per_pallet>0?Number(p.boxes_per_pallet):c.palletization}];}));
 const demand=new Map(),observed=new Set(ocp.map(r=>r.date));
 // Classify each original product line from 01.11, never the unreliable OCP flag
 // or a sum of different picking lines that happens to equal a full pallet.
 for(const r of ocp){
  if(!(r.boxes>0)||!r.product||!cap.has(sku(r.product)))continue;
  const code=sku(r.product),c=cap.get(code),p=products.get(code),palletization=p?.boxes_per_pallet>0?Number(p.boxes_per_pallet):c?.palletization;
  // False "Não" rows that are full pallets never become picking demand.
  // A mixed line can contain several complete pallets plus loose boxes.
  // Split before aggregation: 160 boxes / 90 = 90 full + 70 picking.
  const ratio=palletization>0?r.boxes/palletization:0;
  const whole=palletization>0?Math.floor(ratio+1e-9):0;
  const excluded=palletization>0?Math.min(r.boxes,whole*palletization):0;
  const picking=Math.max(0,r.boxes-excluded);
  const key=r.date+'|'+code;
  if(!demand.has(key))demand.set(key,{id:'picking:'+key,date:r.date,sku:code,description:p?.sku_name||r.raw_values?.[20]||'',boxes:0,excluded_boxes:0,units:0,positions:Math.max(1,Number(c?.positions)||0),palletization:palletization??null});
  const d=demand.get(key);d.excluded_boxes+=excluded;d.boxes+=picking;d.units+=Number(r.units)||0;
 }
 const rows=[...demand.values()].map(d=>{const known=d.palletization>0&&d.positions!=null,capacity=known?d.positions*d.palletization:null;return{...d,capacity,excess:known?Math.max(0,d.boxes-capacity):null,estimated_pallets:known?Math.max(0,Math.ceil((d.boxes-capacity)/d.palletization-1e-9)):null,replenishment_boxes:known?(d.boxes<capacity?d.boxes:d.boxes-capacity):null};});
 for(const d of rows)if(!cap.has(d.sku)&&d.palletization>0)cap.set(d.sku,{positions:1,palletization:d.palletization});
 const base=sum([...cap.values()].filter(c=>c.palletization>0).map(c=>({capacity:c.positions*c.palletization})),'capacity');
 const positionBase=sum([...cap.values()],'positions');
 const daily=[...observed].sort().map(date=>{const r=rows.filter(x=>x.date===date),missing=r.filter(x=>x.boxes>0&&x.capacity==null),complete=days.some(d=>d.reference_date===date&&d.status==='completed'),estimated=sum(r,'estimated_pallets'),boxes=sum(r,'replenishment_boxes');return{date,label:date.slice(8),estimated:up(estimated),positions:positionBase,boxes,capacity:base,missing_skus:missing.map(x=>x.sku),missing_boxes:sum(missing,'boxes'),missing_positions:missing.filter(x=>x.positions==null).map(x=>x.sku),complete:complete&&!missing.length};});
 return {rows,daily};
}
