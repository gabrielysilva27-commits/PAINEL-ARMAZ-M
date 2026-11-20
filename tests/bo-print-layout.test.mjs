import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {BO_PRINT_CSS} from '../bo/print-layout.mjs';
const code=fs.readFileSync(new URL('../bo-control-v2.js',import.meta.url),'utf8').replace(/^  const interviewDocumentReady=.*$/m,'  const interviewDocumentReady=Promise.resolve();').replace('window.__boControl={open};','window.__boControl={open,paperHtml};');
const sandbox={window:{},document:{}};vm.runInNewContext(code,sandbox);
const row={bo_number:'BO-TESTE',occurrence_date:'2026-11-20',occurrence_time:'11:00',shift:'A',movement_type:'Saída',location:'Picking',employee_name:'Pessoa teste',employee_function:'AJUDANTE',subject_type:'Funcionário',reason:'Falha no Manuseio',responsibility:'Conferente',items:Array.from({length:20},(_,i)=>({line_no:i+1,sku_code:String(1000+i),sku_name:'PRODUTO '+i,total_qty:8,repacked_qty:0,discarded_qty:2}))};
test('print layout keeps A4 columns independently of mobile media rules',()=>{
 assert.match(BO_PRINT_CSS,/\.bo-paper-top\{[^}]*grid-template-columns:[^}]*!important/);assert.match(BO_PRINT_CSS,/\.bo-paper-local\{[^}]*grid-template-columns:[^}]*!important/);assert.match(BO_PRINT_CSS,/\.bo-paper-reasons\{[^}]*repeat\(4/);assert.match(BO_PRINT_CSS,/\.bo-paper-footer\{[^}]*grid-template-columns:[^}]*!important/);
});
test('dense print retains all 20 product lines and original BO fields',()=>{
 const html=sandbox.window.__boControl.paperHtml(row);assert.match(html,/bo-paper-dense/);for(const item of row.items)assert.ok(html.includes(item.sku_code));for(const field of ['TT DESCARTE','TT REEMBALADO','Técnico de Controle','Comentários:','Pessoa teste'])assert.ok(html.includes(field));
});
test('normal BO preserves original template and does not use dense table',()=>{
 assert.doesNotMatch(sandbox.window.__boControl.paperHtml({...row,items:row.items.slice(0,1)}),/bo-paper-dense/);
});
