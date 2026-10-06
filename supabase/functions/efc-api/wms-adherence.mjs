const id=v=>String(v??'').trim().replace(/^0+(?=\d)/,'');
const plate=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function latestSegmentation(emails){
 const ordered=[...emails].sort((a,b)=>String(b.received_at||'').localeCompare(String(a.received_at||''))||String(b.id||'').localeCompare(String(a.id||'')));
 return ordered[0]||null;
}
export function wmsDay(date,plans,emails){
 const unique=new Map();
 for(const p of plans.filter(x=>(x.date||x.reference_date)===date&&x.eligible!==false&&plate(x.plate)&&!plate(x.plate).startsWith('REC'))){
  const key=id(p.map)||plate(p.plate)+'|'+id(p.vehicle);
  if(!unique.has(key))unique.set(key,p);
 }
 const maps=[...unique.values()],message=latestSegmentation(emails.filter(x=>(x.date||x.reference_date)===date));
 const result={date,planned:maps.length,segmented:0,adherent:0,rate:null,status:!maps.length?'Sem MAPAS':!message?'Sem e-mail':message.status!=='parsed'?'Revisar e-mail':'Conciliado',unmatched:[],email_id:message?.id||null};
 if(!maps.length||!message||message.status!=='parsed')return result;
 const selected=new Set();
 for(const row of message.rows||[]){
  let candidates=maps.filter(p=>id(p.map)===id(row.map)||Boolean(p.planned_map&&id(p.planned_map)===id(row.map)));
  // Map replacements can be reconciled only through one unambiguous vehicle.
  if(!candidates.length)candidates=maps.filter(p=>id(p.vehicle)&&id(p.vehicle)===id(row.vehicle));
  if(candidates.length!==1){if(!result.unmatched.includes(id(row.map)))result.unmatched.push(id(row.map));continue;}
  selected.add(candidates[0]);
 }
 result.segmented=selected.size;result.adherent=maps.length-selected.size;
 if(result.unmatched.length){result.status='Segmentações sem vínculo';return result;}
 result.rate=result.adherent/maps.length;return result;
}
export function wmsAdherence(plans,emails){
 const dates=[...new Set([...plans.map(x=>x.date||x.reference_date),...emails.map(x=>x.date||x.reference_date)].filter(Boolean))].sort();
 const daily=dates.map(date=>wmsDay(date,plans,emails)),valid=daily.filter(x=>x.rate!==null),pending=daily.filter(x=>x.rate===null&&x.planned>0);
 const sum=key=>valid.reduce((a,x)=>a+x[key],0),planned=sum('planned'),segmented=sum('segmented'),adherent=sum('adherent');
 return {daily,planned,segmented,adherent,rate:planned?adherent/planned:null,covered_days:valid.length,pending_days:pending.length,partial:pending.length>0,unmatched:daily.reduce((a,x)=>a+x.unmatched.length,0)};
}
