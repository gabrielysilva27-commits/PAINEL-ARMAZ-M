export function ocpRules(date,plans,exceptions){
 const rules=new Map(exceptions.filter(x=>x.reference_date===date).map(x=>[String(x.map),x.mode]));
 return plans.filter(p=>rules.get(String(p.map))!=='ignore').map(p=>rules.get(String(p.map))==='map_only'?{...p,match_map_only:true}:p);
}
export function withoutIgnoredMaps(rows,exceptions){const skip=new Set(exceptions.filter(x=>x.mode==='ignore').map(x=>x.reference_date+'|'+x.map));return rows.filter(r=>!skip.has(r.date+'|'+r.map));}
