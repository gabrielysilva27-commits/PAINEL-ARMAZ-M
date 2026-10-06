import {normalizePeople,personName} from './efc-names.mjs?v=20261006-names-1';
import {wmsAdherence} from './efc-wms.mjs?v=20261006-names-1';
import {calculate,people,ratio,norm,loading,priorities} from './efc-core.mjs?v=20261006-names-1';
import {selectPeriod,sum,weekStart} from './efc-analytics.mjs?v=20261006-names-1';
const mean=xs=>xs.length?xs.reduce((a,x)=>a+x,0)/xs.length:null;
export function historicalWeek(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10);}
export function periodKey(date,month){return month<='2026-09'?historicalWeek(date):weekStart(date);}
export function withHistoricalActivities(data,history){if(!history)return data;const byId=new Map(history.helpers.map(x=>[x.id,x]));return {...data,helpers:(data.helpers||[]).map(x=>{const h=byId.get(x.id);return h?{...x,history:h}:x;})};}
const resupplyRate=(estimated,pallets,positions)=>ratio(estimated,pallets??positions);
export function calculatePeriod(data,month,day='',week='',history=null){
 data=normalizePeople(data);
 const filtered=Object.fromEntries(Object.entries(data).map(([kind,rows])=>[kind,kind==='events'?rows:rows.filter(x=>!x.date||(x.date.startsWith(month)&&(!day||x.date===day)&&(!week||periodKey(x.date,month)===week)))]));
 if(month<='2026-09'&&!history)throw Error('Histórico original do Excel não disponível para este mês.');
 const c=calculate(filtered,month,day);c.month=month;c.payFiltered=Boolean(day||week);
 if(history&&month<='2026-09'){
  c.history=history;c.fullMonth=!day&&!week;
  const byId=new Map(history.helpers.map(x=>[x.id,x]));c.helpers=c.helpers.map(x=>{const h=byId.get(x.id);return h?{...x,boxes:h.boxes,duration:h.duration==null?null:h.duration*1440,average:h.average==null?null:h.average*1440,standard:h.standard==null?null:h.standard*1440,efm:h.efm,items_per_pallet:h.items_per_pallet,coverage:h.boxes==null?'Sem resultado no Excel':'Resultado salvo no Excel'}:{...x,boxes:x.cached_boxes??null,efm:x.cached_efm??null};});
  c.checkers=c.checkers.map(x=>({...x,boxes:x.cached_boxes??null}));c.people=people(c.helpers);c.priority=c.priority.map(x=>({...x,status:x.cached_status||'Pendente',sequence:x.cached_sequence??null}));
  const belongs=d=>(!day||d===day)&&(!week||historicalWeek(d)===week);c.historyDaily=history.daily.filter(x=>belongs(x.date));c.historySupply=history.supply_days.filter(x=>belongs(x.date));
  const s=c.summary,estimated=sum(c.historySupply,'estimated');c.summary={...s,efm:mean(c.helpers.map(x=>x.efm).filter(x=>x!=null)),planned:sum(c.historyDaily,'planned'),on_time:sum(c.historyDaily,'approved'),waived:0,efc:ratio(sum(c.historyDaily,'approved'),sum(c.historyDaily,'planned')),boxes:sum(c.helpers,'boxes'),estimated_pallets:estimated,resupply_rate:resupplyRate(estimated,s.pallets,sum(c.historySupply,'positions')),picking_positions:sum(c.historySupply,'positions'),priority:ratio(c.priority.filter(x=>x.status==='OK').length,sum(c.historyDaily,'planned')),wms:null};
  if(c.fullMonth){const h=history.summary;Object.assign(c.summary,{efc:h.efc,planned:h.planned,on_time:h.approved,waived:0,wms:h.wms,priority:h.priority,pallets:h.pallets,boxes:h.boxes,efm:h.efm,estimated_pallets:h.estimated_pallets,resupply_rate:resupplyRate(h.estimated_pallets,h.pallets,h.picking_positions),picking_positions:h.picking_positions});}
  c.replenishmentDays=(history.replenishment_days||[]).filter(x=>belongs(x.date));c.replenishmentSummary=c.fullMonth?history.replenishment_summary:{boxes:sum(c.replenishmentDays,'boxes'),capacity:sum(c.replenishmentDays,'capacity'),rate:ratio(sum(c.replenishmentDays,'boxes'),sum(c.replenishmentDays,'capacity'))};
  const supplyBySku=new Map(history.supply_rows.map(x=>[x.sku,x]));const dateIndices=new Map(history.supply_days.map((x,i)=>[x.date,i]));c.supply=c.supply.map(x=>({...x,estimated_pallets:supplyBySku.get(x.sku)?.daily[dateIndices.get(x.date)]??null}));
  if(!c.fullMonth){c.monthlyEfmByName=new Map(history.ranking.map(x=>[norm(x.name),x.efm]));}
  c.summary.pending=Math.max(0,c.summary.planned-c.summary.on_time);c.summary.historical=true;
 }else{
  c.revised=true;c.loads=loading(filtered.pcd||[],data.events||[],{fixedCutoff:'06:00:00',spotCutoff:'08:30:00',requireFleet:true});const matrix=[...(filtered.priority||[])];for(const l of c.loads)if(!matrix.some(r=>r.date===l.date))matrix.push(...c.loads.filter(r=>r.date===l.date).map((r,i)=>({...r,id:'priority-authorized:'+r.date+':'+r.map,manual_priority:1,source_order:i+1,source:'100% autorizado para dia sem histórico'})));c.priority=priorities(matrix,c.loads);const known=c.loads.filter(x=>x.wms!==null);Object.assign(c.summary,{planned:c.loads.length,on_time:c.loads.filter(x=>x.status==='on_time').length,waived:0,efc:ratio(c.loads.filter(x=>x.status==='on_time').length,c.loads.length),pending:c.loads.filter(x=>['pending','ambiguous','fleet_unknown'].includes(x.status)).length,wms:ratio(known.filter(x=>x.wms).length,known.length),priority:ratio(c.priority.filter(x=>x.status==='OK').length,c.priority.filter(x=>x.status!=='Pendente').length)});
  if(c.loads.some(x=>x.status==='fleet_unknown'))c.summary.efc=null;
  c.helpers=c.helpers.map(x=>({...x,efm_score:x.efm,efm:x.manual_efm===1?1:x.duration>0&&x.standard>0&&x.pallets>0&&x.boxes>0?Math.min(1,x.standard*x.pallets/x.duration):null}));c.people=people(c.helpers);const valid=c.helpers.filter(x=>x.efm!=null);c.summary.efm=mean(valid.map(x=>x.efm));const supply=c.supply.filter(x=>x.capacity!=null);c.summary.estimated_pallets=supply.length?sum(supply,'estimated_pallets'):null;c.summary.boxes=c.helpers.some(x=>x.boxes!=null)?c.summary.boxes:null;c.summary.resupply_rate=null;c.summary.resupply_wms=null;c.summary.replenishment_done=null;
  if(filtered.picking_days?.length){c.supply=filtered.picking_rows||[];c.historySupply=filtered.picking_days;c.replenishmentDays=filtered.picking_days;c.summary.estimated_pallets=sum(filtered.picking_days,'estimated');c.summary.picking_positions=sum(filtered.picking_days,'positions');c.summary.resupply_rate=ratio(c.summary.estimated_pallets,c.summary.picking_positions);c.replenishmentSummary={boxes:sum(filtered.picking_days,'boxes'),capacity:sum(filtered.picking_days,'capacity'),rate:ratio(sum(filtered.picking_days,'boxes'),sum(filtered.picking_days,'capacity'))};c.summary.capacity_missing=c.supply.filter(x=>x.boxes>0&&x.capacity==null).length;c.summary.supply_missing_boxes=sum(filtered.picking_days,'missing_boxes');c.summary.supply_partial=filtered.picking_days.some(d=>!d.complete);}
 }
 c.wmsEstimate=wmsAdherence(c.loads,filtered.segmentations||[]);
 return c;
}
export function historyRanking(c){if(!c.history||!c.fullMonth)return null;return c.history.ranking.map(x=>({...x,name:personName(x.name),average_minutes:x.average_time==null?null:x.average_time*1440,legacy_pay:x.payment,days:null,minutes:null,activities:null,error_quantity:null,missing:null})).sort((a,b)=>b.pallets-a.pallets);}
