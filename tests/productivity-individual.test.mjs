import test from 'node:test';
import assert from 'node:assert/strict';
import {individualRows,standardHours,dailySeries,periodMonths} from '../productivity-individual.mjs';
const employee={id:'a',display_name:'FÁBIO LUCAS DOS SANTOS QUINTANILHA',job_title:'Ajudante',shift:'C'};
const task={id:'h1',name:'F.LUCAS',date:'2026-10-01',map:'001',pallets:3,start:'23:00:00',end:'00:30:00'};
test('EFC mantém paletes nominais, vira a meia-noite e concilia o nome da equipe',()=>{
 const rows=individualRows({team:[employee]},[{data:{helpers:[task]}}],'2026-10-01','2026-10-02');
 assert.equal(rows.length,1);assert.equal(rows[0].employee_id,'a');assert.equal(rows[0].quantity,3);assert.equal(rows[0].hours,1.5);assert.equal(rows[0].productivity,2);
});
test('repack, despejo, montagem e conferência ficam em atividades próprias',()=>{
 const e={id:'r',display_name:'RICHARD GABRIEL DIAS'};
 const d={team:[e],activities:[{employee_id:'r',reference_date:'2026-10-01',area:'repack',quantity:38,duration_minutes:60,source:'repack',source_id:'r1'},{employee_id:'r',reference_date:'2026-10-01',area:'despejo',quantity:8,duration_minutes:30,source:'repack',source_id:'r2'}]};
 const rows=individualRows(d,[{data:{helpers:[{...task,name:e.display_name}],checkers:[{...task,id:'c1',name:e.display_name,start:null,end:null}]}}],'2026-10-01','2026-10-01');
 assert.equal(rows.length,4);assert.equal(rows.find(x=>x.area==='repack').productivity,38);assert.equal(rows.find(x=>x.area==='conferencia_c').productivity,null);
});
test('período e duplicação de fontes não aumentam a produção',()=>{
 const manual={employee_id:'a',reference_date:'2026-10-01',area:'carregamento',quantity:3,duration_minutes:90,source:'manual'};
 const rows=individualRows({team:[employee],activities:[manual]},[{data:{helpers:[task,task,{...task,id:'h2',date:'2026-10-02'}]}}],'2026-10-01','2026-10-01');
 assert.equal(rows[0].quantity,3);assert.equal(rows[0].entries.length,1);
});
test('tempo faltante não é removido do denominador para inflar a produtividade',()=>{
 const rows=individualRows({team:[employee]},[{data:{helpers:[task,{...task,id:'h2',start:null,end:null}]}}],'2026-10-01','2026-10-01');
 assert.equal(rows[0].quantity,6);assert.equal(rows[0].productivity,null);
});
test('jornada padrão considera cada dia uma vez; empilhadores não recebem HE',()=>{
 assert.ok(Math.abs(standardHours(['2026-10-01','2026-10-01'])-(7+20/60+13/31))<1e-9);
 assert.equal(standardHours(['2026-10-01'],{job_title:'Operador De Empilhadeira'}),7+20/60);
});
test('jornada lançada exige todos os dias com produção',()=>{
 const frame={data:{helpers:[task,{...task,id:'h2',date:'2026-10-02'}]}};
 const d={team:[employee],attendance:[{employee_id:'a',area:'carregamento',reference_date:'2026-10-01',regular_hours:7,overtime_hours:1}]};
 const rows=individualRows(d,[frame],'2026-10-01','2026-10-02','attendance');assert.equal(rows[0].productivity,null);
 assert.equal(dailySeries(rows,'attendance')[0].productivity,3/8);assert.equal(dailySeries(rows,'attendance')[1].productivity,null);
});
test('série diária soma produção e horas, sem média simples de produtividades',()=>{
 const rows=individualRows({team:[employee]},[{data:{helpers:[task,{...task,id:'h2',pallets:6,start:'20:00:00',end:'23:00:00'}]}}],'2026-10-01','2026-10-01');
 assert.equal(dailySeries(rows)[0].quantity,9);assert.equal(dailySeries(rows)[0].productivity,2);
});
test('intervalos atravessam os meses e rejeitam períodos excessivos',()=>{
 assert.deepEqual(periodMonths('2026-09-30','2026-10-02'),['2026-09','2026-10']);assert.throws(()=>periodMonths('2026-01-01','2026-10-06'));
});
