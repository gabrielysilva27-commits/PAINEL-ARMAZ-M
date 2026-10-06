const ratio=(n,d)=>n!=null&&d>0?n/d:null;
export const WEEKLY_ROUTE_START='2026-10-06';
export function routeConfig(date,config,weeks=[]){
  if(!config||date<WEEKLY_ROUTE_START)return config;
  const week=weeks.find(x=>x.week_start<=date&&x.week_end>=date);
  return {...config,route_skus:week?.route_skus||[],malha_available:!!week};
}
export function decorateIndicator(x){
  if(!x)return null;
  return {...x,occupation_pct:ratio(x.stock_qty,x.capacity_qty),innovation_pct:ratio(x.innovation_count,x.product_count),unavailable_pct:ratio(x.unavailable_count,x.product_count)};
}
export function indicatorFlags(row,metric,config){
  const sku=String(row.sku_code);
  if(metric?.eligible_skus)return {indicator_eligible:metric.eligible_skus.includes(sku),is_innovation:metric.innovation_skus.includes(sku),is_unavailable:config?.malha_available!==false&&row.status==='OUT'&&!(config?.route_skus||[]).includes(sku)};
  return {indicator_eligible:true,is_innovation:(config?.innovation_skus||[]).includes(sku),is_unavailable:config?.malha_available!==false&&row.status==='OUT'&&!(config?.route_skus||[]).includes(sku)};
}
export function calculateLiveIndicator(date,rows,config){
  if(!config||!rows.length)return null;
  const eligible=[],innovation=[],unavailable=[];
  let qty=0;
  for(const r of rows){const f=indicatorFlags(r,null,config);eligible.push(String(r.sku_code));if(f.is_innovation)innovation.push(String(r.sku_code));if(f.is_unavailable)unavailable.push(String(r.sku_code));qty+=Number(r.available_qty)||0;}
  return decorateIndicator({reference_date:date,product_count:eligible.length,innovation_count:innovation.length,unavailable_count:config.malha_available===false?null:unavailable.length,malha_available:config.malha_available!==false,stock_qty:qty,capacity_qty:Number(config.capacity_qty),eligible_skus:eligible,innovation_skus:innovation,unavailable_skus:unavailable,source:'AGENTE_020502',config_month:String(config.reference_month).slice(0,7)});
}
export function aggregateIndicators(rows){
  if(!rows.length)return null;
  const sum=key=>key==='unavailable_count'&&rows.some(r=>r[key]==null)?null:rows.reduce((a,r)=>a+Number(r[key]||0),0);
  return {...decorateIndicator({product_count:sum('product_count'),innovation_count:sum('innovation_count'),unavailable_count:sum('unavailable_count'),stock_qty:sum('stock_qty'),capacity_qty:sum('capacity_qty')}),days:rows.length,average_stock_qty:sum('stock_qty')/rows.length,average_capacity_qty:sum('capacity_qty')/rows.length,config_month:[...new Set(rows.map(x=>x.config_month))].join(', '),source:rows.every(x=>x.source==='AGENTE_020502')?'AGENTE_020502':rows.some(x=>x.source==='AGENTE_020502')?'MIXED':'PLANILHA'};
}
export function selectIndicatorConfig(date,configs){return configs.filter(c=>String(c.reference_month)<=date).sort((a,b)=>String(b.reference_month).localeCompare(String(a.reference_month)))[0]||null;}
// A planilha usa WEEKNUM sem segundo argumento: domingo a sábado.
export function indicatorWeek(date){
  const start=new Date(date+'T00:00:00Z');
  start.setUTCDate(start.getUTCDate()-start.getUTCDay());
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+6);
  return {week_start:start.toISOString().slice(0,10),week_end:end.toISOString().slice(0,10)};
}
export function weeklyIndicators(rows){
  const groups=new Map();
  for(const row of rows){const week=indicatorWeek(row.reference_date);const group=groups.get(week.week_start)||{...week,rows:[]};group.rows.push(row);groups.set(week.week_start,group);}
  return [...groups.values()].sort((a,b)=>a.week_start.localeCompare(b.week_start)).map(x=>({...x,...aggregateIndicators(x.rows)}));
}
