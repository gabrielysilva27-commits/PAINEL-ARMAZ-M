import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{},Intl,Date,TextDecoder,TextEncoder,console};
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../oor.js',import.meta.url),'utf8').replace('  install();','  window.testOor={parseMalha,indicatorCards,weeklyContent,S};'),context);
const {parseMalha,indicatorCards,weeklyContent,S}=context.window.testOor;
const file=text=>({name:'malha.csv',arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
test('malha importa só a semana selecionada e só quantidades positivas',async()=>{
 const skus=await parseMalha(file('Data Puxada;Cód. Produto;Malha Disponível (SKU)\n06/10/2026;13203;100\n07/10/2026;9427;0\n13/10/2026;9320;20'),'2026-10-06');
 assert.deepEqual(Array.from(skus),['13203']);
});
test('malha antiga e data ausente não são aceitas como programação atual',async()=>{
 await assert.rejects(parseMalha(file('Data Puxada;Cód. Produto\n24/10/2025;13203'),'2026-10-06'),/não tem programação/);
 await assert.rejects(parseMalha(file('Data Puxada;Cód. Produto\n;13203'),'2026-10-06'),/sem Data Puxada válida/);
});
test('indicador distingue malha pendente de zero e retira a legenda pedida',()=>{
 const base={occupation_pct:.8,stock_qty:80,capacity_qty:100,innovation_pct:.1,innovation_count:1,product_count:10,config_month:'2026-09'};
 assert.match(indicatorCards({...base,unavailable_count:null,unavailable_pct:null}),/Aguardando malha semanal/);
 assert.doesNotMatch(indicatorCards({...base,unavailable_count:0,unavailable_pct:0}),/Aguardando|Capacidade, INNO e malha/);
 S.week='2026-09-27';S.dash={indicators:{weekly:[{...base,week_start:S.week,week_end:'2026-10-03',unavailable_count:0,unavailable_pct:0,rows:[{...base,reference_date:'2026-09-30'},{...base,reference_date:'2026-10-01'}]}]}};
 assert.match(weeklyContent(),/30\/09\/2026/);assert.match(weeklyContent(),/01\/10\/2026/);
});
