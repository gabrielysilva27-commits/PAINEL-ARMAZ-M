import test from 'node:test';
import assert from 'node:assert/strict';
import {quarterDefinition,quarterActivation,validateQuarterDays} from '../supabase/functions/stock-api/quarterly-policy.mjs';
test('quatro políticas usam o trimestre civil e o trimestre anterior, incluindo a virada do ano',()=>{
 const q1=quarterDefinition(2026,1);assert.deepEqual(q1,{code:'T1/2026',effective_start:'2026-01-01',effective_end:'2026-03-31',review_start:'2025-10-01',review_end:'2025-12-31'});
 assert.equal(quarterDefinition(2026,2).review_start,'2026-01-01');
 assert.equal(quarterDefinition(2026,3).effective_end,'2026-09-30');
 assert.equal(quarterDefinition(2026,4).review_end,'2026-09-30');
 assert.throws(()=>quarterDefinition(2026,5));
});
test('102 dias não podem preencher uma política baseada em julho a setembro',()=>{
 const q4=quarterDefinition(2026,4);assert.equal(validateQuarterDays(q4,102),false);assert.equal(validateQuarterDays(q4,78),true);assert.equal(validateQuarterDays(q4,0),false);
});
test('aprovação nova só começa depois de hoje e da última data registrada no OOR',()=>{
 const q4=quarterDefinition(2026,4);
 assert.deepEqual(quarterActivation(q4,'2026-10-05','2026-10-05'),{oor_enabled:true,oor_effective_start:'2026-10-06'});
 assert.equal(quarterActivation(q4,'2026-10-05','2026-10-08').oor_effective_start,'2026-10-09');
 assert.deepEqual(quarterActivation(quarterDefinition(2026,1),'2026-10-05','2026-10-05'),{oor_enabled:false,oor_effective_start:null});
 assert.equal(quarterActivation(quarterDefinition(2027,1),'2026-10-05','2026-10-05').oor_effective_start,'2027-01-01');
});
