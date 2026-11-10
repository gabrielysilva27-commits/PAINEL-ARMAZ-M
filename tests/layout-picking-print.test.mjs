import test from 'node:test';import assert from 'node:assert/strict';
import {layoutPrintDocument} from '../layout-picking-print.mjs';
import {readFileSync} from 'node:fs';
test('one landscape A4 sheet contains the selected month and complete physical map',()=>{
 const cells=['CX1','R1','PF1','FR1'].map(street=>'<article class="croqui-lane" data-street="'+street+'"><div class="picking-slot a">9084</div></article>').join('');
 const html=layoutPrintDocument({mapHtml:'<div class="croqui-canvas">'+cells+'</div>',month:'2026-11',usedSlots:207});
 assert.equal((html.match(/<section class="sheet">/g)||[]).length,1);
 for(const street of ['CX1','R1','PF1','FR1'])assert.ok(html.includes('data-street="'+street+'"'));
 assert.ok(html.includes('11/2026'));assert.ok(html.includes('207 / 207'));
 assert.ok(html.includes('size:A4 landscape'));assert.ok(html.includes('height:193mm'));
 assert.ok(html.includes('opacity:1!important'));
});
test('missing month or unloaded map cannot produce a misleading printout',()=>{
 assert.throws(()=>layoutPrintDocument({month:'',mapHtml:''}),/Carregue/);
 assert.throws(()=>layoutPrintDocument({month:'2026-11',mapHtml:''}),/Carregue/);
});
test('capacity warning is included when the layout has products without positions',()=>{
 const html=layoutPrintDocument({month:'2026-11',mapHtml:'<div>Mapa</div>',usedSlots:200,overflow:5});
 assert.ok(html.includes('5 SKUs sem posição'));
});
test('print snapshot is pinned to the loaded month during concurrent month navigation',async()=>{
 const source=readFileSync(new URL('../layout-picking-lite.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('  async function loadMonth(){'),source.indexOf('  async function printLayout(){'));
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const L={month:'2026-10',cache:new Map(),plan:{old:true},items:[],loadedMonth:null};let release;
 const pending=new Promise(resolve=>release=resolve);const button={disabled:false};let rendered=0;
 const run=new AsyncFunction('L','$','renderMonths','monthInfo','lapi','renderFilters','renderPlan',fn+';return loadMonth();');
 const request=run(L,()=>button,()=>{},()=>true,()=>pending,()=>{},()=>rendered++);
 L.month='2026-11';release({items:[{code:'1'}],plan:{month:'2026-10'}});await request;
 assert.equal(L.loadedMonth,null);assert.equal(button.disabled,true);assert.equal(rendered,0);assert.equal(L.cache.get('2026-10').plan.month,'2026-10');
});
