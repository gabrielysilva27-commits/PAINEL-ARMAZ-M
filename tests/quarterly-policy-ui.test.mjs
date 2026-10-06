import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{},Intl,Date};vm.createContext(context);
vm.runInContext(readFileSync(new URL('../stock-policy.js',import.meta.url),'utf8').replace('  install();','  window.testPolicy={maxCell,quarterNavigation,versionLabel,S};'),context);
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
