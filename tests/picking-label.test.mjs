import test from 'node:test';
import assert from 'node:assert/strict';
import {productLabel} from '../conferente/placas/product-label.mjs';
import {createPinRecord,verifyPinRecord,validPinInput} from '../supabase/functions/bo-api/pin-crypto.mjs';
test('OCP multipack remains distinct from standard guarana',()=>{
 const base={code:'9084',description:'GUARANA CHP ANTARCTICA LATA 350ML SH C/12 NPAL',packaging:'LATA 355'};
 const normal=productLabel(base),mp=productLabel({...base,code:'34027',description:base.description+' MUL'});
 assert.equal(normal.name,'GUARANÁ ANTARCTICA');assert.equal(normal.size,'350ML');assert.equal(normal.details,'LATA · C/12');assert.equal(mp.details,'LATA · MP · C/12');
});
test('zero, volume and unknown distinctions survive abbreviation',()=>{
 const label=productLabel({code:'1234567',description:'GUARANA ZERO SABOR ESPECIAL PET 2L C/6 MULTPACK 1'});
 assert.match(label.name,/ZERO SABOR ESPECIAL/);assert.equal(label.size,'2L');assert.match(label.details,/PET · MP · C\/6/);
 assert.equal(productLabel({code:'1',description:'PRODUTO SEM VOLUME'}).size,'');
});
test('master PIN requires a linked identity and still verifies its full hash',async()=>{
 const record=await createPinRecord('ADM',{master:true});
 assert.equal(validPinInput('ADM',{}),false);
 assert.equal((await verifyPinRecord('ADM',record)).valid,false);
 assert.equal((await verifyPinRecord('ADM',{...record,master_app_user_id:'admin-fixture'})).valid,true);
 assert.equal((await verifyPinRecord('BAD',{...record,master_app_user_id:'admin-fixture'})).valid,false);
});
