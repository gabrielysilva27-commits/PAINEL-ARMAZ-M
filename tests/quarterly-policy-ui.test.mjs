import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{},Intl,Date};vm.createContext(context);
vm.runInContext(readFileSync(new URL('../stock-policy.js',import.meta.url),'utf8').replace('  install();','  window.testPolicy={maxCell,quarterNavigation,versionLabel,capacityTotals,load,S};'),context);
const {maxCell,quarterNavigation,versionLabel,S}=context.window.testPolicy;
test('base desconhecida continua distinta de ausência de demanda',()=>{
 assert.match(maxCell({avg_daily_qty:null,unit_code:'cx'}),/Base pendente/);
 assert.doesNotMatch(maxCell({avg_daily_qty:null}),/Sem demanda|NaN/);
 assert.match(maxCell({avg_daily_qty:0}),/Sem demanda/);
 assert.doesNotMatch(maxCell({avg_daily_qty:10,max_days:null}),/NaN/);
});
test('quatro trimestres navegáveis distinguem cálculo concluído e pendências',()=>{
 S.versions=[1,2,3,4].map(n=>({id:String(n),code:'T'+n+'/2026',effective_start:'2026-'+String((n-1)*3+1).padStart(2,'0')+'-01',status:'draft',calculation_metadata:{cadence:'quarterly',readiness:n===1?'ready':'partial'}}));
 const navigation=quarterNavigation(S.versions[3]);
 assert.equal((navigation.match(/data-quarter=/g)||[]).length,4);
 assert.match(navigation,/Calculada/);assert.match(navigation,/Em preparação/);
 assert.equal(versionLabel(S.versions[0]),'Calculada');
 assert.equal(versionLabel({status:'approved'}),'Base do OOR');
});

test('capacidade abre no módulo, conserva trimestre e remove R2 da seleção',async()=>{
 const root={innerHTML:'',querySelectorAll:()=>[]};const nodes={stockPolicyView:root};
 context.document={getElementById:id=>nodes[id]||(nodes[id]={})};
 const version={id:'quarter1',code:'T1/2026',status:'draft',effective_start:'2026-01-01',effective_end:'2026-03-31',review_start:'2025-10-01',review_end:'2025-12-31',calculation_metadata:{cadence:'quarterly',readiness:'ready'}};
 let calls=0;context.fetch=async()=>({ok:true,json:async()=>++calls===1?{versions:[{id:'legacy',code:'R2/2026',status:'approved',effective_start:'2026-07-01',effective_end:'2026-12-31'},version]}:{version,items:[]}});
 S.versionId='legacy';S.screen='policy';S.query='13203';await context.window.testPolicy.load();
 assert.equal(S.versionId,'quarter1');assert.doesNotMatch(root.innerHTML,/R2\/2026/);
 nodes.policyCapacityOpen.onclick();
 assert.match(root.innerHTML,/344\.282/);assert.match(root.innerHTML,/2\.704/);assert.match(root.innerHTML,/22\.581,2/);assert.match(root.innerHTML,/Marketplace chão/);
 const totals=context.window.testPolicy.capacityTotals();assert.equal(totals.boxes,344282);assert.equal(totals.pallets,2704);assert.ok(Math.abs(totals.hl-22581.19944)<1e-8);
 nodes.policyCapacityBack.onclick();assert.equal(S.screen,'policy');assert.equal(S.versionId,'quarter1');assert.equal(S.query,'13203');assert.equal(calls,2);
});
