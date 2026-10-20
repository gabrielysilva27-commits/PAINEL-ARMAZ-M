import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../supabase/functions/bo-api/index.ts',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('async function validatedForExport('),source.indexOf('async function issuePins(')).replace(/:any\[\]/g,'').replace('body:any','body');
async function run(items,extra={}){
 const row={bo_number:'BO-20261017-Z205NU',occurrence_date:'2026-10-17',shift:'A',subject_type:'Funcionário',employee_name:'Colaborador',employee_function:'AJUDANTE',reason:'Avaria',location:'Picking',conferencer:{display_name:'Ruan'},items,...extra};
 const filters=[];let q;const chain={select(){return q},eq(...x){filters.push(['eq',...x]);return q},neq(...x){filters.push(['neq',...x]);return q},order(){return q},gte(){return q},lte(){return q},range(){return q},then(resolve,reject){return Promise.resolve({data:[row],error:null}).then(resolve,reject)}};q=chain;
 const context=vm.createContext({db:{from:()=>q},occurrenceSelect:'fields',hydrateSources:async x=>x,situationFromReason:()=> 'A'});
 const execute=vm.runInContext(fn+';validatedForExport',context);const result=await execute({from:'2026-10-17',to:'2026-10-17'});return {row,result,filters};
}
test('PA and daily export use 1 discard instead of total 23',async()=>{const {row,result,filters}=await run([{sku_code:'13201',sku_name:'BRAHMA',total_qty:23,repacked_qty:0,discarded_qty:1}]);assert.equal(result.pa[0].Qtde,1);assert.equal(result.daily[0].Quantidade,1);assert.equal(row.items[0].total_qty,23);assert.equal(result.occurrence_count,1);assert.equal(result.item_count,1);assert.equal(JSON.stringify(filters),JSON.stringify([['eq','status','validated'],['neq','record_kind','turn_c_origin']]));});
test('zero discard stays zero even with total and repacked quantities',async()=>{const {result}=await run([{total_qty:23,repacked_qty:23,discarded_qty:0}]);assert.equal(result.pa[0].Qtde,0);assert.equal(result.daily[0].Quantidade,0);});
test('missing discard never falls back to total',async()=>{for(const discarded_qty of [null,undefined]){const {result}=await run([{total_qty:23,discarded_qty}]);assert.equal(result.pa[0].Qtde,0);assert.equal(result.daily[0].Quantidade,0);}});
test('discard values are independent for each item and keep originating shift',async()=>{const {result}=await run([{sku_code:'1',total_qty:23,repacked_qty:22,discarded_qty:'1'},{sku_code:'2',total_qty:10,discarded_qty:2.5}],{record_kind:'turn_a_confront',source:{record_kind:'turn_c_origin',shift:'C'}});assert.equal(result.pa.reduce((s,x)=>s+x.Qtde,0),3.5);assert.equal(result.daily.reduce((s,x)=>s+x.Quantidade,0),3.5);assert.equal(result.pa[0].Turno,'C');assert.equal(result.pa[1].Código,'2');});
