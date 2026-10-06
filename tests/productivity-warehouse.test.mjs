import test from 'node:test';
import assert from 'node:assert/strict';
import {fullWarehouseHelpers,warehouseActivities,blitzVolume} from '../productivity-warehouse.mjs';
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
