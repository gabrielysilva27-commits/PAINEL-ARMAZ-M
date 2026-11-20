import test from 'node:test';
import assert from 'node:assert/strict';
import {productGroups} from '../supabase/functions/bo-api/group-confront.mjs';
const source=(id,total,repacked=0,discarded=total-repacked)=>({id,bo_number:'BO-'+id,employee_name:'Responsável '+id,items:[{id:id*10,sku_code:'13201',sku_name:'BRAHMA',total_qty:total,repacked_qty:repacked,discarded_qty:discarded}]});
test('one product has one total and retains each BO and responsible',()=>{
 const group=productGroups([source(1,2),source(2,3)],{'13201':5})[0];
 assert.equal(group.items.length,2);
 assert.deepEqual(group.allocations.map(x=>x.discarded),[2,3]);
 assert.equal(group.items[1].employee,'Responsável 2');
});
test('single BO difference is applied directly',()=>{
 assert.equal(productGroups([source(1,2)],{'13201':3})[0].allocations[0].discarded,3);
});
test('several BOs with different total wait for Control',()=>{
 assert.equal(productGroups([source(1,2),source(2,3)],{'13201':4})[0].allocations,null);
});
test('Control allocates discard only and preserves original total and repacked',()=>{
 const sources=[source(1,8,1,2),source(2,12,3,3)];
 assert.throws(()=>productGroups(sources,{'13201':4},{10:{discarded:2},20:{discarded:3}}));
 assert.throws(()=>productGroups(sources,{'13201':4},{10:{discarded:-1},20:{discarded:5}}));
 const group=productGroups(sources,{'13201':4},{10:{discarded:1},20:{discarded:3}})[0];
 assert.deepEqual(group.allocations.map(x=>[x.total,x.repacked,x.discarded]),[[8,1,1],[12,3,3]]);
});
test('zero counts are accepted, missing, negative and invalid counts are rejected',()=>{
 assert.equal(productGroups([source(1,2)],{'13201':0})[0].allocations[0].discarded,0);
 for(const value of ['',null,-1,'x',1000001])assert.throws(()=>productGroups([source(1,2)],{'13201':value}));
});
test('Michelob example uses 2 TT Descarte, never 8 Total',()=>{
 const group=productGroups([source(1,8,0,2)],{'13201':2})[0];
 assert.equal(group.expected,2);
 assert.equal(group.quantity_basis,'discarded_qty');
 assert.deepEqual(group.allocations,[{item_id:10,total:8,repacked:0,discarded:2}]);
});
test('zero discard does not erase total or repacked',()=>{
 assert.deepEqual(productGroups([source(1,8,4,2)],{'13201':0})[0].allocations,[{item_id:10,total:8,repacked:4,discarded:0}]);
});
test('higher discard retains repacked and only raises total when required for consistency',()=>{
 assert.deepEqual(productGroups([source(1,8,4,2)],{'13201':6})[0].allocations,[{item_id:10,total:10,repacked:4,discarded:6}]);
});
