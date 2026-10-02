export function cycleTarget(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const date=p.year+'-'+p.month+'-'+p.day;return Number(p.hour)>=21?new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10):date;
}
const cleanPlate=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function cycleResult(date,plans,events){
 const eligible=plans.filter(p=>p.eligible!==false&&cleanPlate(p.plate)&&!cleanPlate(p.plate).startsWith('REC')),lower=new Date(Date.parse(date+'T06:00:00Z')-36*3600000).toISOString().slice(0,19),upper=date+'T23:59:59',window=events.filter(e=>e.date+'T'+e.time>=lower&&e.date+'T'+e.time<=upper),selected=new Map();let matched=0;
 for(const p of eligible){const sameMap=window.filter(e=>String(e.map).replace(/^0+/,'')===String(p.map).replace(/^0+/,'')),hasLoading=sameMap.some(e=>e.phase==='Carregado'),candidates=hasLoading?sameMap:window.filter(e=>cleanPlate(e.plate)===cleanPlate(p.plate)&&e.emission===date),loaded=new Set(candidates.filter(e=>e.phase==='Carregado'&&e.time).map(e=>String(e.map).replace(/^0+/,'')));if(loaded.size===1)matched++;for(const e of candidates)selected.set([e.map,e.phase,e.date,e.time].join('|'),e);}
 return{events:[...selected.values()],planned:eligible.length,matched,status:eligible.length&&matched===eligible.length?'completed':eligible.length?'running':'waiting'};
}
export function frozenEvents(live,cycles){
 const maps=new Set(cycles.flatMap(c=>c.plans.map(p=>String(p.map).replace(/^0+/,'')))),result=new Map();
 for(const e of [...live.filter(e=>!maps.has(String(e.map).replace(/^0+/,''))&&!cycles.some(c=>c.plans.some(p=>p.date===e.emission&&cleanPlate(p.plate)===cleanPlate(e.plate)))),...cycles.flatMap(c=>c.events)])result.set([e.map,e.phase,e.date,e.time].join('|'),e);
 return [...result.values()];
}
