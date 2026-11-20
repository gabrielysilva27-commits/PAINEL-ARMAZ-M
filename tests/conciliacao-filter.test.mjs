import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRecountItems} from '../conciliacao-core.mjs';
const items=[
 {sku_code:'1',sku_name:'Água',instruction:'Tudo',status:'pending'},
 {sku_code:'2',sku_name:'Cerveja',instruction:'Palete',status:'completed'},
 {sku_code:'3',sku_name:'Água mineral',instruction:'L e Cx + un',status:'pending'},
 {sku_code:'4',sku_name:'Refrigerante',instruction:'L e Cx',status:'counting'},
 {sku_code:'5',sku_name:'Água',instruction:'Un',status:'pending',pallets:10},
 {sku_code:'6',sku_name:'Cerveja',instruction:'Palete + un',status:'pending'}
];
const codes=rows=>rows.map(i=>i.sku_code);
test('component follows requested instruction, including Tudo and combinations',()=>{
 assert.deepEqual(codes(filterRecountItems(items,{component:'pallets'})),['1','2','6']);
 assert.deepEqual(codes(filterRecountItems(items,{component:'layers'})),['1','3','4']);
 assert.deepEqual(codes(filterRecountItems(items,{component:'boxes'})),['1','3','4']);
 assert.deepEqual(codes(filterRecountItems(items,{component:'units'})),['1','3','5','6']);
});
test('component combines with search and status without changing counts',()=>{
 const snapshot=JSON.stringify(items);
 assert.deepEqual(codes(filterRecountItems(items,{query:'agua',status:'pending',component:'boxes'})),['1','3']);
 assert.deepEqual(codes(filterRecountItems(items,{query:'3',component:'layers'})),['3']);
 assert.deepEqual(filterRecountItems(items,{status:'completed',component:'units'}),[]);
 assert.equal(JSON.stringify(items),snapshot);
});
test('status filter keeps in-progress drafts and clearing component restores all items',()=>{
 assert.deepEqual(codes(filterRecountItems(items,{status:'counting',component:'units'},i=>i.sku_code==='3'?'counting':i.status)),['3']);
 assert.equal(filterRecountItems(items).length,items.length);
});
