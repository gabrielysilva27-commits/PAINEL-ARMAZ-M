import test from 'node:test';import assert from 'node:assert/strict';
import {platePositions} from '../supabase/functions/layout-api/plate-positions.mjs';
import {batchLabels,batchDocument} from '../conferente/placas/batch-print.mjs';
test('Flow Rack is a separate batch with its two-column order and no frontal signs',()=>{
 const plan={main:[{id:'R1',slots:[{sku_code:'1'}]}],front:[{id:'PF1',slots:[{sku_code:'2'}]},{id:'PF2',slots:[{sku_code:'3'}]}],flow:{items:[{sku_code:'4'},{sku_code:'5'},{sku_code:'6'}]}};
 assert.deepEqual(platePositions(plan,'flow').map(x=>[x.street,x.position,x.code]),[['FR1',1,'4'],['FR1',2,'6'],['FR2',1,'5']]);
 assert.deepEqual(platePositions(plan).map(x=>x.code),['1']);
 assert.throws(()=>platePositions(plan,'invalid'),/Área/);
});
test('picking includes main streets and excludes caixaria, frontal lanes and Flow Rack',()=>{
 const positions=platePositions({caixaria:[{id:'CX1',slots:[{sku_code:'1'},null,{sku_code:'1'}]}],main:[{id:'R1',slots:[{sku_code:'2'}]}],front:[{id:'PF1',slots:[{sku_code:'3'}]}],flow:{items:[{sku_code:'4'},{sku_code:'5'},{sku_code:'6'}]},overflow:[{sku_code:'99'}]});
 assert.deepEqual(positions.map(x=>[x.street,x.position,x.code]),[['R1',1,'2']]);
});
test('all caixaria lanes are excluded while the same SKU elsewhere keeps its signs',()=>{
 const caixaria=Array.from({length:7},(_,i)=>({id:'CX'+(i+1),slots:Array.from({length:12},()=>({sku_code:'13201'}))}));
 const positions=platePositions({caixaria,main:[{id:'R1',slots:[{sku_code:'13201'},{sku_code:'13201'}]}],front:[],flow:{items:[]}});
 assert.equal(positions.length,2);assert.ok(positions.every(x=>x.street==='R1'&&x.code==='13201'));
});
test('one page per occupied position preserves repetitions and escapes source text',()=>{
 const product={code:'1',description:'PRODUTO ZERO <B> LATA 350ML'};
 const labels=batchLabels([{code:'1',product},{code:'1',product}]);
 const html=batchDocument(labels,(text,size)=>text.length*size*.6);
 assert.equal((html.match(/<section class="page">/g)||[]).length,2);
 assert.ok(html.includes('ZERO &lt;B&gt;'));assert.ok(html.includes('size:A4 landscape'));assert.ok(html.includes('.page:last-child{break-after:auto'));
});
test('missing OCP description or volume blocks the whole batch rather than dropping positions',()=>{
 assert.throws(()=>batchLabels([{code:'8',product:null}]),/códigos: 8/);
 assert.throws(()=>batchLabels([{code:'9',product:{code:'9',description:'SEM VOLUME'}}]),/códigos: 9/);
 assert.throws(()=>batchLabels([]),/não possui/);
});
test('Promax PET labels supply litres and preserve flavour distinctions',()=>{
 const labels=batchLabels([{code:'13065',product:{code:'13065',description:'H2OH LIMONETO PET 1,5 SHRINK C/06 NPAL',packaging:'026 - PET 1,5'}},{code:'8418',product:{code:'8418',description:'PEPSI COLA PET 1500 CX06',packaging:'PET 1,5'}}]);
 assert.equal(labels[0].size,'1,5L');assert.equal(labels[0].name,'H2OH LIMONETO');assert.equal(labels[1].name,'PEPSI COLA');assert.equal(labels[1].size,'1,5L');
});
