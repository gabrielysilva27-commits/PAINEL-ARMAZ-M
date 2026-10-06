import test from 'node:test';
import assert from 'node:assert/strict';
import {fullWarehouseHelpers,warehouseActivities,blitzVolume,efdActivities} from '../productivity-warehouse.mjs';
import {individualRows} from '../productivity-individual.mjs';
const team=[{id:'m',display_name:'MAYCON',active:true,area:'cheio_b',shift:'A',job_title:'Ajudante De Armazém'},{id:'a',display_name:'ANDREI',active:true,area:'repack',shift:'A',job_title:'Ajudante De Armazém'},{id:'r',display_name:'RICHARD',active:true,area:'repack',shift:'A',job_title:'Ajudante De Armazém'},{id:'c',display_name:'AJUDANTE C',active:true,area:'carregamento',shift:'C',job_title:'Ajudante'},{id:'v',display_name:'VAZIO',active:true,area:'retorno',shift:'A',job_title:'Ajudante'},{id:'f',display_name:'LUIS CARLOS MARQUES DA SILVA',active:true,area:'conferencia',shift:'B',job_title:'Conferente'}];
const blitz={checks:[{check_key:'x',reference_date:'2026-10-02',checker:'Marques',packages_checked:4140}],cache:{by_day:[{date:'2026-10-01',packages_checked:900}]}};
const efc={month:'2026-10',data:{picking_days:[{date:'2026-10-02',boxes:1000,estimated:12.3,complete:false}],checkers:[{date:'2026-10-02',map:'01',name:'LUIS CARLOS MARQUES DA SILVA'},{date:'2026-10-02',map:'01',name:'LUIS CARLOS MARQUES DA SILVA'}]}};
test('grupo inclui Maycon, Andrei e Richard, exclui turno C e vazio',()=>assert.deepEqual(fullWarehouseHelpers(team).map(x=>x.id),['m','a','r']));
test('rateio conserva o total de caixas e vasilhames sem duplicar perdas',()=>{
 const activities=warehouseActivities(team,[efc],[blitz]);const total=a=>activities.filter(x=>x.area===a).reduce((s,x)=>s+x.quantity,0);
 assert.equal(total('reabastecimento'),1000);assert.equal(total('blitz_puxada'),5040);assert.ok(Math.abs(total('ressuprimento')-12.3)<1e-9);
 assert.ok(activities.filter(x=>x.area==='reabastecimento').every(x=>x.allocation_count===3&&x.source_partial));
 assert.equal(activities.filter(x=>x.area==='mapas_conferidos_c').length,1);
 assert.equal(activities.find(x=>x.area==='blitz_conferencia').employee_id,'f');
});
test('rateio aparece por pessoa, com unidade correta e sem inventar tempos',()=>{
 const activities=warehouseActivities(team,[efc],[blitz]);
 const rows=individualRows({team,warehouse_activities:activities},[],'2026-10-02','2026-10-02');
 const maycon=rows.find(x=>x.employee_id==='m'&&x.area==='reabastecimento');assert.equal(maycon.unit,'caixas');assert.equal(maycon.productivity,null);assert.equal(maycon.allocation_count,3);
 const standard=individualRows({team,warehouse_activities:activities},[],'2026-10-02','2026-10-02','standard').find(x=>x.employee_id==='m'&&x.area==='reabastecimento');assert.ok(standard.productivity>0);
});
test('o histórico da Blitz é somado aos lançamentos novos e nunca às linhas de perda',()=>assert.equal(blitzVolume([blitz]).reduce((s,x)=>s+x.quantity,0),5040));
test('sem ajudantes elegíveis, não há atribuição fictícia a terceiros',()=>assert.equal(warehouseActivities(team.filter(x=>x.id==='c'),[efc],[blitz]).filter(x=>x.allocation).length,0));
test('EFD atribui a Vanderson apenas retornos válidos concluídos, sem inventar duração',()=>{
 const t=[{id:'v',display_name:'VANDERSON MARQUES',active:true}],map={map_id:'01',vehicle:'798',reference_date:'2026-10-02',arrival_at:'2026-10-02T14:27:00',physical_at:'2026-10-02T14:39:00',valid:true};
 const rows=efdActivities(t,[{maps:[map,{...map,map_id:'02'}, {...map,map_id:'03',arrival_at:'2026-10-02T17:53:00',physical_at:'2026-10-02T18:14:00'},{...map,map_id:'04',physical_at:null},{...map,map_id:'05',valid:false}]}]);
 assert.equal(rows.length,2);assert.ok(rows.every(x=>x.employee_id==='v'&&x.duration_minutes===null));
 const summary=individualRows({team:t,warehouse_activities:rows},[],'2026-10-02','2026-10-02');assert.equal(summary[0].quantity,2);assert.equal(summary[0].productivity,null);
});
test('não atribui EFD a outro conferente se Vanderson estiver ausente do cadastro',()=>assert.deepEqual(efdActivities(team,[{maps:[{valid:true,physical_at:'2026-10-02T20:00:00'}]}]),[]));
test('reabastecimento dos empilhadores usa só cheio A e conserva volume em atividade própria',()=>{
 const forklift=(id,area,shift='A',active=true)=>({id,display_name:id,job_title:'Operador de Empilhadeira',area,shift,active});
 const t=[...team,forklift('e1','descarga_cheio'),forklift('e2','descarga_cheio'),forklift('b','descarga_cheio','B'),forklift('v','descarga_vazio'),forklift('off','descarga_cheio','A',false)];
 const rows=warehouseActivities(t,[efc],[blitz]);const r=rows.filter(x=>x.area==='reabastecimento_empilhadeira');
 assert.deepEqual(r.map(x=>x.employee_id),['e1','e2']);assert.equal(r.reduce((s,x)=>s+x.quantity,0),1000);assert.ok(r.every(x=>x.quantity===500&&x.allocation_count===2&&x.duration_minutes===null));
 assert.equal(rows.filter(x=>x.area==='reabastecimento').reduce((s,x)=>s+x.quantity,0),1000);
});
test('descarga EFD divide retornos entre empilhadores do vazio mesmo sem Vanderson',()=>{
 const t=['a','b','c'].map(id=>({id,display_name:id,active:true,job_title:'Operador de Empilhadeira',area:'descarga_vazio',shift:'B'}));
 t.push({id:'cheio',display_name:'cheio',active:true,job_title:'Operador de Empilhadeira',area:'descarga_cheio'});
 const m={vehicle:'1',reference_date:'2026-10-02',valid:true,physical_at:'2026-10-02T14:00:00'};
 const rows=efdActivities(t,[{maps:[m,m,{...m,vehicle:'2'},{...m,physical_at:null}]}]);
 assert.equal(rows.length,3);assert.ok(rows.every(x=>x.area==='descarga_retorno_efd'&&x.allocation_count===3&&x.duration_minutes===null));assert.equal(rows.reduce((s,x)=>s+x.quantity,0),2);
 const withChecker=efdActivities([...t,{id:'vd',display_name:'VANDERSON MARQUES',active:true}],[{maps:[m]}]);assert.equal(withChecker.filter(x=>x.area==='conferencia_retorno_efd').length,1);assert.equal(withChecker.filter(x=>x.area==='descarga_retorno_efd').reduce((s,x)=>s+x.quantity,0),1);
});
