export function cycleTarget(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const date=p.year+'-'+p.month+'-'+p.day;return Number(p.hour)>=21?new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10):date;
}
export function cycleResult(date,plans,events){
 const eligible=plans.filter(p=>p.eligible!==false),maps=new Set(eligible.map(p=>String(p.map).replace(/^0+/,''))),lower=new Date(Date.parse(date+'T06:00:00Z')-36*3600000).toISOString().slice(0,19),upper=date+'T23:59:59';
 const selected=events.filter(e=>maps.has(String(e.map).replace(/^0+/,''))&&e.date+'T'+e.time>=lower&&e.date+'T'+e.time<=upper),loaded=new Set(selected.filter(e=>e.phase==='Carregado'&&e.time).map(e=>String(e.map).replace(/^0+/,'')));
 return{events:selected,planned:eligible.length,matched:eligible.filter(p=>loaded.has(String(p.map).replace(/^0+/,''))).length,status:eligible.length&&eligible.every(p=>loaded.has(String(p.map).replace(/^0+/,'')))?'completed':eligible.length?'running':'waiting'};
}
export function frozenEvents(live,cycles){
 const maps=new Set(cycles.flatMap(c=>c.plans.map(p=>String(p.map).replace(/^0+/,'')))),result=new Map();
 for(const e of [...live.filter(e=>!maps.has(String(e.map).replace(/^0+/,''))),...cycles.flatMap(c=>c.events)])result.set([e.map,e.phase,e.date,e.time].join('|'),e);
 return [...result.values()];
}
