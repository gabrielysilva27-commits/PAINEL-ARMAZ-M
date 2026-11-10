import test from 'node:test';import assert from 'node:assert/strict';
import {pickingSupply} from '../supabase/functions/efc-api/picking-supply.mjs';
import {calculatePeriod} from '../efc-history.mjs';
const capacity=[{sku:'1',positions:2,palletization:100}],catalog=[{sku_code:'1',boxes_per_pallet:100}];
const row=(boxes,pallet='A',more={})=>({map:'1',date:'2026-10-01',product:'1',pallet,boxes,closed:false,...more});
const days=[{reference_date:'2026-10-01',status:'completed'}];
test('closed pallets and falsely open whole pallets are removed before daily aggregation',()=>{
 const r=pickingSupply([row(100),row(200,'B'),row(50,'C'),row(20,'D',{closed:true})],capacity,catalog,days);
 assert.equal(r.rows[0].boxes,70);assert.equal(r.rows[0].excluded_boxes,300);assert.equal(r.rows[0].estimated_pallets,0);assert.equal(r.daily[0].boxes,70);assert.equal(r.daily[0].capacity,200);assert.equal(r.daily[0].complete,true);
});
test('workbook rounding and capacity subtraction are kept, without capping rates',()=>{
 const r=pickingSupply([row(531)],capacity,catalog,days);
 assert.equal(r.rows[0].estimated_pallets,3.4);assert.equal(r.rows[0].replenishment_boxes,331);assert.equal(r.daily[0].positions,2);
});
test('partial product lines stay in picking even when their sum equals a whole pallet',()=>{
 const r=pickingSupply([row(40),row(60),row(50,'B'),row(50,'B',{map:'2'})],capacity,catalog,days);assert.equal(r.rows[0].excluded_boxes,0);assert.equal(r.rows[0].boxes,200);
});
test('missing palletization is visible and cannot become a calculated zero',()=>{
 const r=pickingSupply([row(13,'A',{product:'2'})],capacity,catalog,days);assert.equal(r.rows[0].estimated_pallets,null);assert.deepEqual(r.daily[0].missing_skus,['2']);assert.equal(r.daily[0].missing_boxes,13);assert.equal(r.daily[0].complete,false);
});
test('month and daily filters recompute both rates from sums',()=>{
 const data={helpers:[{id:'a',date:'2026-10-01',name:'A',pallets:100},{id:'b',date:'2026-10-02',name:'A',pallets:200}],picking_rows:[],picking_days:[{date:'2026-10-01',estimated:10,positions:208,boxes:100,capacity:200,complete:true},{date:'2026-10-02',estimated:20,positions:208,boxes:300,capacity:200,complete:true}]};
 const c=calculatePeriod(data,'2026-10');assert.equal(c.summary.resupply_rate,30/300);assert.equal(c.replenishmentSummary.rate,1);
 const d=calculatePeriod(data,'2026-10','2026-10-01');assert.equal(d.summary.resupply_rate,10/100);assert.equal(d.replenishmentSummary.rate,.5);
});
test('every product gets at least one position only in calculation, preserving original capacities',()=>{
 const original=[{sku:'1',positions:0,palletization:100}];
 const r=pickingSupply([row(151),row(151,'B',{product:'2'})],original,[...catalog,{sku_code:'2',boxes_per_pallet:100}],days);
 assert.deepEqual(r.rows.map(x=>x.positions),[1,1]);
 assert.deepEqual(r.rows.map(x=>x.estimated_pallets),[.6,.6]);
 assert.equal(r.daily[0].capacity,200);assert.equal(original[0].positions,0);
});
test('Brahma 13201 uses 90 boxes from 01.11, regardless of OCP flags or obsolete override',()=>{
 const data=[180,900,450,540,160].map((boxes,i)=>({...row(boxes,'P'+i),product:'13201',closed:false}));
 data.push({...row(20,'OTHER'),product:'13201',closed:true});
 const result=pickingSupply(data,[{sku:'13201',positions:1,palletization:999,adjustment_reason:'old'}],[{sku_code:'13201',boxes_per_pallet:90}],days);
 assert.equal(result.rows[0].palletization,90);assert.equal(result.rows[0].excluded_boxes,2070);assert.equal(result.rows[0].boxes,180);
});
test('zero picking demand still contributes its daily physical capacity',()=>{
 const r=pickingSupply([row(100)],capacity,catalog,days);
 assert.equal(r.daily[0].boxes,0);assert.equal(r.daily[0].estimated,0);assert.equal(r.daily[0].capacity,200);assert.equal(r.daily[0].positions,2);
});
