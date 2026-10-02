const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {parse031120}=require('../lib/pull031120'),{run}=require('../lib/backfill031120');
test('complete report keeps every movement; daily pulls deduplicate trailer maps',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shared031120-')),file=path.join(dir,'report.csv');
 try{
  fs.writeFileSync(file,'Data;Veiculo;Mapa;Tipo;Produto;Qtde\n01/10/2026;246;001;ENTRADA CDD;100;5\n01/10/2026;246;001;ENTRADA CDD;101;6\n01/10/2026;246;002;ENTRADA CDD;100;5\n02/10/2026;231;003;ENTRADA CDD;100;5\n02/10/2026;291;004;ENTRADA CDD;100;5\n02/10/2026;298;005;SAIDA CDD;ENTRADA CDD EMBALAGEM;5\n');
  const p=parse031120(file);assert.equal(p.records.length,6);assert.equal(p.records[5].is_entrada_cdd,false);assert.equal(p.records[4].vehicle,'291');assert.equal(p.records[0].raw_values[4],'100');
  assert.deepEqual(p.rows.map(r=>[r.pull_date,r.truck_count]),[['2026-10-01',2],['2026-10-02',1]]);
  fs.writeFileSync(file,'Data;Veiculo;Mapa;Tipo\n02/10/2026;291;001;SAIDA CDD');
  const noPulls=parse031120(file);assert.equal(noPulls.records.length,1);assert.equal(noPulls.rows.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('batch failure never publishes an incomplete report',async()=>{
 let completed=0;const records=Array.from({length:251},(_,i)=>({row_no:i+1,reference_date:'2026-10-02'}));
 const api={pull031120State:async()=>{},report031120Import:async p=>{if(p.phase==='start')return{result:{import_id:'test'}};if(p.phase==='batch')throw Error('network failure');if(p.phase==='complete')completed++}};
 await assert.rejects(run({api,promax:{export031120:async()=>'/tmp/report.csv'},config:{},root:'/tmp',parse:()=>({headers:['Data'],records,rows:[],raw_rows:251}),log:()=>{},task:{date_from:'2026-10-02',date_to:'2026-10-02'}}),/network failure/);assert.equal(completed,0);
});
test('a report without trailer entries is still published and retained',async()=>{
 const phases=[];const api={pull031120State:async()=>{},report031120Import:async p=>{phases.push(p.phase);return{result:{import_id:'test'}}}};
 const result=await run({api,promax:{export031120:async()=>'/tmp/report.csv'},config:{},root:'/tmp',parse:()=>({headers:['Data'],records:[{row_no:1,reference_date:'2026-10-02'}],rows:[],raw_rows:1}),log:()=>{},task:{date_from:'2026-10-02',date_to:'2026-10-02'}});
 assert.deepEqual(phases,['start','batch','complete']);assert.deepEqual(result.months,['2026-10']);
});

test('real Promax Fase Entrada Cdd/Fab is recognized by operation date',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phase031120-')),file=path.join(dir,'report.csv');
 try{fs.writeFileSync(file,'Mapa;Fase;Veiculo;Emissao;DtOper;Produto\n001;Entrada Cdd/Fab      ;246;01/10/2026;02/10/2026;X\n001;Carregado;246;01/10/2026;02/10/2026;ENTRADA CDD');
 const p=parse031120(file);assert.equal(p.rows[0].pull_date,'2026-10-02');assert.equal(p.rows[0].truck_count,1);assert.equal(p.records[1].is_entrada_cdd,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
