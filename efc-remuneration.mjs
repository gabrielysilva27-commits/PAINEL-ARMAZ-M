import {norm,minutes} from './efc-core.mjs?v=20261006-pay-live';
import {personName} from './efc-names.mjs?v=20261006-pay-live';
const number=v=>typeof v==='number'&&Number.isFinite(v);
const total=(xs,key)=>xs.reduce((a,x)=>a+(number(x[key])?x[key]:0),0);
const average=xs=>xs.length?xs.reduce((a,x)=>a+x,0)/xs.length:null;
const key=v=>norm(personName(v));
export const remunerationRules={tiers:[{through:5,tariff:.92},{through:9,tariff:.84},{through:Infinity,tariff:.77}],errorLimit:.005,damageLimit:40,efcGoal:.96,bonus:.1};
export function paymentComponents({pallets,tariff,errorRate,damageValue,efc,absences}){
 const base=pallets*tariff;
 const errorBonus=base===0?0:number(errorRate)?base*(errorRate<=remunerationRules.errorLimit?.1:-.1):null;
 const damageBonus=base===0?0:number(damageValue)?base*(damageValue<remunerationRules.damageLimit?.1:-.1):null;
 const efficiencyBonus=base===0?0:number(efc)?base*(efc>=remunerationRules.efcGoal?.1:0):null;
 const subtotal=[errorBonus,damageBonus,efficiencyBonus].every(number)?base+errorBonus+damageBonus+efficiencyBonus:null;
 // Excel treats an empty ABS cell as zero. Keep that arithmetic while exposing
 // missing attendance separately; never turn the empty input into a saved fact.
 const abs=number(absences)?absences:0;
 const absenceBonus=abs===0?base*.1:number(subtotal)?subtotal*-(abs===1?.15:abs===2?.30:.50):null;
 return {base,errorBonus,damageBonus,efficiencyBonus,absenceBonus,payment:number(subtotal)&&number(absenceBonus)?subtotal+absenceBonus:null};
}
function participants(text,names){
 const parts=String(text||'').split(/[\/;,]+/).map(s=>s.trim()).filter(Boolean),resolved=[];
 for(const part of parts){const exact=names.filter(n=>key(n)===key(part));const candidates=exact.length?exact:names.filter(n=>key(n).startsWith(key(part)+' '));if(candidates.length!==1)return null;resolved.push(key(candidates[0]));}
 return parts.length?[...new Set(resolved)]:null;
}
export function calculateRemuneration(c){
 const helpers=c.helpers||[],presences=c.legacy_pay||[],groups=new Map();
 for(const x of [...presences,...helpers]){const k=key(x.name);if(k&&!groups.has(k))groups.set(k,{name:personName(x.name)});}
 const dates=new Set([...helpers.filter(x=>x.pallets>0).map(x=>x.date),...(c.loads||[]).filter(x=>x.loaded_at).map(x=>x.date)].filter(Boolean));
 const names=[...groups.values()].map(x=>x.name),specialCredits=new Map(),unassigned=[];
 for(const activity of c.special||[]){const duration=number(activity.duration)?activity.duration:minutes(activity.start,activity.end);if(!(duration>0))continue;
  const baseline=average(helpers.filter(x=>x.date===activity.date&&x.pallets>0&&x.duration>0).map(x=>x.duration/x.pallets));
  const selected=participants(activity.names,names);
  if(!selected||!(baseline>0)){unassigned.push({...activity,issue:!selected?'Participantes não identificados':'Tempo médio do dia indisponível'});continue;}
  const equivalent=duration/baseline/selected.length;
  for(const name of selected)specialCredits.set(name,(specialCredits.get(name)||0)+equivalent);
 }
 const filtered=Boolean(c.payFiltered);
 const rows=[...groups].map(([k,g])=>{
  const activities=helpers.filter(x=>key(x.name)===k),presence=presences.find(x=>key(x.name)===k);
  const errors=(c.errors||[]).filter(x=>key(x.helper)===k),damages=(c.damages||[]).filter(x=>key(x.name)===k);
  // Each date/map is one OCP quantity, even when the helper has repeated entries.
  const maps=new Map();for(const x of activities){const mk=x.date+'|'+x.map;if(!maps.has(mk)||!number(maps.get(mk).boxes)&&number(x.boxes))maps.set(mk,x);}
  const unknownBoxes=[...maps.values()].filter(x=>!number(x.boxes)).length;
  const boxes=maps.size&&!unknownBoxes?total([...maps.values()],'boxes'):null;
  const physicalPallets=total(activities,'pallets'),equivalentPallets=specialCredits.get(k)||0,pallets=physicalPallets+equivalentPallets;
  const absenceOutOfScope=filtered&&((presence?.absences||0)>0||(presence?.compensation||0)>0);
  const absences=filtered?null:presence?.absences??null,compensation=filtered?null:presence?.compensation??null;
  const workingDays=dates.size-(absences||0)-(compensation||0);
  const averagePallets=workingDays>0?pallets/workingDays:null;
  const averageMinutes=average(activities.filter(x=>x.pallets>0&&x.duration>0).map(x=>x.duration/x.pallets));
  const errorQuantity=total(errors,'quantity'),errorRate=boxes>0?errorQuantity/boxes:null;
  return {...g,id:presence?.id,physicalPallets,equivalentPallets,pallets,boxes,unknownBoxes,errors:errors.length,errorQuantity,errorRate,damageValue:total(damages,'value'),efm:average(activities.map(x=>x.efm).filter(number)),averageMinutes,palletsPerHour:averageMinutes>0?60/averageMinutes:null,days:dates.size,workingDays,averagePallets,absences,compensation,presencePending:absences==null||compensation==null,absenceOutOfScope};
 }).sort((a,b)=>(b.averagePallets??-1)-(a.averagePallets??-1)||a.name.localeCompare(b.name,'pt-BR'));
 let rank=0;
 for(const row of rows){row.rank=row.pallets>0&&row.averagePallets!=null?++rank:null;row.tariff=row.rank?remunerationRules.tiers.find(t=>row.rank<=t.through).tariff:null;
  const pay=paymentComponents({pallets:row.pallets,tariff:row.tariff??0,errorRate:row.errorRate,damageValue:row.damageValue,efc:c.summary?.efc,absences:row.absences});
  Object.assign(row,pay);if(row.absenceOutOfScope||row.pallets>0&&row.averagePallets==null){row.payment=null;}
 }
 return {rows,days:dates.size,unassigned,total:total(rows,'payment'),pending:rows.filter(x=>x.pallets>0&&(x.payment==null||x.presencePending)).length};
}
