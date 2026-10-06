const ratio=(n,d)=>d>0?n/d:null;
export function decorateIndicator(x){
  if(!x)return null;
  return {...x,occupation_pct:ratio(x.stock_qty,x.capacity_qty),innovation_pct:ratio(x.innovation_count,x.product_count),unavailable_pct:ratio(x.unavailable_count,x.product_count)};
}
export function indicatorFlags(row,metric,config){
  const sku=String(row.sku_code);
  if(metric?.eligible_skus)return {indicator_eligible:metric.eligible_skus.includes(sku),is_innovation:metric.innovation_skus.includes(sku),is_unavailable:row.status==='OUT'&&!(config?.route_skus||[]).includes(sku)};
  return {indicator_eligible:true,is_innovation:(config?.innovation_skus||[]).includes(sku),is_unavailable:row.status==='OUT'&&!(config?.route_skus||[]).includes(sku)};
}
export function calculateLiveIndicator(date,rows,config){
  if(!config||!rows.length)return null;
  const eligible=[],innovation=[],unavailable=[];
  let qty=0;
  for(const r of rows){const f=indicatorFlags(r,null,config);eligible.push(String(r.sku_code));if(f.is_innovation)innovation.push(String(r.sku_code));if(f.is_unavailable)unavailable.push(String(r.sku_code));qty+=Number(r.available_qty)||0;}
  return decorateIndicator({reference_date:date,product_count:eligible.length,innovation_count:innovation.length,unavailable_count:unavailable.length,stock_qty:qty,capacity_qty:Number(config.capacity_qty),eligible_skus:eligible,innovation_skus:innovation,unavailable_skus:unavailable,source:'AGENTE_020502',config_month:String(config.reference_month).slice(0,7)});
}
export function aggregateIndicators(rows){
  if(!rows.length)return null;
  const sum=key=>rows.reduce((a,r)=>a+Number(r[key]||0),0);
  return {...decorateIndicator({product_count:sum('product_count'),innovation_count:sum('innovation_count'),unavailable_count:sum('unavailable_count'),stock_qty:sum('stock_qty'),capacity_qty:sum('capacity_qty')}),days:rows.length,average_stock_qty:sum('stock_qty')/rows.length,average_capacity_qty:sum('capacity_qty')/rows.length,config_month:[...new Set(rows.map(x=>x.config_month))].join(', '),source:rows.every(x=>x.source==='AGENTE_020502')?'AGENTE_020502':rows.some(x=>x.source==='AGENTE_020502')?'MIXED':'PLANILHA'};
}
export function selectIndicatorConfig(date,configs){return configs.filter(c=>String(c.reference_month)<=date).sort((a,b)=>String(b.reference_month).localeCompare(String(a.reference_month)))[0]||null;}
