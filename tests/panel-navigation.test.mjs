import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const classList=()=>{const classes=new Set();return{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}};
test('Curva ABC opens after placeholder removal and hides the previously selected module',()=>{
 const abc={classList:classList()},efc={classList:classList()},sidebar={classList:classList()},title={},subtitle={};const nodes={abcView:abc,efcView:efc,sidebar,pageTitle:title,pageSubtitle:subtitle};
 const context={$:id=>nodes[id]||null,rememberView(){},document:{querySelectorAll:selector=>selector==='main > .view'?[abc,efc]:[]}};
 vm.runInNewContext(source.slice(source.indexOf('function setView('),source.indexOf('function restoreLastView('))+';setView("abc");',context);
 assert.equal(abc.classList.contains('hidden'),false);assert.equal(efc.classList.contains('hidden'),true);assert.equal(title.textContent,'Curva ABC');
});
const initBody=source.match(/\(async function init\(\)\{([\s\S]*?)\}\)\(\);/)[1];
function boot(status=null,monthsFail=false){let logout=0,restored=0,toasts=0;const error={};const state={token:'private-session'};const context={state,renderMonths(){},renderAreaCards(){},api:async()=>{if(status){const e=Error('unavailable');e.status=status;throw e}return{user:{role:'viewer'}}},setLoggedIn:u=>state.user=u,refreshMonths:async()=>{if(monthsFail)throw Error('months unavailable')},loadCurve:async()=>{},restoreLastView:()=>restored++,logoutLocal:()=>{logout++;state.token=''},showToast:()=>toasts++,$:()=>error,document:{documentElement:{classList:classList()}}};const promise=vm.runInNewContext('(async()=>{'+initBody+'})()',context);return{promise,state,error,result:()=>({logout,restored,toasts})};}
test('failure in monthly data does not discard a verified session or block the restored module',async()=>{const x=boot(null,true);await x.promise;assert.equal(x.state.token,'private-session');assert.deepEqual(x.result(),{logout:0,restored:1,toasts:1})});
test('only invalid or revoked sessions log out; temporary failures retain the token',async()=>{for(const status of [401,403]){const x=boot(status);await x.promise;assert.equal(x.result().logout,1)}const x=boot(503);await x.promise;assert.equal(x.result().logout,0);assert.equal(x.state.token,'private-session');assert.match(x.error.textContent,/verificar a sessão/)});
