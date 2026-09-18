(() => {
 const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/quality-api';
 const Q={month:'all',auditor:'',data:null,req:0,openDetail:null};
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pct=v=>v==null?'—':(v*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
 const int=v=>Number(v||0).toLocaleString('pt-BR');
 const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
 const MONTHS=[['all','Acumulado'],['01','Janeiro'],['02','Fevereiro'],['03','Março'],['04','Abril'],['05','Maio'],['06','Junho'],['07','Julho'],['08','Agosto'],['09','Setembro'],['10','Outubro'],['11','Novembro'],['12','Dezembro']];
 async function call(payload={}){
   const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action:'dashboard',...payload})});
   const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Falha ao carregar Ronda de Qualidade');return d;
 }
 function lineChart(items){
   if(!items?.length)return '<div class="quality-empty">Sem dados para este período.</div>';
   const W=760,H=185,p=24,vals=items.map(x=>Number(x.compliance||0)*100),min=Math.max(85,Math.floor(Math.min(...vals)-2)),max=100,span=Math.max(1,max-min);
   const pts=items.map((x,i)=>{const X=p+(items.length===1?(W-2*p)/2:i*(W-2*p)/(items.length-1));const Y=p+(max-Number(x.compliance||0)*100)*(H-2*p)/span;return {x:X,y:Y,label:x.label,value:Number(x.compliance||0)*100};});
   const poly=pts.map(o=>o.x.toFixed(1)+','+o.y.toFixed(1)).join(' ');
   const guides=[90,95,100].filter(v=>v>=min).map(v=>{const y=p+(max-v)*(H-2*p)/span;return '<g><line x1="'+p+'" y1="'+y+'" x2="'+(W-p)+'" y2="'+y+'" class="q-grid"/><text x="2" y="'+(y+3)+'" class="q-axis">'+v+'%</text></g>';}).join('');
   const labels=pts.map((o,i)=>'<g><text x="'+o.x+'" y="'+(H-4)+'" text-anchor="middle" class="q-label">'+esc(o.label)+'</text><circle cx="'+o.x+'" cy="'+o.y+'" r="3.2" class="q-dot"><title>'+esc(o.label)+' · '+o.value.toFixed(1)+'%</title></circle></g>').join('');
   return '<svg class="quality-line" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Conformidade por período">'+guides+'<polyline points="'+poly+'" class="q-line"/>'+labels+'</svg>';
 }
 function bars(items,kind){
   if(!items?.length)return '<div class="quality-empty">Sem ocorrências.</div>';
   const max=Math.max(...items.map(x=>Number(x.count||x.rounds||0)),1);
   return '<div class="quality-bars">'+items.slice(0,10).map((x,i)=>{const label=kind==='sku'?x.code:x.label;const value=kind==='sku'?x.count:x.count;return '<div class="quality-bar-row"><span class="quality-rank">'+(i+1)+'</span><div class="quality-bar-copy" title="'+esc(label)+'"><strong>'+esc(label)+'</strong><div><i style="width:'+Math.max(4,(value/max)*100)+'%"></i></div></div><b>'+int(value)+'</b></div>';}).join('')+'</div>';
 }
 function people(items){
   if(!items?.length)return '<div class="quality-empty">Sem dados.</div>';
   const max=Math.max(...items.map(x=>x.rounds),1);
   return '<div class="quality-people">'+items.map(x=>'<div class="quality-person"><div><strong>'+esc(x.name)+'</strong><small>'+int(x.rounds)+' rondas</small></div><div class="quality-person-track"><i style="width:'+(x.rounds/max*100)+'%"></i></div><b>'+pct(x.compliance)+'</b></div>').join('')+'</div>';
 }
 function historyRows(items){
   if(!items?.length)return '<tr><td colspan="6"><div class="quality-empty">Sem rondas para este filtro.</div></td></tr>';
   return items.map(r=>{const open=Q.openDetail===r.id;const sku=(r.sku_codes||[]).join(', ')||'—';return '<tr class="quality-history-main" data-round="'+r.id+'"><td>'+date(r.date)+'</td><td><strong>'+esc(r.auditor)+'</strong></td><td><span class="quality-score '+(r.compliance<.95?'warn':'')+'">'+pct(r.compliance)+'</span></td><td>'+int(r.anomaly_count)+'</td><td class="quality-skus">'+esc(sku)+'</td><td><button class="quality-detail-btn" data-round="'+r.id+'">'+(open?'Fechar':'Detalhes')+'</button></td></tr>'+(open?'<tr class="quality-detail-row"><td colspan="6">'+detail(r)+'</td></tr>':'');}).join('');
 }
 function detail(r){
   if(!r.anomaly_count)return '<div class="quality-round-detail ok"><strong>Ronda sem anomalias</strong><span>Nenhum item foi marcado como “Sim”.</span></div>';
   return '<div class="quality-round-detail"><div><strong>'+int(r.anomaly_count)+' anomalia(s) identificada(s)</strong><span>SKU informado: '+esc(r.sku_text||'—')+'</span></div><ol>'+r.anomalies.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ol></div>';
 }
 function render(){
   const root=$('qualityRoundsView'),d=Q.data;if(!root||!d)return;
   const s=d.summary;
   root.innerHTML='<div class="quality-module">'+
    '<div class="quality-toolbar"><div class="quality-source"><span class="quality-live-dot"></span><div><strong>RONDA DE QUALIDADE</strong><small>2026 · origem Google Forms</small></div></div><div class="quality-filters"><label>Período<select id="qualityMonth">'+MONTHS.map(([v,l])=>'<option value="'+v+'" '+(Q.month===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Responsável<select id="qualityAuditor"><option value="">Todos</option>'+d.filters.auditors.map(a=>'<option value="'+esc(a)+'" '+(Q.auditor===a?'selected':'')+'>'+esc(a)+'</option>').join('')+'</select></label><button class="outline-button" id="qualityRefresh">Atualizar</button></div></div>'+
    '<section class="quality-kpis"><article><small>Conformidade</small><strong>'+pct(s.compliance)+'</strong><span>'+int(s.anomaly_flags)+' desvios em '+int(s.rounds)+' rondas</span></article><article><small>Rondas realizadas</small><strong>'+int(s.rounds)+'</strong><span>período selecionado</span></article><article><small>Com anomalia</small><strong>'+int(s.anomaly_rounds)+'</strong><span>'+pct(s.rounds?s.anomaly_rounds/s.rounds:0)+' das rondas</span></article><article><small>Total de anomalias</small><strong>'+int(s.anomaly_flags)+'</strong><span>itens marcados “Sim”</span></article><article><small>SKUs citados</small><strong>'+int(s.unique_skus)+'</strong><span>códigos distintos</span></article></section>'+
    '<section class="quality-grid-main"><article class="panel quality-chart-card"><div class="panel-heading"><div><h2>Evolução da conformidade</h2><small>'+(Q.month==='all'?'Visão mensal':'Visão semanal')+'</small></div></div>'+lineChart(d.trend)+'</article><article class="panel quality-top-card"><div class="panel-heading"><div><h2>Principais anomalias</h2><small>perguntas com maior recorrência</small></div></div>'+bars(d.top_questions,'q')+'</article></section>'+
    '<section class="quality-grid-secondary"><article class="panel"><div class="panel-heading"><div><h2>Rondas por responsável</h2><small>volume e conformidade individual</small></div></div>'+people(d.by_person)+'</article><article class="panel"><div class="panel-heading"><div><h2>SKUs mais recorrentes</h2><small>códigos citados nas rondas</small></div></div>'+bars(d.top_skus,'sku')+'</article></section>'+
    '<section class="panel quality-history"><div class="panel-heading"><div><h2>Histórico das rondas</h2><small>clique em Detalhes para ver apenas os desvios</small></div></div><div class="quality-table-wrap"><table><thead><tr><th>Data</th><th>Responsável</th><th>Conformidade</th><th>Desvios</th><th>SKU(s)</th><th></th></tr></thead><tbody>'+historyRows(d.history)+'</tbody></table></div></section>'+
    (s.timestamp_mismatch?'<p class="quality-audit-note">Auditoria de dados: '+int(s.timestamp_mismatch)+' registro(s) possuem ano do envio diferente da DATA da ronda. O painel usa a DATA da ronda como referência.</p>':'')+
   '</div>';
   $('qualityMonth').onchange=e=>{Q.month=e.target.value;load();};$('qualityAuditor').onchange=e=>{Q.auditor=e.target.value;load();};$('qualityRefresh').onclick=()=>load(true);
   root.querySelectorAll('[data-round]').forEach(el=>el.addEventListener('click',e=>{if(e.target.closest('button')||el.tagName==='BUTTON'){const id=Number(el.dataset.round);Q.openDetail=Q.openDetail===id?null:id;render();}}));
 }
 async function load(force=false){
   const root=$('qualityRoundsView'),req=++Q.req;if(root)root.innerHTML='<div class="quality-loading"><span></span>Carregando indicadores de 2026…</div>';
   try{const d=await call({month:Q.month,auditor:Q.auditor});if(req!==Q.req)return;Q.data=d;Q.openDetail=null;render();}catch(e){if(req===Q.req&&root)root.innerHTML='<div class="quality-error"><strong>Não foi possível carregar a Ronda de Qualidade</strong><span>'+esc(e.message||e)+'</span><button class="outline-button" id="qualityRetry">Tentar novamente</button></div>';setTimeout(()=>{$('qualityRetry')?.addEventListener('click',()=>load(true));},0);}
 }
 async function open(){await load();}
 window.__qualityRounds={open,refresh:()=>load(true)};
 if(!$('qualityRoundsView')?.classList.contains('hidden'))open();
})();