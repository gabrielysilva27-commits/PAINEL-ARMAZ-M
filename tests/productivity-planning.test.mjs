import test from 'node:test';
import assert from 'node:assert/strict';
import {ANNUAL_PLAN,referenceWlp,plannedDimension} from '../productivity-planning.mjs';
test('planejamento conserva os 12 volumes e dias úteis enviados',()=>{
 assert.equal(ANNUAL_PLAN.length,12);assert.equal(ANNUAL_PLAN[9].volume,47219);assert.equal(ANNUAL_PLAN[9].days,26);assert.equal(ANNUAL_PLAN[11].volume,63244);assert.equal(ANNUAL_PLAN.reduce((s,x)=>s+x.volume,0),593496);
});
test('conta cada pessoa ativa uma vez e não adiciona HE aos empilhadores',()=>{
 const team=[{active:true,job_title:'Ajudante'},{active:true,job_title:'Operador de Empilhadeira'},{active:false,job_title:'Ajudante'}];
 const p=ANNUAL_PLAN[9],r=plannedDimension(p,team,100);
 assert.equal(r.headcount,2);assert.ok(Math.abs(r.hours-((7+20/60)*2+13/31)*26)<1e-9);assert.equal(r.productivity,p.volume/r.hours);assert.equal(r.required,Math.ceil(p.volume/100/(r.hours/2)));assert.equal(r.gap,r.required-2);
 assert.equal(plannedDimension(p,[],100).required,null);
});
test('mês incompleto e referência futura não preenchem automaticamente a meta',()=>{
 const complete={reference_month:'2026-08-01',payload:{warehouse_summary:{productivity:5.2,missing_attendance:[]}}};
 const incomplete={reference_month:'2026-09-01',payload:{warehouse_summary:{productivity:null,missing_attendance:['a']}}};
 assert.equal(referenceWlp([complete,incomplete],'2026-10-01'),complete);assert.equal(referenceWlp([complete],'2026-01-01'),null);
 assert.equal(plannedDimension(ANNUAL_PLAN[0],[{active:true}],null).required,null);
});
