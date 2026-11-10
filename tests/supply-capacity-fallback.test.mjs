import test from 'node:test';import assert from 'node:assert/strict';import {supplyCapacities} from '../supabase/functions/efc-api/picking-supply.mjs';
test('keeps layout positions, defaults absent or zero positions to 1P, excludes non-picking products',()=>{
 const catalog=[{sku_code:'13201',sku_name:'BRAHMA CHOPP GFA VD 300ML'},{sku_code:'2',sku_name:'REFRIGERANTE PET'},{sku_code:'3',sku_name:'SEM POSICAO'},{sku_code:'4',sku_name:'CHOPP BARRIL 50L'},{sku_code:'5',sku_name:'BAG IN BOX'},{sku_code:'6',sku_name:'MARKETPLACE'}];
 const result=supplyCapacities([{sku_code:'13201',assigned_slots:11},{sku_code:'3',assigned_slots:0}],catalog.map(p=>({product:p.sku_code})),catalog,[{sku_code:'6'}]);
 assert.deepEqual(result.map(x=>[x.sku,x.positions]),[['13201',11],['3',1],['2',1]]);
});
