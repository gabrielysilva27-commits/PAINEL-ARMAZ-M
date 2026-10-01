import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,simulate,repackActivities,localDay} from '../supabase/functions/productivity-api/core.mjs';
test('Horas extras entram no denominador em horas decimais',()=>{
 const a=[{employee_id:'1',reference_date:'2026-10-01',area:'picking',quantity:90,duration_minutes:240}];
 const h=[{employee_id:'1',reference_date:'2026-10-01',area:'picking',regular_hours:7,overtime_hours:2}];
 const r=summarize(a,h,[{area:'picking',units_per_labor_hour:12}]);
 assert.equal(r.areas.find(x=>x.area==='picking').productivity,10);
 assert.equal(r.rows[0].labor_hours,9);
});
test('Registro sem jornada não vira produtividade zero nem resultado parcial saudável',()=>{
 const a=[{employee_id:'1',reference_date:'2026-10-01',area:'repack',quantity:10,duration_minutes:60},{employee_id:'2',reference_date:'2026-10-01',area:'repack',quantity:20,duration_minutes:60}];
 const h=[{employee_id:'1',reference_date:'2026-10-01',area:'repack',regular_hours:1,overtime_hours:0}];
 const r=summarize(a,h,[]).areas.find(x=>x.area==='repack');assert.equal(r.productivity,null);assert.equal(r.missing,1);
});
test('Taxa agregada pondera volume e horas, sem média simples de taxas',()=>{
 const activities=[{employee_id:'1',reference_date:'2026-10-01',area:'picking',quantity:10,duration_minutes:60},{employee_id:'2',reference_date:'2026-10-01',area:'picking',quantity:90,duration_minutes:180}];
 const attendance=[{employee_id:'1',reference_date:'2026-10-01',area:'picking',regular_hours:1,overtime_hours:0},{employee_id:'2',reference_date:'2026-10-01',area:'picking',regular_hours:3,overtime_hours:0}];
 assert.equal(summarize(activities,attendance,[]).areas.find(x=>x.area==='picking').productivity,25);
});
test('Dimensionamento inclui disponibilidade e arredonda pessoas para cima',()=>{const r=simulate({volume:1000,target:20,hours:8,days:5,availability:.8,headcount:1});assert.equal(r.required_hours,50);assert.equal(r.required_people,2);assert.equal(r.gap,1)});
test('Dimensionamento rejeita zero de meta, disponibilidade inválida e quadro fracionário',()=>{for(const override of [{target:0},{availability:0},{availability:1.1},{headcount:1.5}])assert.throws(()=>simulate({volume:10,target:20,hours:8,days:5,availability:1,headcount:1,...override}))});
test('Repack preserva executor real e data local, sem distribuir volume entre colegas',()=>{
 const r=repackActivities([{id:3,worker_id:'worker1',process_type:'repack',quantity_boxes:12,duration_seconds:1800,started_at:'2026-10-02T01:00:00Z',status:'completed'}],[{id:'employee1',repack_worker_id:'worker1'}]);
 assert.equal(r[0].employee_id,'employee1');assert.equal(r[0].reference_date,'2026-10-01');assert.equal(r[0].quantity,12);assert.equal(r[0].duration_minutes,30);assert.equal(localDay('2026-10-02T01:00:00Z'),'2026-10-01');
});
test('Horas sem produção ficam como pendência explícita',()=>{const r=summarize([],[{employee_id:'1',reference_date:'2026-10-01',area:'descarga',regular_hours:8,overtime_hours:0}],[]);assert.equal(r.rows[0].quantity,null);assert.equal(r.areas.find(x=>x.area==='descarga').productivity,null)});
