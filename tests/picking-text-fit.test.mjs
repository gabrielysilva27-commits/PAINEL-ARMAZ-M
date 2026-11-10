import test from 'node:test';
import assert from 'node:assert/strict';
import {fittedFont} from '../conferente/placas/text-fit.mjs';
import {productLabel} from '../conferente/placas/product-label.mjs';
const measure=(text,size)=>text.length*size*.65;
test('volume occupies the large bottom block, independently of preview scale',()=>{
 const size=fittedFont('300ML',710,245,250,measure,1);
 assert.ok(size>=200);assert.ok(measure('300ML',size)<=710);assert.ok(size<=245);
});
test('long descriptions wrap while long words shrink to fit',()=>{
 const size=fittedFont('PRODUTO ZERO SABOR ESPECIAL',700,280,132,measure);
 assert.ok(size>50);assert.ok(size<132);
 const word=fittedFont('ABCDEFGHIJKLMNOPQRST',700,280,132,measure);
 assert.ok(measure('ABCDEFGHIJKLMNOPQRST',word)<=700);
});
test('Brahma glass packaging is brief and volume appears separately',()=>{
 const label=productLabel({code:'13201',description:'BRAHMA CHOPP GFA VD 300ML CX C/23',packaging:'GFA VD 300ML'});
 assert.equal(label.name,'BRAHMA CHOPP');assert.equal(label.details,'GARRAFA · C/23');assert.equal(label.size,'300ML');
});
