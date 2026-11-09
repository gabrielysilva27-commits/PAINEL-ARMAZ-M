const test=require('node:test'),assert=require('node:assert/strict');
const {period,buildCurve}=require('../lib/abc-core'),r=require('../lib/abc-reports'),efd=require('../lib/efd-sync');
test('older MAPAS needs only the named map column, regardless of vehicle/plate layout',()=>{
  assert.deepEqual(r.mapNumbersFromSheets([{rows:['A1:Roteirização','B3:Nº Mapa | C3:Motorista','B4:001235 | C4:Operador','B5:1236 | C5:Outro','B6:Total']}]),[1235,1236]);
  assert.throws(()=>r.mapNumbersFromSheets([{rows:['A1:Veículo','A2:1235']}]),/MAP_COLUMN_MISSING/);
});
test('observed headerless MAPAS validates map, plate and vehicle together',()=>{
  assert.deepEqual(r.mapNumbersFromSheets([{rows:['A1:523681 | B1:RJM5A12 | C1:291','A2:523682 | B2:LSC8380 | C2:223']}]),[523681,523682]);
  assert.throws(()=>r.mapNumbersFromSheets([{rows:['A1:523681 | B1:not a plate | C1:291']}]),/MAP_COLUMN_MISSING/);
});
test('November closes August–October and January crosses the year boundary',()=>{
  assert.deepEqual(period('2026-11'),{month:'2026-11',date_from:'2026-08-01',date_to:'2026-10-31'});
  assert.deepEqual(period('2027-01'),{month:'2027-01',date_from:'2026-10-01',date_to:'2026-12-31'});
  assert.equal(period('2028-03').date_to,'2028-02-29');assert.throws(()=>period('2026-13'));
});
test('sales aggregates repeated products; totals and grouping labels are not products',()=>{
  const rows=r.records('Relatório;\nProduto;Nome Produto;Total;Total\n001;Cerveja;99;1.234,50\n001;Cerveja;99;2,5\nTotal geral;;;1237\n');
  assert.deepEqual(r.salesRows(rows),[{sku_code:'1',name:'Cerveja',boxes:1237}]);
  assert.equal(r.number('12.50'),12.5);assert.equal(r.number('1.200,50'),1200.5);assert.throws(()=>r.number('12x'));
});
test('map bounds come from exact boundary files; a missing boundary blocks publication',()=>{
  const oldI=efd.inventory,oldM=efd.mapsRows;
  try{
    const files=['MAPAS 01.08.2026.xlsx','MAPAS 15.09.2026.xlsx','MAPAS 31.10.2026.xlsx'].map((name,i)=>({name,relative_path:name,modified_at:'2026-11-01',size:1}));
    efd.inventory=()=>({files,errors:[]});efd.mapsRows=(_,f)=>({rows:[{map:f.name.includes('01.08')?'101':'999'}],excluded:[{map:f.name.includes('01.08')?'100':'1000'}]});
    assert.deepEqual([r.mapBounds('/maps',period('2026-11')).map_from,r.mapBounds('/maps',period('2026-11')).map_to],['100','1000']);
    files.shift();assert.throws(()=>r.mapBounds('/maps',period('2026-11')),/BOUNDARY_DATE_MISSING/);
  }finally{efd.inventory=oldI;efd.mapsRows=oldM;}
});
test('picking counts operating dates, ignores closed pallets and refuses wrong map ranges',()=>{
  const row=(date,map,closed,boxes)=>({date,map,closed,boxes,product:'1',raw_values:Array(21).fill('')});
  const parsed={rows:[row('2026-08-01','100',false,10),row('2026-08-02','101',true,20),row('2026-11-01','102',false,50)]};
  const job={...period('2026-11'),map_from:'100',map_to:'102'};
  assert.deepEqual(r.pickingRows(parsed,job),{rows:[{sku_code:'1',boxes:10,name:''}],dates:['2026-08-01','2026-08-02'],excluded_rows:1});
  assert.throws(()=>r.pickingRows(parsed,{...job,map_to:'101'}),/MAP_OUTSIDE_RANGE/);
});
test('curve uses commercial factors once, separates areas and excludes giro assets',()=>{
  const sales=[{sku_code:'1',boxes:100},{sku_code:'2',boxes:10},{sku_code:'838',boxes:5},{sku_code:'24090',boxes:10000},{sku_code:'999',boxes:1}];
  const catalog=['1','2','838','24090'].map(sku_code=>({sku_code,sku_name:sku_code,factor_hecto_commercial:2,boxes_per_pallet:10}));
  const c=buildCurve(sales,[{sku_code:'1',boxes:10}],catalog,[{sku_code:'2'}],2);
  const reg=c.items.find(x=>x.area==='Regulador');assert.equal(reg.volume_hl,200);assert.equal(reg.volume_pallets,10);assert.equal(reg.avg_caixas,50);
  assert.equal(c.items.length,4);assert.deepEqual(c.asset_codes,['24090']);assert.deepEqual(c.skipped_codes,['999']);assert.throws(()=>buildCurve(sales,[],catalog,[{sku_code:'2'}],2),/EMPTY_AREA/);
});
test('server and agent use the same calculation implementation',async()=>{
  const server=await import('../../supabase/functions/abc-agent-api/abc-core.mjs');assert.deepEqual(server.period('2026-11'),period('2026-11'));
  const fs=require('fs'),path=require('path'),a=fs.readFileSync(path.join(__dirname,'../lib/abc-core.js'),'utf8').replace("'use strict';",'').replace('module.exports={period,buildCurve,calculateArea,norm};','export {period,buildCurve,calculateArea,norm};');
  assert.equal(fs.readFileSync(path.join(__dirname,'../../supabase/functions/abc-agent-api/abc-core.mjs'),'utf8'),a);
});
