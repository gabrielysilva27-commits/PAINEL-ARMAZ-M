import {individualRows,personKey} from './productivity-individual.mjs';
import {warehouseActivities,efdActivities} from './productivity-warehouse.mjs';
export async function workstationIdentity(token,fetcher=fetch){
 if(!token||token.length>4096||!/^[-A-Za-z0-9_.]+$/.test(token))return null;
 const response=await fetcher('https://workstation-armazem.gabrielysilva27.workers.dev/api/auth/me',{headers:{Cookie:'workstation_session='+token},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)return null;
 const user=(await response.json()).user;
 return user?.name&&user?.username?{name:user.name,username:user.username}:null;
}
export function ownEmployee(team,identity){
 const matched=team.filter(e=>e.active&&personKey(e.display_name)===personKey(identity.name));
 return matched.length===1?matched[0]:null;
}
export function selfProductivity(employee,dashboard,frames,months,from,to,basis){
 const warehouse_activities=[...warehouseActivities(dashboard.team,frames.efc,frames.blitz),...efdActivities(dashboard.team,frames.efd)];
 const rows=individualRows({...dashboard,warehouse_activities},frames.efc,from,to,basis).filter(r=>r.employee_id===employee.id);
 // Explicit output allowlist: source rows, other employees, attendance and IDs
 // never cross the Panel / Workstation boundary.
 return {from,to,basis,employee:{display_name:employee.display_name,job_title:employee.job_title,shift:employee.shift},activities:rows.map(r=>({area:r.area,label:r.activity_label,unit:r.unit,quantity:r.quantity,hours:r.hours,productivity:r.productivity,days:r.days,allocation_count:r.allocation_count||null,source_partial:!!r.source_partial,daily:r.dates.map(date=>({date,quantity:r.entries.filter(e=>e.reference_date===date).reduce((s,e)=>s+Number(e.quantity),0)}))})),updated_at:new Date().toISOString()};
}
