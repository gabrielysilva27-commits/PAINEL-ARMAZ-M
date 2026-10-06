import {norm} from './efc-core.mjs?v=20261006-checker-boxes';
import {personName} from './efc-names.mjs?v=20261006-checker-boxes';
import {escape as e,format as n,seriesChart,horizontalBars,chartPanel,metric} from './efc-charts.mjs?v=20261006-checker-boxes';
const key=v=>norm(personName(v));
const sum=(xs,k)=>xs.reduce((a,x)=>a+(Number(x[k])||0),0);
const maps=xs=>[...new Map(xs.map(x=>[x.date+'|'+x.map,x])).values()];
const boxes=xs=>xs.length&&xs.every(x=>x.boxes!=null)?sum(xs,'boxes'):null;
export function checkerProductivity(c,member=''){
 const selected=(c.checkers||[]).filter(x=>!member||key(x.name)===key(member));
 const errors=(c.errors||[]).filter(x=>!member||key(x.checker)===key(member));
 const names=[...new Map([...selected.map(x=>x.name),...errors.map(x=>x.checker)].filter(Boolean).map(x=>[key(x),personName(x)])).values()];
 const ranking=names.map(name=>{const rows=selected.filter(x=>key(x.name)===key(name)),unique=maps(rows),quality=errors.filter(x=>key(x.checker)===key(name)),quantity=sum(quality,'quantity'),cases=boxes(unique);return {name,days:new Set(rows.map(x=>x.date)).size,maps:unique.length,pallets:sum(rows,'pallets'),boxes:cases,knownBoxes:sum(unique.filter(x=>x.boxes!=null),'boxes'),missing:unique.filter(x=>x.boxes==null).length,occurrences:quality.length,quantity,rate:cases>0?quantity/cases:null};}).sort((a,b)=>b.pallets-a.pallets||a.name.localeCompare(b.name,'pt-BR'));
 const dates=[...new Set([...selected,...errors].map(x=>x.date))].sort();
 const daily=dates.map(date=>{const rows=selected.filter(x=>x.date===date);return {date,label:date.slice(8),pallets:sum(rows,'pallets'),maps:maps(rows).length,errors:errors.filter(x=>x.date===date).length};});
 const unique=maps(selected);
 return {ranking,daily,rows:selected,errors,missing:unique.filter(x=>x.boxes==null),summary:{people:ranking.filter(x=>x.maps>0).length,maps:unique.length,pallets:sum(selected,'pallets'),boxes:boxes(unique),knownBoxes:unique.some(x=>x.boxes!=null)?sum(unique.filter(x=>x.boxes!=null),'boxes'):null,occurrences:errors.length,quantity:sum(errors,'quantity')}};
}
export function checkerVisual(c,state){
 const available=[...new Set([...(c.checkers||[]).map(x=>x.name),...(c.errors||[]).map(x=>x.checker)].filter(Boolean).map(personName))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const model=checkerProductivity(c,state.checker||''),s=model.summary;
 const controls=`<div class="efc-toolbar efc-checker-filter"><label>Conferente<select id="efcChecker"><option value="">Toda a equipe</option>${available.map(name=>`<option value="${e(name)}" ${key(state.checker)===key(name)?'selected':''}>${e(name)}</option>`).join('')}</select></label></div>`;
 const summary=`<div class="efc-vmetrics">${metric('Mapas conferidos',n(s.maps))}${metric('Pallets conferidos',n(s.pallets))}${metric('Caixas conciliadas',s.knownBoxes==null?'Pendente':n(s.knownBoxes))}${metric('Ocorrências',n(s.occurrences))}</div>`;
 const daily=(id,title,column,label,color)=>chartPanel(title,'',seriesChart({id,title,data:model.daily,series:[{key:column,label,color}],bars:true}));
 const bars=(title,data,color)=>chartPanel(title,'',horizontalBars({title,data,limit:Math.max(1,data.length),color}).replaceAll('data-efc-chart-member=','data-efc-chart-checker='));
 const graphs=`<div class="efc-visual-grid">${daily('checker-pallets','Pallets conferidos por dia','pallets','Pallets','#f47a20')}${daily('checker-maps','Mapas conferidos por dia','maps','Mapas','#617e96')}${bars('Volume por conferente',model.ranking.filter(x=>x.maps>0).map(x=>({label:x.name,name:x.name,value:x.pallets})),'#617e96')}${bars('Ocorrências por conferente',model.ranking.map(x=>({label:x.name,name:x.name,value:x.occurrences})),'#d6574d')}</div>`;
 const headers=['Conferente','Dias','Mapas','Pallets','Caixas','Ocorrências','Qtd. apontada','Taxa de erros'];
 const table=`<section class="efc-panel efc-pay-panel"><h2>Produtividade e qualidade por conferente</h2><div class="efc-pay-table"><table><thead><tr>${headers.map(h=>`<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${model.ranking.map(x=>`<tr>${[x.name,n(x.days),n(x.maps),n(x.pallets),x.boxes==null?(x.maps>x.missing?n(x.knownBoxes)+' · '+x.missing+' mapa(s) pendente(s)':'Pendente'):n(x.boxes),n(x.occurrences),n(x.quantity),x.rate==null?'—':n(x.rate*100,2)+'%'].map((v,i)=>`<td data-label="${e(headers[i])}">${e(v)}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="8">Sem registros neste período.</td></tr>'}</tbody></table></div></section>`;
 const missing=model.missing.length?`<details class="efc-panel"><summary>${model.missing.length} mapa(s) sem caixas no 03023601</summary><div class="efc-pay-table"><table><thead><tr><th>Dia</th><th>Mapa</th><th>Conferente</th></tr></thead><tbody>${model.missing.map(x=>`<tr><td data-label="Dia">${e(x.date)}</td><td data-label="Mapa">${e(x.map)}</td><td data-label="Conferente">${e(x.name)}</td></tr>`).join('')}</tbody></table></div></details>`:'';
 return `<div class="efc-checker-dashboard">${controls}${summary}${graphs}${table}${missing}</div>`;
}
