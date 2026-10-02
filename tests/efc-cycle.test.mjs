import test from 'node:test';import assert from 'node:assert/strict';
import {cycleTarget,cycleResult,frozenEvents} from '../supabase/functions/efc-api/efc-cycle.mjs';
import {createRequire} from 'node:module';const require=createRequire(import.meta.url),{efcTarget,nightSync}=require('../agent-puxada/lib/efd-sync.js');
test('21h Brazil opens tomorrow; midnight and morning resume same day even after missed startup',()=>{
 for(const [time,target] of [['2026-10-02T23:59:59Z','2026-10-02'],['2026-10-03T00:00:00Z','2026-10-03'],['2026-10-03T03:00:00Z','2026-10-03'],['2026-10-03T11:00:00Z','2026-10-03'],['2026-11-01T00:00:00Z','2026-11-01']]){assert.equal(cycleTarget(new Date(time)),target);assert.equal(efcTarget(new Date(time)),target);}
});
const plans=[{map:'1',plate:'AAA1234',eligible:true},{map:'2',plate:'BBB1234',eligible:true}];
const event=map=>({map,phase:'Carregado',date:'2026-10-03',time:'05:00:00',plate:'ZZZ1234'});
test('EFC stays pending until every planned map has a loading phase; changed vehicle is supported',()=>{
 assert.equal(cycleResult('2026-10-03',[],[]).status,'waiting');
 assert.deepEqual(cycleResult('2026-10-03',plans,[event('1')]).matched,1);
 assert.equal(cycleResult('2026-10-03',plans,[event('1')]).status,'running');
 assert.equal(cycleResult('2026-10-03',plans,[event('1'),event('2')]).status,'completed');
 assert.equal(cycleResult('2026-10-03',plans,[{...event('1'),phase:'Carga Montada'},event('2')]).status,'running');
 assert.equal(cycleResult('2026-10-03',plans,[{...event('1'),date:'2026-09-30'},event('2')]).status,'running');
});
test('EFC snapshot is stable after completion while unrelated shared report records remain usable',()=>{
 const old=event('1'),changed={...old,time:'08:00:00'},other=event('99');
 const result=frozenEvents([changed,other],[{plans:[plans[0]],events:[old]}]);assert.equal(result.find(e=>e.map==='1').time,'05:00:00');assert.ok(result.some(e=>e.map==='99'));
});
test('completed EFC target performs no API or filesystem work on repeated runs and restart',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error('Closed EFC must not call the API');};
 try{for(const state of [{efcClosedTarget:'2026-10-03',efcPending:[]},JSON.parse(JSON.stringify({efcClosedTarget:'2026-10-03',efcPending:[]}))])await nightSync({}, {root_path:'/does-not-exist'},state,()=>{},Date.parse('2026-10-03T11:00:00Z'));}finally{globalThis.fetch=previous;}
});

test('night completion supports unique replacement map and ignores REC',()=>{const plans=[{map:'1',plate:'ABC1234',date:'2026-10-03'},{map:'2',plate:'REC0001',date:'2026-10-03'}];const replacement={...event('99'),plate:'ABC1234',emission:'2026-10-03'};assert.equal(cycleResult('2026-10-03',plans,[replacement]).planned,1);assert.equal(cycleResult('2026-10-03',plans,[replacement]).status,'completed');assert.equal(cycleResult('2026-10-03',plans,[replacement,{...replacement,map:'100'}]).status,'running');});
