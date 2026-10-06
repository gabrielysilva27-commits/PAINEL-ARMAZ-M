import test from 'node:test';
import assert from 'node:assert/strict';
import {wmsAdherence,wmsDay} from '../efc-wms.mjs';
import {calculatePeriod} from '../efc-history.mjs';
const plans=(date='2026-10-06',count=24)=>Array.from({length:count},(_,i)=>({date,map:String(100+i),vehicle:String(200+i),plate:'ABC'+String(1000+i),eligible:true}));
const email=(rows,date='2026-10-06',received='2026-10-05T23:00:00Z')=>({id:received,date,received_at:received,status:'parsed',rows});
const row=i=>({map:String(100+i),vehicle:String(200+i),customer:'300'});
test('counts maps once, not segmented customers, and excludes REC and duplicate plans',()=>{
 const p=[...plans(),plans()[0],{date:'2026-10-06',map:'900',plate:'REC1234',vehicle:'900'}];
 const r=wmsDay('2026-10-06',p,[email([row(0),{...row(0),customer:'301'},row(1),row(2)])]);
 assert.equal(r.planned,24);assert.equal(r.segmented,3);assert.equal(r.rate,21/24);
});
test('missing mail stays pending; weighted period uses only reconciled days',()=>{
 const r=wmsAdherence([...plans(),...plans('2026-10-07',10)],[email([row(0),row(1),row(2)])]);
 assert.equal(r.rate,.875);assert.equal(r.planned,24);assert.equal(r.pending_days,1);assert.equal(r.partial,true);
 assert.equal(r.daily[1].rate,null);
});
test('latest email replaces earlier lists, while latest unreadable revision blocks closure',()=>{
 const old=email([row(0),row(1),row(2)]),latest=email([row(0)],'2026-10-06','2026-10-06T01:00:00Z');
 assert.equal(wmsDay('2026-10-06',plans(),[old,latest]).segmented,1);
 assert.equal(wmsDay('2026-10-06',plans(),[old,{...latest,status:'review'}]).rate,null);
});
test('unique vehicle reconciles replacement; unmatched or ambiguous maps cannot create a percentage',()=>{
 const replaced={map:'999',vehicle:'200',customer:'300'};
 assert.equal(wmsDay('2026-10-06',plans(),[email([replaced])]).segmented,1);
 assert.equal(wmsDay('2026-10-06',plans(),[email([{...replaced,vehicle:'999'}])]).rate,null);
 const ambiguous=[...plans(),{...plans()[0],map:'500',plate:'XYZ1234'}];
 assert.equal(wmsDay('2026-10-06',ambiguous,[email([replaced])]).rate,null);
});
test('day filter applies to segmentation data and leaves existing RF metric independent',()=>{
 const c=calculatePeriod({pcd:[...plans(),...plans('2026-10-07',10)],events:[],segmentations:[email([row(0)]),email([row(0)],'2026-10-07')]},'2026-10','2026-10-06');
 assert.equal(c.wmsEstimate.daily.length,1);assert.equal(c.wmsEstimate.rate,23/24);assert.equal(c.summary.wms,null);
});
