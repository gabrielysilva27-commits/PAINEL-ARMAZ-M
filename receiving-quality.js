(() => {
 const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/receiving-quality-api';
 const R={month:'all',checker:'',origin:'',data:null,req:0,openDetail:null};
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pct=v=>v==null?'—':(v*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
 const int=v=>Number(v||0).toLocaleString('pt-BR');
 const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
 const MONTHS=[['all','Acumulado'],['01','Janeiro'],['02','Fevereiro'],['03','Março'],['04','Abril'],['05','Maio'],['06','Junho'],['07','Julho'],['08','Agosto'],['09','Setembro'],['10','Outubro'],['11','Novembro'],['12','Dezembro']];
 async function call(payload={}){
   const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action:'dashboard',...payload})});
   const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Falha ao carregar Qualidade do Recebimento');return d;
 }
 function lineChart(items){
   if(!items?.length)return '<div class="rq-empty">Sem dados para este período.</div>';
   const W=760,H=185,p=24,vals=items.map(x=>Number(x.compliance||0)*100),min=Math.max(80,Math.floor(Math.min(...vals)-2)),max=100,span=Math.max(1,max-min);
   const pts=items.map((x,i)=>{const X=p+(items.length===1?(W-2*p)/2:i*(W-2*p)/(items.length-1));const Y=p+(max-Number(x.compliance||0)*100)*(H-2*p)/span;return{x:X,y:Y,label:x.label,value:Number(x.compliance||0)*100};});
   const poly=pts.map(o=>o.x.toFixed(1)+','+o.y.toFixed(1)).join(' ');
   const guides=[85,90,95,100].filter(v=>v>=min).map(v=>{const y=p+(max-v)*(H-2*p)/span;return '<g><line x1="'+p+'" y1="'+y+'" x2="'+(W-p)+'" y2="'+y+'" class="rq-grid"/><text x="2" y="'+(y+3)+'" class="rq-axis">'+v+'%</text></g>';}).join('');
   const labels=pts.map(o=>'<g><text x="'+o.x+'" y="'+(H-4)+'" text-anchor="middle" class="rq-label">'+esc(o.label)+'</text><circle cx="'+o.x+'" cy="'+o.y+'" r="3.2" class="rq-dot"><title>'+esc(o.label)+' · '+o.value.toFixed(1)+'%</title></circle></g>').join('');
   return '<svg class="rq-line" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Conformidade do recebimento">'+guides+'<polyline points="'+poly+'" class="rq-line-path"/>'+labels+'</svg>';
 }
 function bars(items,mode){
   if(!items?.length)return '<div class="rq-empty">Sem ocorrências.</div>';
   const max=Math.max(...items.map(x=>Number(x.count||0)),1);
   return '<div class="rq-bars">'+items.slice(0,10).map((x,i)=>{const label=mode==='sku'?(x.name?x.code+' · '+x.name:x.code):x.label;return '<div class="rq-bar-row"><span>'+(i+1)+'</span><div title="'+esc(label)+'"><strong>'+esc(label)+'</strong><i><b style="width:'+Math.max(4,(x.count/max)*100)+'%"></b></i></div><em>'+int(x.count)+'</em></div>';}).join('')+'</div>';
 }
 function people(items){
   if(!items?.length)return '<div class="rq-empty">Sem dados.</div>';
   const max=Math.max(...items.map(x=>x.receipts),1);
   return '<div class="rq-people">'+items.map(x=>'<div class="rq-person"><div><strong>'+esc(x.name)+'</strong><small>'+int(x.receipts)+' checks · '+int(x.nc_receipts)+' com NC</small></div><i><b style="width:'+(x.receipts/max*100)+'%"></b></i><em>'+pct(x.compliance)+'</em></div>').join('')+'</div>';
 }
 function origins(items){
   if(!items?.length)return '<div class="rq-empty">Sem dados.</div>';
   return '<div class="rq-origins">'+items.map(x=>'<article><strong>'+esc(x.name)+'</strong><b>'+int(x.receipts)+'</b><span>recebimentos</span><small>'+pct(x.compliance)+' conformidade · '+pct(x.nc_rate)+' com NC</small></article>').join('')+'</div>';
 }
 function detail(r){
   if(!r.has_nonconformity)return '<div class="rq-detail ok"><strong>Recebimento sem não conformidade</strong><span>Nenhum desvio registrado neste check.</span></div>';
   return '<div class="rq-detail"><div><strong>'+int(r.categories.length)+' categoria(s) de NC</strong><span>SKU: '+esc((r.sku_codes||[]).join(', ')||r.sku_text||'—')+'</span><span>Carreteiro: '+esc(r.driver||'—')+'</span></div><ol>'+r.categories.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ol></div>';
 }
 function history(items){
   if(!items?.length)return '<tr><td colspan="8"><div class="rq-empty">Sem checks para este filtro.</div></td></tr>';
   return items.map(r=>{const open=R.openDetail===r.id;return '<tr><td>'+date(r.date)+'</td><td><strong>'+esc(r.checker)+'</strong></td><td>'+esc(r.driver||'—')+'</td><td>'+esc(r.origin||'—')+'</td><td><span class="rq-score '+(r.compliance<.95?'warn':'')+'">'+pct(r.compliance)+'</span></td><td>'+int(r.binary_nc)+'</td><td class="rq-skus">'+esc((r.sku_codes||[]).join(', ')||'—')+'</td><td><button class="rq-detail-btn" data-detail="'+r.id+'">'+(open?'Fechar':'Detalhes')+'</button></td></tr>'+(open?'<tr class="rq-detail-row"><td colspan="8">'+detail(r)+'</td></tr>':'');}).join('');
 }
 function render(){
   const root=$('receivingQualityView'),d=R.data;if(!root||!d)return;const s=d.summary;
   const sync=d.sync||{};
   root.innerHTML='<div class="rq-module">'+
   '<div class="rq-toolbar"><div class="rq-source"><span class="rq-live-dot"></span><div><strong>QUALIDADE DO RECEBIMENTO</strong><small>2026 · Google Forms'+(sync.last_status?' · '+esc(sync.last_status):'')+'</small></div></div><div class="rq-filters"><label>Período<select id="rqMonth">'+MONTHS.map(([v,l])=>'<option value="'+v+'" '+(R.month===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Conferente<select id="rqChecker"><option value="">Todos</option>'+d.filters.checkers.map(a=>'<option value="'+esc(a)+'" '+(R.checker===a?'selected':'')+'>'+esc(a)+'</option>').join('')+'</select></label><label>Origem<select id="rqOrigin"><option value="">Todas</option>'+d.filters.origins.map(a=>'<option value="'+esc(a)+'" '+(R.origin===a?'selected':'')+'>'+esc(a)+'</option>').join('')+'</select></label><button class="outline-button" id="rqRefresh">Atualizar</button></div></div>'+
   '<section class="rq-kpis"><article><small>Conformidade dos critérios</small><strong>'+pct(s.compliance)+'</strong><span>'+int(s.binary_nonconformities)+' desvios de checklist</span></article><article><small>Recebimentos avaliados</small><strong>'+int(s.receipts)+'</strong><span>período selecionado</span></article><article><small>Com não conformidade</small><strong>'+int(s.nc_receipts)+'</strong><span>'+pct(s.receipts?s.nc_receipts/s.receipts:0)+' dos checks</span></article><article><small>Desvios de checklist</small><strong>'+int(s.binary_nonconformities)+'</strong><span>critérios fora do padrão</span></article><article><small>SKUs com NC</small><strong>'+int(s.unique_nc_skus)+'</strong><span>códigos distintos</span></article></section>'+
   '<section class="rq-grid-main"><article class="panel"><div class="panel-heading"><div><h2>Evolução da conformidade</h2><small>'+(R.month==='all'?'visão mensal':'visão semanal')+'</small></div></div>'+lineChart(d.trend)+'</article><article class="panel"><div class="panel-heading"><div><h2>Principais não conformidades</h2><small>categorias mais recorrentes</small></div></div>'+bars(d.top_categories,'category')+'</article></section>'+
   '<section class="rq-grid-secondary"><article class="panel"><div class="panel-heading"><div><h2>Checks por conferente</h2><small>volume, NC e conformidade individual</small></div></div>'+people(d.by_checker)+'</article><article class="panel"><div class="panel-heading"><div><h2>Origem das cargas</h2><small>distribuição e qualidade por fábrica</small></div></div>'+origins(d.by_origin)+'</article></section>'+
   '<section class="rq-grid-secondary"><article class="panel"><div class="panel-heading"><div><h2>10 piores SKUs</h2><small>maior recorrência em recebimentos com NC</small></div></div>'+bars(d.top_skus,'sku')+'</article><article class="panel"><div class="panel-heading"><div><h2>Carreteiros com mais NC</h2><small>recorrência de recebimentos não conformes</small></div></div><div class="rq-drivers">'+d.top_drivers.map((x,i)=>'<div><span>'+(i+1)+'</span><strong>'+esc(x.name)+'</strong><b>'+int(x.nc_receipts)+'</b><small>'+pct(x.nc_rate)+'</small></div>').join('')+'</div></article></section>'+
   '<section class="panel rq-history"><div class="panel-heading"><div><h2>Histórico dos recebimentos</h2><small>detalhes mostram somente as não conformidades</small></div></div><div class="rq-table-wrap"><table><thead><tr><th>Data</th><th>Conferente</th><th>Carreteiro</th><th>Origem</th><th>Conformidade</th><th>Desvios</th><th>SKU(s)</th><th></th></tr></thead><tbody>'+history(d.history)+'</tbody></table></div></section>'+
   (s.timestamp_mismatch?'<p class="rq-audit-note">Auditoria de dados: '+int(s.timestamp_mismatch)+' registro(s) possuem ano do envio diferente do ano do recebimento. O painel usa a data de Recebimento como referência.</p>':'')+
   '</div>';
   $('rqMonth').onchange=e=>{R.month=e.target.value;load();};$('rqChecker').onchange=e=>{R.checker=e.target.value;load();};$('rqOrigin').onchange=e=>{R.origin=e.target.value;load();};$('rqRefresh').onclick=()=>load(true);
   root.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>{const id=Number(btn.dataset.detail);R.openDetail=R.openDetail===id?null:id;render();}));
 }
 async function load(){
   const root=$('receivingQualityView'),req=++R.req;if(root)root.innerHTML='<div class="rq-loading"><span></span>Carregando Qualidade do Recebimento…</div>';
   try{const d=await call({month:R.month,checker:R.checker,origin:R.origin});if(req!==R.req)return;R.data=d;R.openDetail=null;render();}catch(e){if(req===R.req&&root)root.innerHTML='<div class="rq-error"><strong>Não foi possível carregar o módulo</strong><span>'+esc(e.message||e)+'</span><button class="outline-button" id="rqRetry">Tentar novamente</button></div>';setTimeout(()=>$('rqRetry')?.addEventListener('click',load),0);}
 }
 window.__receivingQuality={open:load,refresh:load};
 if(!$('receivingQualityView')?.classList.contains('hidden'))load();
})();