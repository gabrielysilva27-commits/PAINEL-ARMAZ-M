import test from 'node:test';
import assert from 'node:assert/strict';
import {mayStart020501} from '../../supabase/functions/receiving-nri-api/scheduled-cadence.mjs';
const now=Date.parse('2026-11-13T18:00:00Z');
test('failed and expired scheduled 02.05.01 attempts wait at least one hour',()=>{
 for(const status of ['failed','lease-expired']){
  const last={status,started_at:new Date(now-65*60000).toISOString(),completed_at:new Date(now-59*60000).toISOString()};
  assert.equal(mayStart020501('scheduled',last,now),false);
  assert.equal(mayStart020501('scheduled',last,now+60000),true);
 }
});
test('manual sync bypasses the scheduled cadence, while a configured longer interval is respected',()=>{
 const last={completed_at:new Date(now-60*60000).toISOString()};
 assert.equal(mayStart020501('manual',last,now),true);
 assert.equal(mayStart020501('scheduled',last,now,120),false);
 assert.equal(mayStart020501('scheduled',last,now+60*60000,120),true);
 assert.equal(mayStart020501('scheduled',null,now),true);
});
