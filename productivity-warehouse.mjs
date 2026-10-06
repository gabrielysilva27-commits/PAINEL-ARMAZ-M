import {personKey} from './productivity-individual.mjs?v=20261006-forklift-1';
const num=v=>Number.isFinite(Number(v))?Number(v):0;
export function fullWarehouseHelpers(team){return team.filter(e=>e.active&&e.shift!=='C'&&/ajudante/i.test(e.job_title||'')&&['repack','cheio_b','picking','cheio'].includes(e.area));}
export function warehouseForklifts(team,area,shift){return team.filter(e=>e.active&&/empilh/i.test(e.job_title||'')&&e.area===area&&(!shift||e.shift===shift));}
export function splitDailyVolume(daily,employees,area,label,unit,source){
 if(!employees.length)return [];
 return daily.filter(d=>num(d.quantity)>0).flatMap(d=>employees.map((e,index)=>({employee_id:e.id,employee_name:e.display_name,reference_date:d.date,area,activity_label:label,unit,quantity:index===employees.length-1?num(d.quantity)-num(d.quantity)/employees.length*(employees.length-1):num(d.quantity)/employees.length,duration_minutes:null,source,source_id:`${area}:${d.date}:${e.id}`,allocation:'equal',allocation_count:employees.length,allocation_total:num(d.quantity),source_partial:d.complete===false,reference:`${label} · rateio entre ${employees.length} colaboradores`}))); 
}
function blitzGroups(frame){
 const groups=new Map();
 // API excludes workbook entries already replaced by panel records.
 for(const r of [...(frame.workbook_rows||[]),...(frame.checks||[])]){
  const key=[r.reference_date,String(r.trailer||''),String(r.check_time||'').slice(0,5),String(r.checker||'').toUpperCase()].join('|');
  const old=groups.get(key);if(!old||num(r.packages_checked)>num(old.packages_checked))groups.set(key,r);
 }
 return [...groups.values()];
}
export function blitzVolume(frames){
 const daily=new Map();
 for(const frame of frames){
  const cache=frame.cache?.by_day||[];
  for(const d of cache){const date=d.date;daily.set(date,{date,quantity:num(d.packages_checked)});}
  for(const r of frame.checks||[]){const date=r.reference_date,g=daily.get(date)||{date,quantity:0};g.quantity+=num(r.packages_checked);daily.set(date,g);}
 }
 return [...daily.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function employeeForChecker(name,team){
 const aliases={MARQUES:'LUIS CARLOS MARQUES DA SILVA',ALEX:'ALEX FREIRE DE OLIVEIRA',RUAN:'RUAN DA SILVA PEREIRA',TIAGO:'TIAGO COSTA RAMOS DA SILVA',VANDERSON:'VANDERSON MARQUES',RAISSA:'RAISSA CUNHA MARTINS'};
 const key=personKey(aliases[String(name||'').trim().toUpperCase()]||name||'');return team.find(e=>personKey(e.display_name)===key);
}
export function warehouseActivities(team,efcFrames,blitzFrames){
 const helpers=fullWarehouseHelpers(team),out=splitDailyVolume(blitzVolume(blitzFrames),helpers,'blitz_puxada','Blitz de puxada','vasilhames','blitz');
 const picking=new Map(),supply=new Map();
 for(const frame of efcFrames){
  const historical=frame.month<='2026-09';
  for(const d of historical?frame.history?.replenishment_days||[]:frame.data?.picking_days||[])picking.set(d.date,{date:d.date,quantity:num(d.boxes),complete:d.complete});
  for(const d of historical?frame.history?.supply_days||[]:frame.data?.picking_days||[])supply.set(d.date,{date:d.date,quantity:num(d.estimated),complete:d.complete});
  const maps=new Set();
  for(const r of frame.data?.checkers||[]){const key=r.date+'|'+r.map+'|'+personKey(r.name);if(!r.map||maps.has(key))continue;maps.add(key);out.push({employee_name:r.name,reference_date:r.date,area:'mapas_conferidos_c',activity_label:'Mapas conferidos · turno C',unit:'mapas',quantity:1,duration_minutes:null,source:'efc',source_id:key});}
 }
 out.push(...splitDailyVolume([...picking.values()],helpers,'reabastecimento','Reabastecimento','caixas','efc-reabastecimento'));
 out.push(...splitDailyVolume([...picking.values()],warehouseForklifts(team,'descarga_cheio','A'),'reabastecimento_empilhadeira','Reabastecimento · empilhadeira','caixas','efc-reabastecimento'));
 out.push(...splitDailyVolume([...supply.values()],helpers,'ressuprimento','Ressuprimento','paletes','efc-ressuprimento'));
 // Nominal Blitz checks are distinct from the helpers' shared handling volumes.
 for(const frame of blitzFrames)for(const r of blitzGroups(frame)){
  const e=employeeForChecker(r.checker,team);if(!e)continue;
  if(num(r.packages_checked)>0)out.push({employee_id:e.id,employee_name:e.display_name,reference_date:r.reference_date,area:'blitz_conferencia',activity_label:'Conferência de Blitz',unit:'vasilhames',quantity:num(r.packages_checked),duration_minutes:null,source:'blitz',source_id:r.check_key||[r.reference_date,r.trailer,r.check_time,r.checker].join('|')});
 }
 return out;
}
export function efdActivities(team,frames){
 const employee=team.find(e=>e.active&&personKey(e.display_name)==='VANDERSON MARQUES');
 const trips=new Map();
 for(const frame of frames)for(const row of frame.maps||[]){
  if(row.valid!==true||!row.reference_date||!row.vehicle||!row.physical_at||!Number.isFinite(Date.parse(row.physical_at)))continue;
  // The same vehicle may return twice. Deduplicate an operation, not a day.
  const key=[row.reference_date,String(row.vehicle),row.arrival_at||'',row.physical_at].join('|');
  if(trips.has(key))continue;
  trips.set(key,{reference_date:row.reference_date,area:'conferencia_retorno_efd',activity_label:'Conferência de retorno · EFD',unit:'carros',quantity:1,duration_minutes:null,source:'efd',source_id:key,map:row.map_id,vehicle:row.vehicle,responsible_assignment:true,reference:`Carro ${row.vehicle} · mapa ${row.map_id}`});
 }
 const completed=[...trips.values()],daily=new Map();
 for(const row of completed){const d=daily.get(row.reference_date)||{date:row.reference_date,quantity:0};d.quantity++;daily.set(d.date,d);}
 return [...(employee?completed.map(row=>({...row,employee_id:employee.id,employee_name:employee.display_name})):[]),...splitDailyVolume([...daily.values()],warehouseForklifts(team,'descarga_vazio'),'descarga_retorno_efd','Descarga de retorno · EFD','carros','efd')];
}
