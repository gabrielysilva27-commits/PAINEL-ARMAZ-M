import test from 'node:test';
import assert from 'node:assert/strict';
import {pickingSupply} from '../supabase/functions/efc-api/picking-supply.mjs';
const date='2026-11-03',capacity=[{sku:'13201',positions:11}],catalog=[{sku_code:'13201',boxes_per_pallet:90}],days=[{reference_date:date,status:'completed'}];
const line=(boxes,units=0)=>({date,product:'13201',boxes,units,closed:false});
test('mixed lines conserve boxes and keep only the remainder in picking, including lines with loose units',()=>{
 const r=pickingSupply([line(160),line(900),line(181,2)],capacity,catalog,days).rows[0];
 assert.equal(r.excluded_boxes,1170);assert.equal(r.boxes,71);assert.equal(r.units,2);
 assert.equal(r.boxes+r.excluded_boxes,1241);assert.equal(r.replenishment_boxes,71);assert.equal(r.estimated_pallets,0);
});
test('replenishment uses its workbook formula independently of rounded resupply pallets',()=>{
 for(const [boxes,replenishment,resupply] of [[989,989,0],[990,0,0],[991,1,1],[1081,91,2]]){
  const lines=Array.from({length:Math.floor(boxes/17)},()=>line(17));if(boxes%17)lines.push(line(boxes%17));
  const r=pickingSupply(lines,capacity,catalog,days).rows[0];
  assert.equal(r.replenishment_boxes,replenishment);assert.equal(r.estimated_pallets,resupply);
 }
});
