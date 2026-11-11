export const TRUCK_PLATES={'229':'KYI8259','231':'LSN7312','246':'LSZ9355','264':'KZM9D84','271':'LMZ4G31','289':'RIX8E72','298':'RKK8G53','312':'TTZ5E13'};
const norm=v=>String(v??'').trim().toUpperCase();
export const plateKey=v=>norm(v).replace(/[^A-Z0-9]/g,'');
export const mapKey=v=>norm(v).replace(/^0+(?=\d)/,'');
const headerKey=v=>norm(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,'');
export const tripIdentity=r=>[r.reference_date||r.date,mapKey(r.map_number),plateKey(r.plate)].join('|');
export function buildTrips(rows){
 const trips=new Map();
 for(const r of rows){
  const vehicle=mapKey(r.vehicle);if(!r.is_entrada_cdd||!TRUCK_PLATES[vehicle]||!mapKey(r.map_number))continue;
  const headers=(r.headers||[]).map(headerKey),values=r.raw_values||[];
  const value=h=>String(values[headers.indexOf(h)]??'').trim();
  // Use the plate on this actual map; the fleet register is only a missing-column fallback.
  const plate=plateKey(value('PLACA')||TRUCK_PLATES[vehicle]);
  const t={date:r.reference_date,vehicle,plate,map_number:mapKey(r.map_number),route:value('ENTREGA')||null,trips:1,source:'report_031120_current'};
  trips.set(tripIdentity(t),t);
 }
 return [...trips.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.map_number.localeCompare(b.map_number,undefined,{numeric:true}));
}
export function resolveTrip(check,trips){
 const date=check.reference_date,vehicle=mapKey(check.trailer),plate=plateKey(check.plate),map=mapKey(check.map_number);
 const candidates=trips.filter(t=>t.date===date&&(!map||mapKey(t.map_number)===map)&&(plate?plateKey(t.plate)===plate:mapKey(t.vehicle)===vehicle));
 return candidates.length===1?candidates[0]:null;
}
export function tripStats(checks,workbookRows,trips,coverageDates=[]){
 const days=new Map(),pending=new Map(),groups=new Map(),byChecker={};
 const day=date=>{if(!days.has(date))days.set(date,{date,trips_day:coverageDates.includes(date)?0:null,trips_checked:0,packages_checked:0,pending_maps:0});return days.get(date)};
 for(const t of trips)day(t.date).trips_day=(day(t.date).trips_day||0)+1;
 for(const c of [...workbookRows,...checks]){
  const t=resolveTrip(c,trips),d=day(c.reference_date);
  if(!t){const key=[c.reference_date,mapKey(c.trailer),String(c.check_time||'').slice(0,5),norm(c.checker)].join('|');pending.set(key,{date:c.reference_date,trailer:c.trailer});continue;}
  const key=tripIdentity(t),g=groups.get(key)||{...t,packages_checked:0,checker:c.checker};
  g.packages_checked=Math.max(g.packages_checked,Number(c.packages_checked)||0);groups.set(key,g);
 }
 for(const g of groups.values()){const d=day(g.date);d.trips_checked++;d.packages_checked+=g.packages_checked;byChecker[g.checker||'Sem conferente']=(byChecker[g.checker||'Sem conferente']||0)+1;}
 for(const p of pending.values())day(p.date).pending_maps++;
 const daily=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
 return {daily,trips_day:daily.reduce((s,d)=>s+(d.trips_day||0),0),trips_checked:groups.size,packages_checked:daily.reduce((s,d)=>s+d.packages_checked,0),pending_maps:pending.size,by_checker:byChecker,checked_trips:[...groups.values()].map(({date,map_number,plate})=>({date,map_number,plate})),source:'03.11.20 — ENTRADA CDD/FAB; data + mapa + placa'};
}
