import test from 'node:test';
import assert from 'node:assert/strict';
import {ocpRules,withoutIgnoredMaps} from '../supabase/functions/efc-api/ocp-exceptions.mjs';
import {ocpDay} from '../supabase/functions/efc-api/ocp-source.mjs';
const exceptions=[{reference_date:'2026-10-02',map:526923,mode:'map_only'},{reference_date:'2026-10-01',map:526830,mode:'ignore'}];
test('only the authorized day and map accept a plate mismatch',()=>{
 const plans=[{map:'526923',plate:'RJM5A12'}],actual=[{map:'526923',plate:'RJV5I40'}];
 assert.equal(ocpDay(plans,actual).status,'waiting');
 assert.equal(ocpDay(ocpRules('2026-10-02',plans,exceptions),actual).status,'completed');
 assert.equal(ocpDay(ocpRules('2026-10-03',plans,exceptions),actual).status,'waiting');
 assert.equal(ocpDay(ocpRules('2026-10-02',plans,exceptions),[]).status,'waiting');
});
test('ignored maps are excluded from expected counts and dashboard rows without deleting other dates',()=>{
 const plans=[{map:'526830',plate:'AAA1234'},{map:'526831',plate:'BBB1234'}];
 assert.deepEqual(ocpDay(ocpRules('2026-10-01',plans,exceptions),[plans[1]]),{status:'completed',planned:1,matched:1,missing:[]});
 const rows=[{date:'2026-10-01',map:'526830'},{date:'2026-10-02',map:'526830'},{date:'2026-10-01',map:'526831'}];
 assert.deepEqual(withoutIgnoredMaps(rows,exceptions),rows.slice(1));
 assert.equal(plans.length,2);assert.equal(rows.length,3);
});
