import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateLiveIndicator,aggregateIndicators,indicatorFlags,selectIndicatorConfig,indicatorWeek,weeklyIndicators,routeConfig} from '../supabase/functions/stock-api/oor-indicators.mjs';
test('indisponibilidade exige OUT e ausência de malha, inovação usa cadastro INNO',()=>{
 const c={reference_month:'2026-09-01',capacity_qty:100,innovation_skus:['1'],route_skus:['2']};
 const r=calculateLiveIndicator('2026-10-01',[{sku_code:'1',status:'OUT',available_qty:20},{sku_code:'2',status:'OUT',available_qty:30},{sku_code:'3',status:'OK',available_qty:0}],c);
 assert.equal(r.unavailable_count,1);assert.equal(r.innovation_count,1);assert.equal(r.occupation_pct,.5);assert.equal(r.config_month,'2026-09');
});
test('acumulado pondera contagens e capacidade dos dias com base, sem dias vazios',()=>{
 const r=aggregateIndicators([{product_count:10,innovation_count:2,unavailable_count:1,stock_qty:50,capacity_qty:100,config_month:'2026-09'},{product_count:30,innovation_count:3,unavailable_count:0,stock_qty:100,capacity_qty:100,config_month:'2026-09'}]);
 assert.equal(r.innovation_pct,5/40);assert.equal(r.unavailable_pct,1/40);assert.equal(r.occupation_pct,.75);assert.equal(r.days,2);assert.equal(aggregateIndicators([]),null);
});
test('histórico usa o universo real da planilha sem incluir SKUs sintéticos',()=>{
 const h={eligible_skus:['1'],innovation_skus:['1'],unavailable_skus:[]};assert.equal(indicatorFlags({sku_code:'2'},h,{}).indicator_eligible,false);
});
test('seleção não aplica cadastro futuro ao histórico',()=>assert.equal(selectIndicatorConfig('2026-02-01',[{reference_month:'2026-03-01'},{reference_month:'2026-01-01'}]).reference_month,'2026-01-01'));
test('indisponibilidade histórica acompanha OUT atual, sem tratar OK como indisponível',()=>{
 const h={eligible_skus:['1'],innovation_skus:[],unavailable_skus:['1']};
 assert.equal(indicatorFlags({sku_code:'1',status:'OK'},h,{route_skus:[]}).is_unavailable,false);
 assert.equal(indicatorFlags({sku_code:'1',status:'OUT'},h,{route_skus:['1']}).is_unavailable,false);
 assert.equal(indicatorFlags({sku_code:'1',status:'OUT'},h,{route_skus:[]}).is_unavailable,true);
});
test('semana domingo a sábado preserva a virada do mês e do ano',()=>{
 assert.deepEqual(indicatorWeek('2026-10-01'),{week_start:'2026-09-27',week_end:'2026-10-03'});
 assert.deepEqual(indicatorWeek('2026-01-01'),{week_start:'2025-12-28',week_end:'2026-01-03'});
 const base={innovation_count:0,stock_qty:50,capacity_qty:100};
 const weeks=weeklyIndicators([{...base,reference_date:'2026-09-30',product_count:10,unavailable_count:2},{...base,reference_date:'2026-10-01',product_count:30,unavailable_count:1},{...base,reference_date:'2026-10-04',product_count:10,unavailable_count:1}]);
 assert.equal(weeks.length,2);assert.equal(weeks[0].days,2);assert.equal(weeks[0].unavailable_pct,3/40);assert.equal(weeks[0].rows.length,2);
});
test('malha semanal preserva o histórico e não assume zero quando a malha futura falta',()=>{
 const config={reference_month:'2026-09-01',capacity_qty:100,route_skus:['1'],innovation_skus:[]};
 const weeks=[{week_start:'2026-10-04',week_end:'2026-10-10',route_skus:['2']}];
 assert.deepEqual(routeConfig('2026-10-05',config,weeks),config);
 assert.deepEqual(routeConfig('2026-10-06',config,weeks).route_skus,['2']);
 const row={sku_code:'1',status:'OUT',available_qty:10};
 const missing=calculateLiveIndicator('2026-10-12',[row],routeConfig('2026-10-12',config,weeks));
 assert.equal(missing.unavailable_count,null);assert.equal(missing.unavailable_pct,null);assert.equal(missing.occupation_pct,.1);
 assert.equal(aggregateIndicators([missing]).unavailable_pct,null);
 assert.equal(calculateLiveIndicator('2026-10-06',[row],routeConfig('2026-10-06',config,weeks)).unavailable_count,1);
});
