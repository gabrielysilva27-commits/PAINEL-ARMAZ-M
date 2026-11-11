import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildTrips,tripStats,resolveTrip} from '../supabase/functions/blitz-api/blitz-trip-core.mjs';
const date='2026-11-10';
const raw=(map,vehicle='312',plate='TTZ-5E13')=>({reference_date:date,vehicle,map_number:map,is_entrada_cdd:true,headers:['Mapa','Placa'],raw_values:[map,plate]});
test('same plate on two maps means two trips; repeated phases and formatted map/plate do not duplicate',()=>{
 const trips=buildTrips([raw('001'),raw('1','312','TTZ5E13'),raw('2'),{...raw('3'),is_entrada_cdd:false},raw('4','189')]);
 assert.equal(trips.length,2);assert.deepEqual(trips.map(t=>t.map_number),['1','2']);
 assert.equal(trips[0].plate,'TTZ5E13');
});
test('confirmed maps count once regardless of duplicate headers, counters, loss lines or checker',()=>{
 const trips=buildTrips([raw('1'),raw('2')]);
 const c={reference_date:date,trailer:'312',map_number:'1',plate:'TTZ5E13',trips_day:7,trips_checked:4140,packages_checked:4140};
 const s=tripStats([c,{...c,checker:'Outro',trips_checked:9999}],[{...c,quantity_units:7}],trips,[date]);
 assert.equal(s.trips_day,2);assert.equal(s.trips_checked,1);assert.equal(s.packages_checked,4140);assert.equal(s.pending_maps,0);
 const both=tripStats([c,{...c,map_number:'2'}],[],trips,[date]);assert.equal(both.trips_checked,2);assert.equal(both.packages_checked,8280);
});
test('historical map can only resolve when date and vehicle/plate have one candidate',()=>{
 const c={reference_date:date,trailer:'312',check_time:'12:50',checker:'Teste'};
 assert.equal(resolveTrip(c,buildTrips([raw('1')])).map_number,'1');
 assert.equal(resolveTrip(c,buildTrips([raw('1'),raw('2')])),null);
 const s=tripStats([c,c],[],buildTrips([raw('1'),raw('2')]),[date]);assert.equal(s.trips_checked,0);assert.equal(s.pending_maps,1);
 assert.equal(resolveTrip({...c,map_number:'999'},buildTrips([raw('1')])),null);
 assert.equal(resolveTrip({...c,map_number:'1',plate:'INVALID'},buildTrips([raw('1')])),null);
});
test('daily denominator includes trips with no checks and does not multiply daily snapshot totals',()=>{
 const trips=buildTrips([raw('1'),{...raw('2'),reference_date:'2026-11-11'}]);
 const s=tripStats([{reference_date:date,trailer:'312',map_number:'1',trips_day:100}],[],trips,[date,'2026-11-11']);
 assert.equal(s.trips_day,2);assert.deepEqual(s.daily.map(d=>[d.trips_day,d.trips_checked]),[[1,1],[1,0]]);
});
test('dashboard uses authoritative trip totals without changing loss quantities or dropping pending warning',()=>{
 const context=vm.createContext({window:{},document:{querySelector:()=>null}});
 vm.runInContext(fs.readFileSync(new URL('../blitz.js',import.meta.url),'utf8'),context);
 context.data={checks:[{check_key:'a',reference_date:date,trips_day:7,trips_checked:4140,packages_checked:4140}],losses:[{check_key:'a',reference_date:date,quantity_units:3,reason:'Faltante'}],trip_stats:{daily:[{date,trips_day:7,trips_checked:1,packages_checked:4140,pending_maps:0}],trips_day:7,trips_checked:1,packages_checked:4140,pending_maps:0,by_checker:{Teste:1}}};
 const s=JSON.parse(vm.runInContext('B.data=data;JSON.stringify(summary())',context));
 assert.equal(s.tripsChecked,1);assert.equal(s.tripsDay,7);assert.equal(s.units,3);assert.equal(s.lossLines,1);assert.equal(s.pct,100/7);
});
const source=fs.readFileSync(new URL('../supabase/functions/blitz-api/index.ts',import.meta.url),'utf8');
const code=source.slice(source.indexOf('if(action==="save_check")'),source.indexOf('if(action==="delete_check")')).replace(/:any\b/g,'');
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
function saveHarness(user={id:'adm',display_name:'ADM',role:'admin'},owner='conf'){
 let payload=null;
 const db={rpc:async(name,args)=>{payload={name,args};return{error:null}},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{conferencer_id:owner},error:null})})};
 const fn=new AsyncFunction('action','body','user','db','json','crypto','normalizeLoss',code);
 return {run:body=>fn('save_check',body,user,db,(body,status=200)=>({body,status}),{randomUUID:()=> 'new-check'},x=>x),payload:()=>payload};
}
test('save discards client-edited counters and commits header/losses in one RPC',async()=>{
 const h=saveHarness();const r=await h.run({check:{reference_date:date,map_number:'1',trailer:'312',trips_day:999,trips_checked:4140},losses:[]});
 assert.equal(r.status,200);assert.equal(h.payload().name,'blitz_save_trip');assert.equal(h.payload().args.p_check.map_number,'1');
 assert.equal(h.payload().args.p_check.trips_checked,undefined);assert.equal(h.payload().args.p_check.trips_day,undefined);
});
test('save requires map, rejects invalid package counts, and preserves portal ownership',async()=>{
 for(const check of [{reference_date:date},{reference_date:date,map_number:'1',packages_checked:-1}]){const h=saveHarness();assert.equal((await h.run({check,losses:[]})).status,400);assert.equal(h.payload(),null);}
 const h=saveHarness({id:'other',is_conferencer:true,display_name:'Outra'});assert.equal((await h.run({check:{check_key:'old',reference_date:date,map_number:'1'},losses:[]})).status,403);assert.equal(h.payload(),null);
});
