import {AREAS} from './productivity-core.mjs?v=20261006-individual-1';
import {personName} from './efc-names.mjs?v=20261006-names-1';
import {minutes} from './efc-core.mjs?v=20261006-boxes-average';
const canonicalName=v=>personName(v)==='THIAGO ROBERT M. DE CARVALHO'?'THIAGO ROBERT MALAQUIAS DE CARVALHO':personName(v);
export const personKey=v=>canonicalName(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const positive=v=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0;
export function efcActivities(frames){
 const out=[];
 for(const frame of frames){
  const history=new Map((frame.history?.helpers||[]).map(x=>[x.id,x]));
  for(const [kind,area,title] of [['helpers','montagem_c','Montagem de paletes'],['checkers','conferencia_c','Conferência de carregamento']]){
   for(const row of frame.data?.[kind]||[]){
    if(!row.name||!positive(row.pallets))continue;
    const old=history.get(row.id),duration=old?.duration!=null?Number(old.duration)*1440:minutes(row.start,row.end);
    out.push({employee_name:canonicalName(row.name),reference_date:row.date,area,activity_label:title,unit:'paletes',quantity:Number(row.pallets),duration_minutes:positive(duration)?duration:null,source:'efc',source_id:row.id||`${kind}:${row.date}:${row.map}:${personKey(row.name)}`,map:row.map,shift:'C'});
   }
  }
 }
 return out;
}
export function standardHours(dates,employee={}){
 const forklift=/empilhadeira|empilhador/i.test(employee.job_title||'');
 return [...new Set(dates)].reduce((sum,date)=>{
  const [y,m]=date.split('-').map(Number),days=new Date(Date.UTC(y,m,0)).getUTCDate();
  return sum+7+20/60+(forklift?0:13/days);
 },0);
}
export function individualRows(dashboard,efc,from,to,basis='activity'){
 const team=dashboard.team||[],byId=new Map(team.map(x=>[x.id,x])),byName=new Map(team.map(x=>[personKey(x.display_name),x]));
 const auto=[...efcActivities(efc),...(dashboard.warehouse_activities||[])];
 const activities=[...(dashboard.activities||[]).map(x=>({...x,employee_name:byId.get(x.employee_id)?.display_name,unit:AREAS[x.area]?.unit||'unid.',activity_label:AREAS[x.area]?.label||x.area})),...auto].filter(x=>x.employee_name&&x.reference_date>=from&&x.reference_date<=to&&positive(x.quantity));
 const automaticKeys=new Set(activities.filter(x=>x.source!=='manual').map(x=>`${personKey(x.employee_name)}|${x.reference_date}|${x.area==='carregamento'?'montagem_c':x.area}`));
 const groups=new Map(),seen=new Set();
 for(const activity of activities){
  const x={...activity};if(x.area==='carregamento')x.area='montagem_c';
  const name=personKey(x.employee_name),key=name+'|'+x.area,unique=`${x.source}|${x.source_id||x.id||JSON.stringify(x)}|${key}`;
  if(seen.has(unique)||x.source==='manual'&&automaticKeys.has(`${name}|${x.reference_date}|${x.area}`))continue;seen.add(unique);
  const employee=byId.get(x.employee_id)||byName.get(name);
  let g=groups.get(key);
  if(!g){g={key,person_key:name,employee_id:employee?.id,display_name:employee?.display_name||personName(x.employee_name),job_title:employee?.job_title||'Ajudante / conferente',shift:employee?.shift||x.shift||'—',area:x.area,activity_label:x.activity_label,unit:x.unit,quantity:0,task_minutes:0,missing_time:0,dates:new Set(),sources:new Set(),entries:[],employee};groups.set(key,g);}
  g.quantity+=Number(x.quantity);if(positive(x.duration_minutes))g.task_minutes+=Number(x.duration_minutes);else g.missing_time++;g.dates.add(x.reference_date);g.sources.add(x.source);g.entries.push(x);if(x.allocation)g.allocation_count=x.allocation_count;if(x.source_partial)g.source_partial=true;
 }
 return [...groups.values()].map(g=>{
  const att=(dashboard.attendance||[]).filter(x=>x.employee_id===g.employee_id&&(x.area===g.area||x.area==='carregamento'&&g.area==='montagem_c')&&x.reference_date>=from&&x.reference_date<=to);
  const covered=new Set(att.map(x=>x.reference_date)),attendanceComplete=[...g.dates].every(d=>covered.has(d));
  const attendanceHours=att.reduce((s,x)=>s+Number(x.regular_hours||0)+Number(x.overtime_hours||0),0);
  const hours=basis==='standard'?standardHours([...g.dates],g.employee):basis==='attendance'?(attendanceComplete&&attendanceHours>0?attendanceHours:null):g.missing_time===0&&g.task_minutes>0?g.task_minutes/60:null;
  return {...g,attendance:att,days:g.dates.size,dates:[...g.dates].sort(),sources:[...g.sources],hours,productivity:hours>0?g.quantity/hours:null,basis};
 }).sort((a,b)=>a.display_name.localeCompare(b.display_name,'pt-BR')||a.activity_label.localeCompare(b.activity_label,'pt-BR'));
}
export function dailySeries(rows,basis='activity'){
 const dates=[...new Set(rows.flatMap(x=>x.dates))].sort();
 return dates.map(date=>{
  const part=rows.map(r=>({...r,entries:r.entries.filter(x=>x.reference_date===date)})).filter(r=>r.entries.length);
  const quantity=part.reduce((s,r)=>s+r.entries.reduce((n,x)=>n+Number(x.quantity),0),0);
  let hours=0,complete=true;
  for(const r of part){if(basis==='standard')hours+=standardHours([date],r.employee);else if(basis==='attendance'){const a=r.attendance.filter(x=>x.reference_date===date);if(!a.length)complete=false;else hours+=a.reduce((s,x)=>s+Number(x.regular_hours||0)+Number(x.overtime_hours||0),0);}else{for(const x of r.entries){if(!positive(x.duration_minutes))complete=false;else hours+=Number(x.duration_minutes)/60;}}}
  return {date,quantity,productivity:complete&&hours>0?quantity/hours:null};
 });
}
export function periodMonths(from,to){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>62)throw Error('Selecione um intervalo de até 63 dias.');
 const out=[],end=to.slice(0,7),d=new Date(from.slice(0,7)+'-01T12:00:00Z');
 while(d.toISOString().slice(0,7)<=end){out.push(d.toISOString().slice(0,7));d.setUTCMonth(d.getUTCMonth()+1);}return out;
}
// Monthly results remain references. They never become current activity entries.
export function historicalReferences(team,months,before){
 const sorted=[...months].filter(m=>m.reference_month.slice(0,7)<before.slice(0,7)).sort((a,b)=>b.reference_month.localeCompare(a.reference_month));
 return team.filter(e=>e.active).map(employee=>{
  const key=personKey(employee.display_name);let incomplete=null;
  for(const month of sorted){
   const candidates=(month.payload?.records||month.records||[]).filter(r=>r.applicable!==false&&r.display_name&&personKey(r.display_name)===key);
   for(const row of candidates){
    const complete=row.quantity!=null&&Number.isFinite(Number(row.quantity))&&Number(row.quantity)>=0&&positive(row.estimated_hours)&&row.estimated_productivity!=null&&Number.isFinite(Number(row.estimated_productivity));
    const result={...row,display_name:employee.display_name,person_key:key,employee_id:employee.id,reference_month:month.reference_month,reference_only:true,complete,area:row.activity_id||row.area,activity_label:row.activity_label||employee.job_title};
    if(complete)return result;if(!incomplete)incomplete=result;
   }
  }
  return incomplete||{display_name:employee.display_name,person_key:key,employee_id:employee.id,activity_label:employee.job_title,area:employee.area,reference_only:true,complete:false};
 });
}
