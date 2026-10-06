import {pickingSupply} from './picking-supply.mjs';
import {withoutIgnoredMaps} from './ocp-exceptions.mjs';
import {withOcpInputs} from './ocp-inputs.mjs';
import {checkIdentity,summarizeWorkbook} from './blitz-import-core.mjs';
// Read the same archives, overrides and live source sums as the Panel APIs.
// This adapter never changes agent state or historical results.
export async function sourceFrames(db:any,all:any,months:string[],from:string,to:string){
 const efc:any[]=[],blitz:any[]=[];
 for(const month of months){
  const start=month+'-01',next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,10),before=new Date(Date.parse(start+'T12:00:00Z')-172800000).toISOString().slice(0,10);
  const [chunks,patches,h,sources,checks,c]=await Promise.all([
   all(()=>db.from('efc_archive').select('*').eq('month',month).order('kind').order('chunk')),
   all(()=>db.from('efc_adjustments').select('*').eq('month',month).order('record_id')),
   db.from('efc_workbook_history').select('payload').eq('month',month).maybeSingle(),
   db.rpc('efc_dashboard_sources',{p_from:start,p_before:before,p_to:next}),
   all(()=>db.from('blitz_pull_checks').select('*').gte('reference_date',start).lt('reference_date',next).order('check_key')),
   db.from('blitz_pull_summary_cache').select('*').eq('reference_month',start).maybeSingle()
  ]);
  for(const r of [h,sources,c])if(r.error)throw r.error;
  let data:any={};for(const chunk of chunks){data[chunk.kind]??=[];data[chunk.kind].push(...chunk.payload);}
  for(const patch of patches){const row=data[patch.kind]?.find((x:any)=>x.id===patch.record_id);if(row)Object.assign(row,patch.patch,{adjustment_reason:patch.reason});}
  data.ocp=(sources.data?.ocp||[]).map((r:any)=>({...r.payload,date:r.reference_date,source:r.source_file}));data=withOcpInputs(data,month);
  const exceptions=month>'2026-09'?await all(()=>db.from('efc_ocp_exceptions').select('*').gte('reference_date',start).lt('reference_date',next).order('reference_date').order('map')):[];
  for(const kind of ['helpers','checkers','items','demand'])if(data[kind])data[kind]=withoutIgnoredMaps(data[kind],exceptions);
  if(month>'2026-09'){
   const skus=[...new Set([...(data.capacity||[]).map((r:any)=>r.sku),...data.ocp.map((r:any)=>r.product)])];
   const [catalog,days]=await Promise.all([skus.length?all(()=>db.from('product_catalog').select('sku_code,sku_name,boxes_per_pallet').in('sku_code',skus).order('sku_code')):[],all(()=>db.from('efc_ocp_days').select('reference_date,status').gte('reference_date',start).lt('reference_date',next).order('reference_date'))]);
   data.picking_days=pickingSupply(withoutIgnoredMaps(data.ocp,exceptions),data.capacity||[],catalog,days).daily;
  }
  efc.push({month,data,history:h.data?.payload||null});
  let cache=c.data,rows:any[]=[];
  if(cache?.workbook_rows?.length){const keys=new Set(checks.map(checkIdentity));rows=cache.workbook_rows.filter((r:any)=>!keys.has(checkIdentity(r)));cache=summarizeWorkbook(cache.workbook_rows,checks,String(cache.source||'Planilha Blitz').replace(/^Aba Lançamento Perda — /,''));}
  blitz.push({month,cache,checks,workbook_rows:rows});
 }
 const maps=await all(()=>db.from('efd_route_maps').select('reference_date,vehicle,map_id,arrival_at,physical_at,valid').eq('valid',true).gte('reference_date',from).lte('reference_date',to).order('map_id').order('reference_date'));
 return {efc,blitz,efd:[{maps}]};
}
