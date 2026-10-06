import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import * as core from '../supabase/functions/productivity-api/core.mjs';
function handler(role='admin',valid=true,rows=[]){
 let serve,mutations=0;const changes=[];
 const db={from(table){let selectedId,patch;const q={select(){return q},eq(k,v){if(k==='id')selectedId=v;return q},gt(){return q},gte(){return q},lte(){return q},lt(){return q},order(){return q},range(){return Promise.resolve({data:table==='wlp_employees'?rows:[],error:null})},maybeSingle(){return Promise.resolve({data:table==='app_sessions'?(valid?{user_id:'test'}:null):table==='app_users'?{id:'test',role,active:true}:table==='wlp_employees'?rows.find(x=>x.id===selectedId)||null:null,error:null})},update(row){patch=row;mutations++;changes.push(row);return q},insert(row){changes.push(row);mutations++;return Promise.resolve({error:null})},upsert(){mutations++;return Promise.resolve({error:null})}};return q}};
 let source=fs.readFileSync(new URL('../supabase/functions/productivity-api/index.ts',import.meta.url),'utf8');
 source=source.replace(/^import .*;\n/gm,'').replace(/^const db=createClient.*;\n/m,'');
 source=stripTypeScriptTypes(source);
 vm.runInNewContext(source,{db,...core,Deno:{serve:f=>serve=f},Request,Response,TextEncoder,crypto:webcrypto,btoa,console,Map,Date});
 return{serve,mutations:()=>mutations,changes};
}
const request=(body,token='test')=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-session-token':token}:{})},body:JSON.stringify(body)});
test('API rejeita consulta e escrita sem sessão',async()=>{const h=handler();for(const action of ['dashboard','employee','target'])assert.equal((await h.serve(request({action},''))).status,401);assert.equal(h.mutations(),0)});
test('API rejeita token sem sessão ativa',async()=>{const h=handler('admin',false);assert.equal((await h.serve(request({action:'dashboard'}))).status,401)});
test('Histórico exige sessão e permite consulta sem autorização de escrita',async()=>{
 const signedOut=handler();assert.equal((await signedOut.serve(request({action:'historical'},''))).status,401);
 const reader=handler('viewer');const r=await reader.serve(request({action:'historical'}));assert.equal(r.status,200);const d=await r.json();assert.equal(d.rules.monthly_overtime,13);assert.equal(d.rules.forklift_overtime,0);assert.equal(reader.mutations(),0);
});
test('Usuário de consulta não pode gravar dados nem concluir ações',async()=>{const h=handler('viewer');for(const action of ['employee','employee_update','employee_status','attendance','activity','target','volume','action_status','closure','simulation'])assert.equal((await h.serve(request({action}))).status,403);assert.equal(h.mutations(),0)});
test('Administrador recebe painel vazio sem indicadores inventados',async()=>{const h=handler();const r=await h.serve(request({action:'dashboard',from:'2026-10-01',to:'2026-10-01'}));assert.equal(r.status,200);const d=(await r.json()).dashboard;assert.equal(d.wlp.value,null);assert.equal(d.efd.total,0);assert.equal(d.rows.length,0)});
test('API rejeita conclusão de ação sem resultado e simulação inválida',async()=>{const h=handler();assert.equal((await h.serve(request({action:'action_status',status:'completed',result:''}))).status,400);assert.equal((await h.serve(request({action:'simulation',volume:100,target:0}))).status,400);assert.equal(h.mutations(),0)});

const row={id:'e1',display_name:'OPERADOR TESTE',job_title:'Empilhador',area:'descarga_cheio',shift:'A',active:true,repack_worker_id:'linked'};
test('admin edita turno e área do mesmo ID sem substituir vínculo ou histórico',async()=>{
 const h=handler('admin',true,[row]);const r=await h.serve(request({action:'employee_update',id:'e1',display_name:row.display_name,job_title:row.job_title,area:'descarga_vazio',shift:'B'}));assert.equal(r.status,200);assert.equal(h.changes[0].shift,'B');assert.equal(h.changes[0].area,'descarga_vazio');assert.equal(h.changes[0].repack_worker_id,undefined);
});
test('excluir inativa e reativar recupera o mesmo cadastro',async()=>{
 const h=handler('admin',true,[row]);assert.equal((await h.serve(request({action:'employee_status',id:'e1',active:false}))).status,200);assert.equal(h.changes[0].active,false);assert.equal((await h.serve(request({action:'employee_status',id:'e1',active:true}))).status,200);assert.equal(h.changes[1].active,true);
});
test('adição grava cadastro ativo e rejeita nome duplicado ou turno inválido',async()=>{
 const h=handler('admin',true,[row]);assert.equal((await h.serve(request({action:'employee',display_name:'NOVO COLABORADOR',job_title:'Ajudante',area:'retorno',shift:'A'}))).status,200);assert.equal(h.changes[0].active,true);
 assert.equal((await h.serve(request({action:'employee',display_name:'operador teste',job_title:'Ajudante',area:'retorno',shift:'A'}))).status,400);
 assert.equal((await h.serve(request({action:'employee_update',id:'e1',display_name:'Nome',job_title:'Ajudante',area:'retorno',shift:'X'}))).status,400);assert.equal(h.mutations(),1);
});
test('ID ausente e situação não booleana não alteram a equipe',async()=>{
 const h=handler('admin',true,[row]);assert.equal((await h.serve(request({action:'employee_status',id:'',active:false}))).status,400);assert.equal((await h.serve(request({action:'employee_status',id:'e1',active:'false'}))).status,400);assert.equal(h.mutations(),0);
});
