import test from 'node:test';
import assert from 'node:assert/strict';
import {workstationIdentity,ownEmployee,selfProductivity} from '../supabase/functions/productivity-api/workstation-self.mjs';
const team=[{id:'one',active:true,display_name:'ANDREI SILVA DA CONCEIÇÃO',job_title:'Ajudante',shift:'A',area:'cheio_b'},{id:'two',active:true,display_name:'MAYCON DOUGLAS DA SILVA CAMPOS',job_title:'Ajudante',shift:'B',area:'cheio_b'}];
test('Only a verified active Workstation account is accepted',async()=>{
 let calls=0;assert.equal(await workstationIdentity('',()=>{calls++}),null);assert.equal(await workstationIdentity('bad;token',()=>{calls++}),null);assert.equal(calls,0);
 assert.equal(await workstationIdentity('opaque.token',async(url,options)=>{assert.equal(url,'https://workstation-armazem.gabrielysilva27.workers.dev/api/auth/me');assert.equal(options.headers.Cookie,'workstation_session=opaque.token');return new Response('{}',{status:401})}),null);
 assert.deepEqual(await workstationIdentity('opaque.token',async()=>Response.json({user:{name:team[0].display_name,username:'andrei',role:'viewer'}})),{name:team[0].display_name,username:'andrei'});
});
test('Exact canonical names match once; ambiguous or inactive names cannot match',()=>{
 assert.equal(ownEmployee(team,{name:'Andrei Silva da Conceicao'}).id,'one');
 assert.equal(ownEmployee(team,{name:'Andrei'}),null);assert.equal(ownEmployee([...team,{...team[0],id:'duplicate'}],{name:team[0].display_name}),null);
 assert.equal(ownEmployee([{...team[0],active:false}],{name:team[0].display_name}),null);
});
test('Shared source totals use the full team before returning only own rows',()=>{
 const frames={efc:[{month:'2026-10',data:{helpers:[],checkers:[],picking_days:[{date:'2026-10-02',boxes:100,estimated:4,complete:true}]}}],blitz:[{cache:{by_day:[{date:'2026-10-02',packages_checked:200}]},checks:[]}],efd:[]};
 const d={team,activities:[{employee_id:'two',reference_date:'2026-10-02',area:'picking',quantity:999,duration_minutes:60,source:'manual'}]};
 const result=selfProductivity(team[0],d,frames,[],'2026-10-01','2026-10-06','activity');
 assert.equal(result.activities.find(r=>r.area==='reabastecimento').quantity,50);assert.equal(result.activities.find(r=>r.area==='blitz_puxada').quantity,100);
 assert.ok(result.activities.every(r=>r.productivity===null));assert.ok(!JSON.stringify(result).includes('MAYCON'));assert.ok(!JSON.stringify(result).includes('999'));assert.ok(!('team' in result));assert.ok(!('entries' in result.activities[0]));
 const standard=selfProductivity(team[0],d,frames,[],'2026-10-01','2026-10-06','standard');assert.ok(standard.activities.every(r=>r.productivity>0));
});
