const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../agent-puxada/lib/outlook-segmentations');
const table='<table><tr><th>Mapa</th><th>Veículo</th><th>Cod. PDV</th></tr><tr><td>527097</td><td>240</td><td>27021</td></tr><tr><td>527097</td><td>240</td><td>27021</td></tr><tr><td>527097</td><td>240</td><td>33544</td></tr></table>';
test('uses operational subject date, deduplicates clients, preserves multiple clients per map',()=>{
 const result=parse({key:'x',subject:'SEGMENTAÇÃO DE CLIENTES COM EMPILHADEIRA DIA 06/10/2026',received_at:'2026-10-05T23:00:00Z',html:table});
 assert.equal(result.date,'2026-10-06');assert.equal(result.status,'parsed');assert.equal(result.rows.length,2);
 assert.equal(result.rows[0].map,'527097');
});
test('does not read quoted prior emails or silently count broken rows',()=>{
 const result=parse({key:'x',subject:'SEGMENTAÇÃO DE CLIENTES COM EMPILHADEIRA DIA 06/10/2026',html:table+'<blockquote>'+table.replaceAll('527097','100')+'</blockquote>'});
 assert.equal(result.rows.length,2);
 assert.equal(parse({subject:'SEGMENTAÇÃO DE CLIENTES COM EMPILHADEIRA DIA 06/10/2026',html:table.replace('27021','-')}).status,'review');
});
test('missing table and unrelated emails do not become zero segmentations',()=>{
 assert.equal(parse({subject:'SEGMENTAÇÃO DE CLIENTES COM EMPILHADEIRA DIA 06/10/2026',html:'imagem'}).status,'review');
 assert.equal(parse({subject:'RE: outro assunto',html:table}),null);
});
