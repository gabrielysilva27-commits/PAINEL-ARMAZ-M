import test from 'node:test';import assert from 'node:assert/strict';import {ocpRetryGate} from '../supabase/functions/efc-api/ocp-cadence.mjs';
const base={now:Date.parse('2026-11-10T14:00:00-03:00'),target:'2026-11-09',job:{map_from:'527226',map_to:'529840'}};
test('successful broad export is not repeated within the daily window despite missing maps',()=>{
 const gate=ocpRetryGate({...base,completed:{started_at:'2026-11-10T10:00:00-03:00',map_from:527226,map_to:529840}});
 assert.equal(gate.blocked,true);assert.equal(gate.retry_after,'2026-11-11T00:00:00.000Z');
});
test('automatic failure waits an hour while explicit manual request remains available',()=>{
 assert.equal(ocpRetryGate({...base,lastScan:'2026-11-10T13:01:00-03:00'}).blocked,true);
 assert.equal(ocpRetryGate({...base,lastScan:'2026-11-10T13:00:00-03:00'}).blocked,false);
 assert.equal(ocpRetryGate({...base,lastScan:'2026-11-10T13:59:00-03:00',manual:true}).blocked,false);
});
test('new daily window and newly uncovered range can be collected',()=>{
 const completed={started_at:'2026-11-10T10:00:00-03:00',map_from:527226,map_to:529840};
 assert.equal(ocpRetryGate({...base,now:Date.parse('2026-11-10T21:00:00-03:00'),target:'2026-11-10',completed}).blocked,false);
 assert.equal(ocpRetryGate({...base,job:{map_from:'527226',map_to:'529999'},completed}).blocked,false);
});
