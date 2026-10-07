import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../panel-runtime.js',import.meta.url),'utf8');
const api='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/efc-api';
const init=(action='dashboard',token='one')=>({method:'POST',headers:{'Content-Type':'application/json','x-session-token':token},body:JSON.stringify({action,month:'2026-10'})});
function runtime(fetcher){
 const scripts=[];
 const document={baseURI:'https://panel.test/',readyState:'complete',scripts,createElement(){const events=new Map();return{src:'',addEventListener:(key,f)=>events.set(key,f),removeEventListener:key=>events.delete(key),emit:key=>events.get(key)?.(),remove(){const i=scripts.indexOf(this);if(i>=0)scripts.splice(i,1)}}},body:{appendChild:s=>scripts.push(s)}};
 const window={fetch:fetcher};vm.runInNewContext(source,{window,document,Headers,Response,URL,AbortController,TypeError,Error,Map,Set,JSON,setTimeout,clearTimeout});return{window,scripts};
}
test('five concurrent identical reads share one request and independent response bodies',async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r);const {window}=runtime(async()=>{calls++;await gate;return Response.json({quantity:42})});
 const requests=Array.from({length:5},()=>window.fetch(api,init()));release();const results=await Promise.all(requests);assert.equal(calls,1);for(const r of results)assert.equal((await r.json()).quantity,42);
 await window.fetch(api,init());assert.equal(calls,2,'completed reads are never cached');
});
test('different sessions and headers cannot share a private response',async()=>{
 let calls=0;const {window}=runtime(async()=>{calls++;return Response.json({})});
 await Promise.all([window.fetch(api,init('dashboard','one')),window.fetch(api,init('dashboard','two')),window.fetch(api,{...init(),headers:{'x-session-token':'one','x-worker-token':'other'}})]);assert.equal(calls,3);
});
test('writes and login are never retried or deduplicated',async()=>{
 let calls=0;const {window}=runtime(async()=>{calls++;return Response.json({error:'failed'},{status:503})});
 await Promise.all(Array.from({length:5},()=>window.fetch(api,init('save'))));assert.equal(calls,5);await window.fetch(api,init('login'));assert.equal(calls,6);
});
test('read retries only transient failures, preserves 401 and releases failed requests',async()=>{
 let calls=0;const {window}=runtime(async()=>{calls++;return Response.json({}, {status:calls===1?503:401})});
 assert.equal((await window.fetch(api,init())).status,401);assert.equal(calls,2);assert.equal((await window.fetch(api,init())).status,401);assert.equal(calls,3);
});
test('failed lazy assets are removed and the next click retries instead of staying rejected',async()=>{
 const {window,scripts}=runtime(async()=>Response.json({}));const first=window.__panelRuntime.loadScript('module.js?v=1');assert.equal(scripts.length,1);assert.equal(window.__panelRuntime.loadScript('module.js?v=1'),first);scripts[0].emit('error');await assert.rejects(first);assert.equal(scripts.length,0);
 const next=window.__panelRuntime.loadScript('module.js?v=1');assert.equal(scripts.length,1);scripts[0].emit('load');await next;assert.equal(window.__panelRuntime.loadScript('module.js?v=1'),next);
});
