import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{},Intl,Date};vm.createContext(context);
vm.runInContext(readFileSync(new URL('../stock-policy.js',import.meta.url),'utf8').replace('  install();','  window.testPolicy={pendingNotice,maxCell,quarterNavigation,S};'),context);
const {pendingNotice,maxCell,quarterNavigation,S}=context.window.testPolicy;
test('base pendente não aparece como ausência de demanda',()=>{
 assert.match(maxCell({avg_daily_qty:null,unit_code:'cx'}),/Base pendente/);
 assert.doesNotMatch(maxCell({avg_daily_qty:null}),/Sem demanda|NaN/);
 assert.match(maxCell({avg_daily_qty:0}),/Sem demanda/);
 assert.doesNotMatch(maxCell({avg_daily_qty:10,max_days:null}),/NaN/);
});
test('quatro trimestres são navegáveis e a base de 102 dias permanece pendente',()=>{
 S.versions=[1,2,3,4].map(n=>({id:String(n),code:'T'+n+'/2026',effective_start:'2026-'+String((n-1)*3+1).padStart(2,'0')+'-01',status:'draft',calculation_metadata:{cadence:'quarterly'}}));
 assert.equal((quarterNavigation(S.versions[3]).match(/data-quarter=/g)||[]).length,4);
 const v={review_start:'2026-07-01',review_end:'2026-09-30',calculation_metadata:{cadence:'quarterly',readiness:'partial',days_worked:102,demand_items:0}};
 assert.match(pendingNotice(v),/102 dias trabalhados/);assert.match(pendingNotice(v),/92 dias corridos/);assert.match(pendingNotice(v),/não foi aplicada/);
});
