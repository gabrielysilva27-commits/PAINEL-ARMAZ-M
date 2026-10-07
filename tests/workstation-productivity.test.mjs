import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {periodMonths} from '../supabase/functions/productivity-api/productivity-individual.mjs';
import * as core from '../supabase/functions/productivity-api/core.mjs';
import {workstationIdentity,ownEmployee,selfProductivity} from '../supabase/functions/productivity-api/workstation-self.mjs';
const team=[{id:'one',active:true,display_name:'ANDREI SILVA DA CONCEIÇÃO',job_title:'Ajudante',shift:'A',area:'cheio_b'},{id:'two',active:true,display_name:'MAYCON DOUGLAS DA SILVA CAMPOS',job_title:'Ajudante',shift:'B',area:'cheio_b'}];
test('Conferente com nome abreviado conserva a produção e o vínculo privado',()=>{
 const employee={id:'gracielle',active:true,display_name:'GRACIELLE SILVA DE FARIAS',job_title:'Conferente',area:'conferencia',shift:'C'};
 const colleague={id:'raissa',active:true,display_name:'RAISSA CUNHA MARTINS',job_title:'Conferente',area:'conferencia',shift:'C'};
 const frames={efc:[{month:'2026-10',data:{checkers:[{id:'a',name:'GRACIELLE FARIAS',date:'2026-10-06',map:'100',pallets:12},{id:'b',name:'RAISSA CUNHA MARTINS',date:'2026-10-06',map:'200',pallets:30}]}}],blitz:[],efd:[]};
 const result=selfProductivity(employee,{team:[employee,colleague],activities:[]},frames,[],'2026-10-06','2026-10-06','standard');
 assert.equal(result.activities.find(r=>r.area==='conferencia_c').quantity,12);assert.equal(result.activities.find(r=>r.area==='mapas_conferidos_c').quantity,1);assert.ok(!JSON.stringify(result).includes('RAISSA'));
});
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
test('HTTP self endpoint ignores spoofed employee IDs and refuses multi-day results',async()=>{
 let serve,reads=0;
 const db={from(table){const q={select(){return q},eq(){return q},gt(){return q},gte(){return q},lte(){return q},lt(){return q},order(){return q},range(){reads++;return Promise.resolve({data:table==='wlp_employees'?team:[],error:null})}};return q}};
 let source=fs.readFileSync(new URL('../supabase/functions/productivity-api/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^const db=createClient.*;\n/m,'');
 vm.runInNewContext(stripTypeScriptTypes(source),{db,...core,Deno:{serve:f=>serve=f},Request,Response,URL,Date,Map,console,periodMonths,ownEmployee,selfProductivity,workstationIdentity:async token=>token==='valid'?{name:team[0].display_name,username:'andrei'}:null,sourceFrames:async()=>({efc:[],blitz:[{cache:{by_day:[{date:'2026-10-02',packages_checked:200}]},checks:[]}],efd:[]})});
 const request=(query,token)=>new Request('https://example.test/workstation?'+query,{headers:token?{'x-workstation-session':token}:{}});
 assert.equal((await serve(request('from=2026-10-02&to=2026-10-02'))).status,401);assert.equal(reads,0);
 assert.equal((await serve(request('from=2026-10-01&to=2026-10-02','valid'))).status,400);
 const r=await serve(request('from=2026-10-02&to=2026-10-02&employee_id=two','valid'));assert.equal(r.status,200);const result=await r.json();assert.equal(result.employee.display_name,team[0].display_name);assert.equal(result.activities[0].quantity,100);assert.ok(!JSON.stringify(result).includes(team[1].display_name));
});
