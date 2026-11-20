import test from 'node:test';
import assert from 'node:assert/strict';
import {productGroups} from '../supabase/functions/bo-api/group-confront.mjs';
const source=(id,total,repacked=0)=>({id,bo_number:'BO-'+id,employee_name:'Responsável '+id,items:[{id:id*10,sku_code:'13201',sku_name:'BRAHMA',total_qty:total,repacked_qty:repacked}]});
test('one product has one total and retains each BO and responsible',()=>{
 const group=productGroups([source(1,2),source(2,3)],{'13201':5})[0];
 assert.equal(group.items.length,2);
 assert.deepEqual(group.allocations.map(x=>x.total),[2,3]);
 assert.equal(group.items[1].employee,'Responsável 2');
});
test('single BO difference is applied directly',()=>{
 assert.equal(productGroups([source(1,2)],{'13201':3})[0].allocations[0].total,3);
});
test('several BOs with different total wait for Control',()=>{
 assert.equal(productGroups([source(1,2),source(2,3)],{'13201':4})[0].allocations,null);
});
test('Control allocation must equal counted total and preserve repacked quantity',()=>{
 const sources=[source(1,2,1),source(2,3)];
 assert.throws(()=>productGroups(sources,{'13201':4},{10:{total:2},20:{total:3}}));
 assert.throws(()=>productGroups(sources,{'13201':4},{10:{total:0},20:{total:4}}));
 const group=productGroups(sources,{'13201':4},{10:{total:1},20:{total:3}})[0];
 assert.deepEqual(group.allocations.map(x=>[x.total,x.repacked]),[[1,1],[3,0]]);
});
test('zero counts are accepted, missing, negative and invalid counts are rejected',()=>{
 assert.equal(productGroups([source(1,2)],{'13201':0})[0].allocations[0].total,0);
 for(const value of ['',null,-1,'x',1000001])assert.throws(()=>productGroups([source(1,2)],{'13201':value}));
});
test('a count below repacked quantity requires Control rather than changing that quantity',()=>{
 assert.equal(productGroups([source(1,2,2)],{'13201':1})[0].allocations,null);
});
