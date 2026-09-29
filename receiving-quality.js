(() => {
 const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/receiving-quality-api';
 const R={month:'all',checker:'',origin:'',data:null,req:0,openDetail:null};
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pct=v=>v==null?'—':(v*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
 const int=v=>Number(v||0).toLocaleString('pt-BR');
 const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
 const MONTHS=[['all','Acumulado'],['01','Janeiro'],['02','Fevereiro'],['03','Março'],['04','Abril'],['05','Maio'],['06','Junho'],['07','Julho'],['08','Agosto'],['09','Setembro'],['10','Outubro'],['11','Novembro'],['12','Dezembro']];
 async function api(action,payload={}){
   const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action,...payload})});
   const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Falha ao processar Qualidade do Recebimento');return d;
 }
 async function call(payload={}){return api('dashboard',payload)}
 async function ensureXlsx(){
   if(window.XLSX)return window.XLSX;
   if(window.__rqXlsxPromise)return window.__rqXlsxPromise;
   window.__rqXlsxPromise=new Promise((resolve,reject)=>{
     const s=document.createElement('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.async=true;
     s.onload=()=>resolve(window.XLSX);s.onerror=()=>{window.__rqXlsxPromise=null;reject(new Error('Não foi possível carregar o leitor de Excel.'));};
     document.head.appendChild(s);
   });
   return window.__rqXlsxPromise;
 }
 async function import031120File(file){
   if(!file)return null;
   if(R.month==='all')throw new Error('Selecione o mês do relatório antes de importar.');
   if(file.size>12*1024*1024)throw new Error('O arquivo 03.11.20 excede 12 MB.');
   const ext=(file.name.split('.').pop()||'').toLowerCase();
   let text='';
   if(ext==='xlsx'||ext==='xls'){
     const XLSX=await ensureXlsx(),buf=await file.arrayBuffer(),book=XLSX.read(buf,{type:'array',cellDates:false});
     const ws=book.Sheets[book.SheetNames[0]];
     if(!ws)throw new Error('A planilha não possui aba legível.');
     text=XLSX.utils.sheet_to_csv(ws,{FS:';',RS:'\n'});
   }else{
     const buf=await file.arrayBuffer(),utf8=new TextDecoder('utf-8').decode(buf);
     let win=utf8;try{win=new TextDecoder('windows-1252').decode(buf)}catch{}
     const score=t=>{const x=String(t||'').toUpperCase();return (x.includes('ENTRADA CDD')?4:0)+(x.includes('MAPA')?2:0)+(x.includes('VEIC')?2:0)+(x.includes('DATA')?1:0)};
     text=score(win)>score(utf8)?win:utf8;
   }
   return api('import_031120',{source_file:file.name,text,target_month:R.month});
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
 function palletTrend(items){
   if(!items?.length)return '<div class="rq-empty">Sem base 03.11.20 para este período.</div>';
   const max=Math.max(...items.map(x=>Number(x.pulled||0)),1);
   return '<div class="rq-pallet-trend">'+items.map(x=>'<div class="rq-pallet-row"><strong>'+esc(x.label)+'</strong><div><i><b style="width:'+(Number(x.pulled||0)/max*100)+'%"></b></i><small>'+int(x.pulled)+' puxados · '+int(x.damaged)+' avariados</small></div><em>'+pct(x.damage_rate)+'</em></div>').join('')+'</div>';
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
   const pull=d.pull_source||{},missing=(pull.missing_months||[]).map(m=>(MONTHS.find(x=>x[0]===m)||[m,m])[1]).join(', ');
   const filtered=R.checker||R.origin;
   const importButton=window.state?.user?.role==='admin'
     ?'<button class="rq-import-btn" id="rqImport031120" type="button">Importar 03.11.20</button><input id="rqImport031120File" type="file" accept=".xlsx,.xls,.csv,.txt,.inf" hidden>'
     :'';
   root.innerHTML='<div class="rq-module">'+
     '<div class="rq-toolbar"><div class="rq-filters">'+
       '<label><span>Período</span><select id="rqMonth">'+MONTHS.map(([v,l])=>'<option value="'+v+'" '+(R.month===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
       '<label><span>Conferente</span><select id="rqChecker"><option value="">Todos</option>'+d.filters.checkers.map(a=>'<option value="'+esc(a)+'" '+(R.checker===a?'selected':'')+'>'+esc(a)+'</option>').join('')+'</select></label>'+
       '<label><span>Origem</span><select id="rqOrigin"><option value="">Todas</option>'+d.filters.origins.map(a=>'<option value="'+esc(a)+'" '+(R.origin===a?'selected':'')+'>'+esc(a)+'</option>').join('')+'</select></label>'+
       '<button class="rq-refresh" id="rqRefresh">Atualizar</button>'+
     '</div></div>'+
     '<section class="rq-kpis">'+
       '<article><span>Conformidade</span><strong>'+pct(s.compliance)+'</strong><small>'+int(s.binary_nonconformities)+' desvios</small></article>'+
       '<article><span>Recebimentos</span><strong>'+int(s.receipts)+'</strong><small>avaliados no período</small></article>'+
       '<article><span>Com NC</span><strong>'+int(s.nc_receipts)+'</strong><small>'+pct(s.receipts?s.nc_receipts/s.receipts:0)+' dos checks</small></article>'+
       '<article><span>Produtos com NC</span><strong>'+int(s.unique_nc_skus)+'</strong><small>SKUs distintos</small></article>'+
     '</section>'+
     '<section class="panel rq-pallet-panel">'+
       '<div class="rq-section-head"><div><h2>Puxada e avaria</h2><p>03.11.20 · 8 carretas · 28 paletes por viagem</p></div><div class="rq-section-actions">'+importButton+'</div></div>'+
       '<div class="rq-pallet-layout"><div class="rq-pallet-kpis">'+
         '<article><span>Paletes puxados</span><strong>'+int(s.pallets_pulled)+'</strong><small>'+int(s.trucks_pulled)+' viagens</small></article>'+
         '<article><span>Paletes avariados</span><strong>'+int(s.damaged_pallets)+'</strong></article>'+
         '<article><span>Índice de avaria</span><strong>'+pct(s.damage_rate)+'</strong></article>'+
       '</div><div class="rq-pallet-chart">'+palletTrend(d.pallet_trend)+'</div></div>'+
       (filtered?'<div class="rq-inline-note">Conferente e origem não alteram o volume puxado; apenas os demais indicadores.</div>':'')+
       (Number(s.uncovered_damaged_pallets||0)>0?'<div class="rq-warning">'+int(s.uncovered_damaged_pallets)+' palete(s) avariado(s) estão fora de dias cobertos pelo 03.11.20.</div>':'')+
       (missing?'<div class="rq-warning">Base 03.11.20 ainda sem cobertura para: '+esc(missing)+'.</div>':'')+
     '</section>'+
     '<section class="rq-grid-main">'+
       '<article class="panel"><div class="rq-section-head"><h2>Evolução da conformidade</h2></div>'+lineChart(d.trend)+'</article>'+
       '<article class="panel"><div class="rq-section-head"><h2>Não conformidades recorrentes</h2></div>'+bars(d.top_categories,'category')+'</article>'+
     '</section>'+
     '<section class="rq-grid-secondary">'+
       '<article class="panel"><div class="rq-section-head"><h2>Conferentes</h2></div>'+people(d.by_checker)+'</article>'+
       '<article class="panel"><div class="rq-section-head"><h2>Origem das cargas</h2></div>'+origins(d.by_origin)+'</article>'+
     '</section>'+
     '<section class="rq-grid-secondary">'+
       '<article class="panel"><div class="rq-section-head"><h2>Produtos com mais NC</h2></div>'+bars(d.top_skus,'sku')+'</article>'+
       '<article class="panel"><div class="rq-section-head"><h2>Carreteiros com NC</h2></div><div class="rq-drivers">'+d.top_drivers.map((x,i)=>'<div><span>'+(i+1)+'</span><strong>'+esc(x.name)+'</strong><b>'+int(x.nc_receipts)+'</b><small>'+pct(x.nc_rate)+'</small></div>').join('')+'</div></article>'+
     '</section>'+
     '<section class="panel rq-history"><div class="rq-section-head"><h2>Histórico</h2></div><div class="rq-table-wrap"><table><thead><tr><th>Data</th><th>Conferente</th><th>Carreteiro</th><th>Origem</th><th>Conformidade</th><th>Desvios</th><th>SKU(s)</th><th></th></tr></thead><tbody>'+history(d.history)+'</tbody></table></div></section>'+
     (s.timestamp_mismatch?'<div class="rq-audit-note">'+int(s.timestamp_mismatch)+' registro(s) possuem divergência entre ano do envio e data do recebimento.</div>':'')+
   '</div>';
   $('rqMonth').onchange=e=>{R.month=e.target.value;load();};
   $('rqChecker').onchange=e=>{R.checker=e.target.value;load();};
   $('rqOrigin').onchange=e=>{R.origin=e.target.value;load();};
   $('rqRefresh').onclick=()=>load(true);
   if($('rqImport031120')){
     $('rqImport031120').onclick=()=>{
       if(R.month==='all'){alert('Selecione o mês do relatório antes de importar.');return;}
       $('rqImport031120File').click();
     };
     $('rqImport031120File').onchange=async e=>{
       const file=e.target.files?.[0];if(!file)return;
       const b=$('rqImport031120'),old=b.textContent;
       try{
         b.disabled=true;b.textContent='Importando...';
         const out=await import031120File(file),x=out?.import||{};
         alert('03.11.20 importado: '+int(x.truck_count)+' viagem(ns) · '+int(x.pallets_pulled)+' paletes.');
         await load(true);
       }catch(err){alert(err?.message||String(err))}
       finally{b.disabled=false;b.textContent=old;e.target.value=''}
     };
   }
   root.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>{const id=Number(btn.dataset.detail);R.openDetail=R.openDetail===id?null:id;render();}));
 }
 async function load(){
   const root=$('receivingQualityView'),req=++R.req;if(root)root.innerHTML='<div class="rq-loading"><span></span>Carregando Qualidade do Recebimento…</div>';
   try{const d=await call({month:R.month,checker:R.checker,origin:R.origin});if(req!==R.req)return;R.data=d;R.openDetail=null;render();}catch(e){if(req===R.req&&root)root.innerHTML='<div class="rq-error"><strong>Não foi possível carregar o módulo</strong><span>'+esc(e.message||e)+'</span><button class="outline-button" id="rqRetry">Tentar novamente</button></div>';setTimeout(()=>$('rqRetry')?.addEventListener('click',load),0);}
 }
 window.__receivingQuality={open:load,refresh:load};
 if(!$('receivingQualityView')?.classList.contains('hidden'))load();
})();