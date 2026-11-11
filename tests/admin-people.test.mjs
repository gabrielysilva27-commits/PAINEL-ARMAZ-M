import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';import {webcrypto} from 'node:crypto';
import {GROUPS,AREAS,preparePerson,expectedPerson,publicPerson,nameKey} from '../supabase/functions/admin-people-api/people-core.mjs';
import {AREAS as productivityAreas} from '../supabase/functions/productivity-api/core.mjs';
const id='10000000-0000-4000-8000-000000000001';
test('all existing productivity areas remain available without reclassifying employees',()=>{assert.deepEqual(Object.keys(AREAS).sort(),Object.keys(productivityAreas).sort());for(const area of Object.keys(productivityAreas))assert.equal(preparePerson('productivity',{display_name:'Colaborador',job_title:'Função operacional',shift:'C',area,active:true}).area,area);});
test('B.O. registration requires name/function, validates shift and drops unrelated fields',()=>{
 assert.deepEqual(preparePerson('employees',{employee_name:'  João   Silva ',job_title:'Ajudante',shift:'C',active:true,pin_hash:'never',role:'admin'}),{employee_name:'João Silva',job_title:'Ajudante',shift:'C',active:true});
 for(const person of [{employee_name:'A',job_title:'Ajudante',active:true},{employee_name:'Nome',job_title:'',active:true},{employee_name:'Nome',job_title:'Ajudante',shift:'X',active:true},{employee_name:'Nome',job_title:'Ajudante',active:'false'}])assert.throws(()=>preparePerson('employees',person));
});
test('public directories never expose credentials or linked master privileges',()=>{
 for(const group of Object.keys(GROUPS)){
  const safe=publicPerson(group,{id,pin_hash:'secret',pin_salt:'secret',password_hash:'secret',password_salt:'secret',master_app_user_id:'private',active:true});
  assert.equal(Object.keys(safe).some(k=>/hash|salt|master/.test(k)),false);
 }
 assert.equal(nameKey('  José  da Silva '),nameKey('JOSE DA SILVA'));
 for(const group of ['invalid','__proto__','constructor'])assert.throws(()=>preparePerson(group,{active:true}));
});
test('editing whitelists expected fields, preserves inactive false and requires valid WLP area',()=>{
 assert.deepEqual(expectedPerson('employees',{employee_name:'Nome',job_title:'Ajudante',shift:null,active:false,password_hash:'never'}),{employee_name:'Nome',job_title:'Ajudante',shift:null,active:false});
 assert.throws(()=>preparePerson('productivity',{display_name:'Nome Completo',job_title:'Ajudante',shift:'C',area:'invalid',active:true}));
 assert.equal(preparePerson('productivity',{display_name:'Nome Completo',job_title:'Ajudante',shift:'C',area:'picking',active:false}).active,false);
});
function api({role='admin',valid=true,conflict=false,rows=[]}={}){
 let handler,mutations=0,rpcArgs=null,selection='';
 const db={from(table){const q={select(s){selection=s;return q},eq(){return q},gt(){return q},order(){return q},async maybeSingle(){return {data:table==='app_sessions'?(valid?{user_id:id}:null):table==='app_users'?{id,role}:null,error:null}},async range(){return{data:rows,error:null}}};return q},async rpc(name,args){mutations++;rpcArgs=args;return conflict?{error:{code:'40001',message:'Changed'}}:{data:{id,...args.p_record}}}};
 let src=fs.readFileSync(new URL('../supabase/functions/admin-people-api/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^const db=createClient.*;\n/m,'');
 vm.runInNewContext(stripTypeScriptTypes(src),{GROUPS,AREAS,preparePerson,expectedPerson,publicPerson,db,Deno:{serve:f=>handler=f},Request,Response,TextEncoder,crypto:webcrypto,btoa,Date});
 return {request:body=>handler(new Request('https://test.invalid',{method:'POST',headers:{'x-session-token':'test'},body:JSON.stringify(body)})),state:()=>({mutations,rpcArgs,selection})};
}
test('expired sessions and non-ADM cannot list or change people',async()=>{
 for(const [options,status]of [[{valid:false},401],[{role:'viewer'},403]])for(const action of ['list','save']){const h=api(options),r=await h.request({action,group:'employees',person:{}});assert.equal(r.status,status);assert.equal(h.state().mutations,0)}
});
test('ADM creates a B.O. employee in the same directory used by employee_search',async()=>{
 const h=api(),r=await h.request({action:'save',group:'employees',person:{employee_name:'Novo Ajudante',job_title:'Ajudante',shift:'C',active:true}});
 assert.equal(r.status,201);assert.equal(h.state().rpcArgs.p_group,'employees');assert.equal(h.state().rpcArgs.p_actor,id);assert.equal(h.state().rpcArgs.p_record.job_title,'Ajudante');
 assert.match(fs.readFileSync(new URL('../supabase/functions/bo-api/index.ts',import.meta.url),'utf8'),/from\("bo_employee_directory"\).*select\("employee_name,job_title,shift"\)/);
});
test('list selects public fields and leaves existing PINs untouched',async()=>{
 const h=api({rows:[{id,display_name:'Nome',active:true,pin_hash:'secret'}]}),r=await h.request({action:'list',group:'forklift'});const d=await r.json();
 assert.equal(r.status,200);assert.equal(d.people[0].display_name,'Nome');assert.equal('pin_hash'in d.people[0],false);assert.equal(h.state().selection.includes('pin'),false);assert.equal(h.state().mutations,0);
});
test('missing expected state and concurrent update do not silently overwrite another edit',async()=>{
 const h=api();assert.equal((await h.request({action:'save',group:'employees',id,person:{employee_name:'Nome',job_title:'Ajudante',shift:'C',active:true}})).status,400);assert.equal(h.state().mutations,0);
 const c=api({conflict:true}),person={employee_name:'Nome',job_title:'Ajudante',shift:'C',active:true};assert.equal((await c.request({action:'save',group:'employees',id,person,expected:person})).status,409);
});
test('new panel accounts require compatible salted passwords, edits do not replace passwords',async()=>{
 const person={display_name:'Nome',username:'novo.usuario',role:'viewer',active:true};
 const h=api();assert.equal((await h.request({action:'save',group:'panel',person,initial_password:'short'})).status,400);assert.equal(h.state().mutations,0);
 const created=await h.request({action:'save',group:'panel',person,initial_password:'test-password-only'});assert.equal(created.status,201);assert.match(h.state().rpcArgs.p_record.password_salt,/^[A-Za-z0-9_-]{22}$/);assert.match(h.state().rpcArgs.p_record.password_hash,/^[A-Za-z0-9_-]{43}$/);
 const edit=api();assert.equal((await edit.request({action:'save',group:'panel',id,person,expected:person})).status,200);assert.equal('password_hash' in edit.state().rpcArgs.p_record,false);
});
