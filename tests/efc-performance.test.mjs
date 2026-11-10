import test from 'node:test';
import assert from 'node:assert/strict';
import {periodMemo} from '../efc-performance.mjs';
test('tabs reuse the same period calculation, but new data and corrections invalidate it',()=>{
 let calls=0;const calc=periodMemo((data,month,day,week,history)=>({calls:++calls,data,month,day,week,history}));
 const data={helpers:[]},history={summary:{}};
 const first=calc(data,'2026-11','','',history);
 assert.equal(calc(data,'2026-11','','',history),first);assert.equal(calls,1);
 assert.notEqual(calc(data,'2026-11','2026-11-01','',history),first);
 assert.notEqual(calc(data,'2026-11','','2026-11-02',history),first);
 assert.notEqual(calc({...data},'2026-11','','',history),first);
 assert.notEqual(calc(data,'2026-11','','',{...history}),first);
});
test('period cache is bounded and preserves returned values',()=>{
 let calls=0;const calc=periodMemo((data,month,day)=>({day,call:++calls}),2),data={};
 const a=calc(data,'2026-11','01');calc(data,'2026-11','02');calc(data,'2026-11','03');
 assert.notEqual(calc(data,'2026-11','01'),a);assert.equal(calls,4);
});
