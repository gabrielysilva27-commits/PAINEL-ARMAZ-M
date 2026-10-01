import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import * as core from '../supabase/functions/productivity-api/core.mjs';
function handler(role='admin',valid=true){
 let serve,mutations=0;
 const db={from(table){const q={select(){return q},eq(){return q},gt(){return q},gte(){return q},lte(){return q},lt(){return q},order(){return q},range(){return Promise.resolve({data:[],error:null})},maybeSingle(){return Promise.resolve({data:table==='app_sessions'?(valid?{user_id:'test'}:null):table==='app_users'?{id:'test',role,active:true}:null,error:null})},insert(){mutations++;return Promise.resolve({error:null})},upsert(){mutations++;return Promise.resolve({error:null})}};return q}};
 let source=fs.readFileSync(new URL('../supabase/functions/productivity-api/index.ts',import.meta.url),'utf8');
 source=source.replace(/^import .*;\n/gm,'').replace(/^const db=createClient.*;\n/m,'');
 source=stripTypeScriptTypes(source);
 vm.runInNewContext(source,{db,...core,Deno:{serve:f=>serve=f},Request,Response,TextEncoder,crypto:webcrypto,btoa,console,Map,Date});
 return{serve,mutations:()=>mutations};
}
const request=(body,token='test')=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-session-token':token}:{})},body:JSON.stringify(body)});
test('API rejeita consulta e escrita sem sessão',async()=>{const h=handler();for(const action of ['dashboard','employee','target'])assert.equal((await h.serve(request({action},''))).status,401);assert.equal(h.mutations(),0)});
test('API rejeita token sem sessão ativa',async()=>{const h=handler('admin',false);assert.equal((await h.serve(request({action:'dashboard'}))).status,401)});
test('Usuário de consulta não pode gravar dados nem concluir ações',async()=>{const h=handler('viewer');for(const action of ['employee','attendance','activity','target','volume','action_status','closure','simulation'])assert.equal((await h.serve(request({action}))).status,403);assert.equal(h.mutations(),0)});
test('Administrador recebe painel vazio sem indicadores inventados',async()=>{const h=handler();const r=await h.serve(request({action:'dashboard',from:'2026-10-01',to:'2026-10-01'}));assert.equal(r.status,200);const d=(await r.json()).dashboard;assert.equal(d.wlp.value,null);assert.equal(d.efd.total,0);assert.equal(d.rows.length,0)});
test('API rejeita conclusão de ação sem resultado e simulação inválida',async()=>{const h=handler();assert.equal((await h.serve(request({action:'action_status',status:'completed',result:''}))).status,400);assert.equal((await h.serve(request({action:'simulation',volume:100,target:0}))).status,400);assert.equal(h.mutations(),0)});
