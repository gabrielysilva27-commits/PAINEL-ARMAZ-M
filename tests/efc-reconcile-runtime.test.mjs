import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
import {cycleResult} from '../supabase/functions/efc-api/efc-cycle.mjs';import {sharedEvents} from '../supabase/functions/efc-api/shared-031120.mjs';
const src=fs.readFileSync(new URL('../supabase/functions/efc-api/index.ts',import.meta.url),'utf8');
const definition=src.slice(src.indexOf('async function reconcileCycle('),src.indexOf('async function segmentationCycles('));
test('nightly EFC cycle reads an array of 031120 records using the selected date, without loading OCP',async()=>{
 const headers=['MAPA','FASE','DTOPER','HROPER','PLACA','VEICULO','EMISSAO'];const records=[{headers,raw_values:['100','Carregado','06/10/2026','05:00:00','ABC1D23','1','06/10/2026'],completed_at:'2026-10-06T08:00:00Z'}];let saved,filters=[];
 const cycle={reference_date:'2026-10-06',status:'running'},file={rows:[{date:'2026-10-06',map:'100',plate:'ABC1D23',vehicle:'1',eligible:true}],source_file:'MAPAS.xlsx',updated_at:'2026-10-06T07:00:00Z'};
 const db={from(table){const q={select(){return q},eq(){return q},gte(k,v){filters.push([table,k,v]);return q},lt(k,v){filters.push([table,k,v]);return q},order(){return q},in(){return q},update(p){saved=p;return q},maybeSingle:async()=>({data:table==='efc_night_cycles'?cycle:file,error:null}),then:f=>Promise.resolve({data:records,error:null}).then(f)};return q},rpc(){throw Error('The cycle must not load the OCP dashboard')}};
 const context={db,all:async make=>(await make()).data,check:e=>{if(e)throw e},cycleResult,sharedEvents};vm.createContext(context);vm.runInContext(stripTypeScriptTypes(definition),context);const result=await context.reconcileCycle('2026-10-06');
 assert.equal(result.status,'completed');assert.equal(result.matched,1);assert.equal(saved.report_import_at,'2026-10-06T08:00:00Z');assert.deepEqual(filters,[['report_031120_current','reference_date','2026-10-04'],['report_031120_current','reference_date','2026-10-07']]);
});
