// Volume total planejado e dias úteis enviados pela supervisão em 06/10/2026.
export const ANNUAL_PLAN=[54748,54015,53431,48611,50036,38865,46335,45531,48712,47219,42749,63244].map((volume,i)=>({month:`2026-${String(i+1).padStart(2,'0')}-01`,volume,days:[26,23,26,23,25,24,27,26,25,26,23,26][i]}));
export function referenceWlp(months,month){
 const complete=months.filter(x=>Number(x.payload?.warehouse_summary?.productivity)>0&&!(x.payload.warehouse_summary.missing_attendance||[]).length).sort((a,b)=>a.reference_month.localeCompare(b.reference_month));
 return complete.filter(x=>x.reference_month<month).at(-1)||null;
}
export function plannedDimension(plan,team,target=null){
 const active=team.filter(x=>x.active),calendarDays=new Date(Date.UTC(2026,Number(plan.month.slice(5,7)),0)).getUTCDate();
 const hours=active.reduce((sum,e)=>sum+(7+20/60+(/empilh/i.test(e.job_title||'')?0:13/calendarDays))*plan.days,0);
 const productivity=hours>0?plan.volume/hours:null,perPerson=active.length?hours/active.length:null;
 const required=Number(target)>0&&perPerson?Math.ceil(plan.volume/Number(target)/perPerson):null;
 return {...plan,headcount:active.length,dailyVolume:plan.volume/plan.days,hours,productivity,required,gap:required==null?null:required-active.length};
}
