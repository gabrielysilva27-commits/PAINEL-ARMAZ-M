import test from 'node:test';import assert from 'node:assert/strict';
import {hourLoads} from '../efc-analytics.mjs';
import {seriesChart} from '../efc-charts.mjs';
import {calculatePeriod} from '../efc-history.mjs';
import {visuals} from '../efc-dashboard.mjs';
test('hour drilldown returns only loaded cars in the clicked clock hour',()=>{
 const a={map:'1',loaded_at:'2026-10-01T03:59:00'},b={map:'2',loaded_at:'2026-10-01T04:00:00'},pending={map:'3',loaded_at:null};
 assert.deepEqual(hourLoads({loads:[a,b,pending]},3),[a]);
 const html=seriesChart({id:'hours',title:'Horários',data:[{hour:3,label:'03h',value:1}],series:[{key:'value',label:'Carros'}],bars:true});
 assert.match(html,/data-efc-chart-hour="3"/);
});
test('all main tabs render; partial coverage stays outside the chart grid and T2P explains its basis',()=>{
 const raw={picking_rows:[],picking_days:[{date:'2026-10-01',estimated:1,positions:208,boxes:10,capacity:200,missing_boxes:13,complete:false}]},c=calculatePeriod(raw,'2026-10');
 for(const tab of ['management','loading','productivity','supply'])assert.ok(visuals(tab,c,raw,{month:'2026-10',member:''},()=>''));
 const html=visuals('management',c,raw,{month:'2026-10'},()=> '');
 assert.match(html,/031120 -/);assert.doesNotMatch(html,/Aderência estimada/);
 assert.match(html,/efc-inline-status[^]*?<\/p><div class="efc-visual-grid">/);
});
