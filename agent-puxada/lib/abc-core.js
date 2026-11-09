'use strict';
const AREAS=['Regulador','Picking','Câmara Fria','Marketplace'];
const ASSETS=new Set(['24090','24274','24275','25299','25300','25303','25546','25936','25937','29635','31917']);
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function period(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('ABC_INVALID_MONTH');
  const [y,m]=month.split('-').map(Number),iso=d=>d.toISOString().slice(0,10);
  return{month,date_from:iso(new Date(Date.UTC(y,m-4,1))),date_to:iso(new Date(Date.UTC(y,m-1,0)))};
}
function isAsset(code,...names){return ASSETS.has(code)||names.some(s=>/^(garrafeira|vasilhame|engradado|engrad|casco)\b|^(garrafa|gfa)\s+vazi[ao]\b|^caixa\s+plast(?:ica)?\s+(vazia|retornavel)\b|^embalagem\s+(vazia|retornavel)\b|^ativo\s+de\s+giro\b/.test(norm(s)));}
function calculateArea(rows,area,days){
  const merged=new Map();
  for(const r of rows){if(!(r.volume_hl>0&&Number.isFinite(r.volume_hl)))continue;const old=merged.get(r.sku_code);if(!old)merged.set(r.sku_code,{...r});else{old.volume_caixas+=r.volume_caixas;old.volume_hl+=r.volume_hl;if(r.volume_pallets!=null)old.volume_pallets=(old.volume_pallets||0)+r.volume_pallets;}}
  const ordered=[...merged.values()].sort((a,b)=>b.volume_hl-a.volume_hl||a.sku_code.localeCompare(b.sku_code)),total=ordered.reduce((s,r)=>s+r.volume_hl,0);let cum=0;
  return ordered.map((r,i)=>{const w=r.volume_hl/total;cum+=w;return{...r,area,rank:i+1,avg_caixas:r.volume_caixas/days,avg_hl:r.volume_hl/days,avg_pallets:r.volume_pallets==null?null:r.volume_pallets/days,weight_pct:w*100,pareto_pct:cum*100,curve_class:i===0||cum<=.70?'A':cum<=.90?'B':'C',source_row:null};});
}
function buildCurve(sales,picking,catalog,marketplace,days){
  if(!Number.isInteger(days)||days<=0||days>92)throw Error('ABC_INVALID_DAYS');
  const master=new Map(catalog.map(x=>[String(x.sku_code),x])),mp=new Set(marketplace.map(x=>String(x.sku_code))),cold=new Set(['827','828','838']);
  if(!mp.size)throw Error('ABC_MARKETPLACE_BASE_MISSING');
  const areas=Object.fromEntries(AREAS.map(x=>[x,[]])),skipped=new Set(),assets=new Set();
  function append(rows,isPicking){for(const r of rows){const code=String(r.sku_code),m=master.get(code),qty=Number(r.boxes);if(!/^\d+$/.test(code)||!Number.isFinite(qty))throw Error('ABC_INVALID_QUANTITY');if(isAsset(code,r.name,m?.sku_name)){assets.add(code);continue;}if(qty<=0)continue;const factor=Number(m?.factor_hecto_commercial);if(!(factor>0&&Number.isFinite(factor))){skipped.add(code);continue;}const area=isPicking?'Picking':cold.has(code)?'Câmara Fria':mp.has(code)?'Marketplace':'Regulador',bpp=Number(m?.boxes_per_pallet);areas[area].push({sku_code:code,sku_name:m.sku_name||r.name||'',volume_caixas:qty,volume_hl:qty*factor,volume_pallets:area==='Regulador'&&bpp>0?qty/bpp:null});}}
  append(sales,false);append(picking,true);
  for(const area of AREAS)if(!areas[area].length)throw Error('ABC_EMPTY_AREA: '+area);
  return{items:AREAS.flatMap(area=>calculateArea(areas[area],area,days)),skipped_codes:[...skipped],asset_codes:[...assets]};
}
module.exports={period,buildCurve,calculateArea,norm};
