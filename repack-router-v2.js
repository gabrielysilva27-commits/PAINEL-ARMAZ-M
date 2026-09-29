(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/repack-api';
  const PUB='sb_publishable_W8fSiZaa-n_tM1YhhsdVfQ_WErczC8K';
  const TIMER_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/repack/';
  const S={month:new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,7),data:null,adminWorkers:null,pinIssue:null};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
  const nfi=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
  const monthNames=['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const DESPEJO_DAILY_TARGET=50*60;
  const channelNames={bombona:'Despejo · Bombona',repack:'Repack',bag:'BAG',devolucao:'Devolução'};
  const role=()=>window.state?.user?.role||'';
  const localMonth=v=>new Date(v).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,7);
  const localDate=v=>new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const localTime=v=>new Date(v).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
  const fmtDuration=s=>{s=Math.max(0,Number(s||0));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m} min`;};
  const fmtPerBox=s=>Number.isFinite(s)&&s>0?`${Math.floor(s/60)}m ${String(Math.round(s%60)).padStart(2,'0')}s`:'—';
  const monthLabel=v=>{const [y,m]=String(v).split('-');return `${monthNames[Number(m)]||m}/${y}`;};

  async function call(action,payload={}){
    const token=window.state?.token||localStorage.getItem('pa_session')||'';
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','apikey':PUB,'x-session-token':token},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Falha no módulo Repack');
    return d;
  }
  function ensureAssets(){if(!$('repackCss')){const l=document.createElement('link');l.id='repackCss';l.rel='stylesheet';l.href='repack-v2.css?v=20260929-1';document.head.appendChild(l)}}
  function ensureView(){let v=$('repackView');if(v)return v;v=document.createElement('section');v.id='repackView';v.className='view hidden';document.querySelector('main')?.appendChild(v);return v}
  function addNav(){
    if(document.querySelector('[data-view="repack"]'))return;
    const nav=document.querySelector('.sidebar nav');if(!nav)return setTimeout(addNav,180);
    const b=document.createElement('button');b.className='nav-link';b.dataset.view='repack';b.innerHTML='<span>⏱</span> Repack';b.onclick=open;nav.appendChild(b);
    const v=ensureView();for(const n of document.querySelectorAll('.nav-link:not([data-view="repack"])'))n.addEventListener('click',()=>v.classList.add('hidden'));
  }
  async function open(){
    ensureAssets();const v=ensureView();document.querySelectorAll('main > .view').forEach(x=>x.classList.add('hidden'));document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
    v.classList.remove('hidden');document.querySelector('[data-view="repack"]')?.classList.add('active');$('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='Repack';if($('pageSubtitle'))$('pageSubtitle').textContent='';
    v.innerHTML='<div class="repack-loading">Carregando resultados do Repack…</div>';await load();
  }
  async function load(){
    try{
      const d=await call('dashboard',{month:S.month});S.data=d.dashboard;
      if(role()==='admin'){try{S.adminWorkers=(await call('admin_workers')).workers||[]}catch{S.adminWorkers=null}}
      render();
    }catch(e){ensureView().innerHTML='<div class="repack-empty"><strong>Não foi possível carregar o Repack</strong><span>'+esc(e.message)+'</span></div>'}
  }
  function aggBlank(){return{tasks:0,boxes:0,seconds:0}}
  function selectedAgg(){
    const out={bombona:aggBlank(),repack:aggBlank(),bag:aggBlank(),devolucao:aggBlank()};
    for(const r of S.data?.legacy||[]){if(String(r.reference_month).slice(0,7)!==S.month)continue;const a=out[r.channel]||aggBlank();a.tasks+=Number(r.task_count||0);a.boxes+=Number(r.quantity_boxes||0);a.seconds+=Number(r.duration_seconds||0);out[r.channel]=a}
    for(const t of S.data?.selected_tasks||[]){const a=out[t.channel]||aggBlank();a.tasks+=1;a.boxes+=Number(t.quantity_boxes||0);a.seconds+=Number(t.duration_seconds||0);out[t.channel]=a}
    return out;
  }
  function procAgg(chs,a){return chs.reduce((o,k)=>{o.tasks+=a[k]?.tasks||0;o.boxes+=a[k]?.boxes||0;o.seconds+=a[k]?.seconds||0;return o},aggBlank())}
  function yearTrend(){
    const map=new Map();const get=m=>{if(!map.has(m))map.set(m,{month:m,bombona:aggBlank(),repack:aggBlank(),bag:aggBlank(),devolucao:aggBlank(),through:null});return map.get(m)};
    for(const r of S.data?.legacy||[]){const m=String(r.reference_month).slice(0,7),o=get(m),a=o[r.channel]||aggBlank();a.tasks+=Number(r.task_count||0);a.boxes+=Number(r.quantity_boxes||0);a.seconds+=Number(r.duration_seconds||0);o[r.channel]=a;o.through=r.data_through>o.through?r.data_through:o.through}
    for(const t of S.data?.live_year_tasks||[]){const m=localMonth(t.started_at),o=get(m),a=o[t.channel]||aggBlank();a.tasks++;a.boxes+=Number(t.quantity_boxes||0);a.seconds+=Number(t.duration_seconds||0);o[t.channel]=a}
    return [...map.values()].sort((a,b)=>a.month.localeCompare(b.month));
  }
  function targetMap(){return new Map((S.data?.targets||[]).filter(x=>x.active!==false).map(x=>[x.packaging_code,Number(x.target_seconds_per_box)]))}
  function currentDataThrough(){let d=null;for(const r of S.data?.legacy||[]){if(String(r.reference_month).slice(0,7)===S.month&&(!d||r.data_through>d))d=r.data_through}return d}
  function render(){
    const root=ensureView(),a=selectedAgg(),des=procAgg(['bombona'],a),rep=procAgg(['repack','bag','devolucao'],a);
    const repAvg=rep.tasks?rep.seconds/rep.tasks:0,desAvg=des.tasks?des.seconds/des.tasks:0;
    const repSpb=rep.boxes?rep.seconds/rep.boxes:0,desSpu=des.boxes?des.seconds/des.boxes:0;
    const meta=Number(S.data?.default_target_seconds_per_box||170),trend=yearTrend(),through=currentDataThrough(),targets=targetMap();
    const repUnitStatus=repSpb?(repSpb<=meta?'OK':'ACIMA'):'—';
    const desStatus=desAvg?(desAvg<=DESPEJO_DAILY_TARGET?'OK':'ACIMA'):'—';
    root.innerHTML=`
      <div class="repack-toolbar">
        <div class="repack-actions"><label>Mês<select id="repackMonth">${monthOptions()}</select></label><button class="outline-button" id="repackRefresh">Atualizar</button><a class="primary-button repack-link" href="${TIMER_URL}" target="_blank" rel="noopener">Abrir cronômetro ↗</a></div>
      </div>
      <section class="repack-kpis">
        <article class="metric-card"><p>Caixas Repack</p><strong>${nfi.format(rep.boxes)}</strong><small>${nfi.format(rep.tasks)} apontamentos</small></article>
        <article class="metric-card"><p>Tempo médio Repack</p><strong>${fmtDuration(repAvg)}</strong><small>média por apontamento</small></article>
        <article class="metric-card ${repSpb&&repSpb<=meta?'repack-ok':'repack-warn'}"><p>Repack / caixa</p><strong>${fmtPerBox(repSpb)}</strong><small>Meta base ${fmtPerBox(meta)} · ${repUnitStatus}</small></article>
        <article class="metric-card"><p>Unidades Despejo</p><strong>${nfi.format(des.boxes)}</strong><small>${nfi.format(des.tasks)} dias/apontamentos</small></article>
        <article class="metric-card ${desAvg&&desAvg<=DESPEJO_DAILY_TARGET?'repack-ok':'repack-warn'}"><p>Tempo médio Despejo</p><strong>${fmtDuration(desAvg)}</strong><small>Meta diária 50 min · ${desStatus}</small></article>
        <article class="metric-card"><p>Despejo / unidade</p><strong>${fmtPerBox(desSpu)}</strong><small>tempo médio por unidade</small></article>
      </section>
      <section class="repack-grid">
        <article class="panel"><div class="panel-heading"><h2>Resultado por atividade</h2></div>${activityTable(a)}</article>
        <article class="panel"><div class="panel-heading"><h2>Cronômetros em andamento</h2></div>${activeTimers()}</article>
      </section>
      <section class="panel repack-trend"><div class="panel-heading"><h2>Evolução 2026</h2></div>${trendTable(trend,meta)}</section>
      <section class="panel repack-history"><div class="panel-heading"><h2>Apontamentos · ${monthLabel(S.month)}</h2></div>${liveTable(S.data?.selected_tasks||[],targets,meta)}</section>
      ${role()==='admin'?adminSection():''}
    `;
    bind();
  }
  function monthOptions(){const months=new Set((S.data?.legacy||[]).map(x=>String(x.reference_month).slice(0,7)));for(const t of S.data?.live_year_tasks||[])months.add(localMonth(t.started_at));months.add(S.month);return[...months].sort().reverse().map(m=>`<option value="${m}" ${m===S.month?'selected':''}>${monthLabel(m)}</option>`).join('')}
  function activityTable(a){
    const order=['bombona','repack','bag','devolucao'];
    return`<div class="table-wrap"><table><thead><tr><th>Atividade</th><th>Apont.</th><th>Quantidade</th><th>Tempo total</th><th>Tempo médio</th><th>Tempo/unid.</th></tr></thead><tbody>${order.map(k=>{
      const x=a[k]||aggBlank(),avg=x.tasks?x.seconds/x.tasks:0,rate=x.boxes?x.seconds/x.boxes:0,unit=k==='bombona'?'un.':'cx';
      return`<tr><td><strong>${channelNames[k]}</strong></td><td>${nfi.format(x.tasks)}</td><td>${nfi.format(x.boxes)} ${unit}</td><td>${fmtDuration(x.seconds)}</td><td>${fmtDuration(avg)}</td><td>${fmtPerBox(rate)} ${rate?'/ '+unit:''}</td></tr>`
    }).join('')}</tbody></table></div>`
  }
  function activeTimers(){const rows=S.data?.active_tasks||[];if(!rows.length)return'<div class="repack-empty compact"><strong>Nenhum cronômetro ativo</strong><span>As tarefas iniciadas pelos ajudantes aparecerão aqui em tempo real.</span></div>';return`<div class="repack-active-list">${rows.map(t=>`<div class="repack-active"><div><strong>${esc(t.worker?.display_name||'Ajudante')}</strong><span>${esc(channelNames[t.channel]||t.channel)}${t.packaging_code?' · '+esc(t.packaging_code):''}</span></div><div><b data-repack-elapsed="${esc(t.started_at)}">${elapsed(t.started_at)}</b><small>desde ${localTime(t.started_at)}</small></div></div>`).join('')}</div>`}
  function elapsed(start){const s=Math.max(0,Math.floor((Date.now()-new Date(start).getTime())/1000)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}
  function trendTable(rows,meta){
    if(!rows.length)return'<div class="repack-empty compact">Sem histórico.</div>';
    return`<div class="table-wrap"><table><thead><tr><th>Mês</th><th>Repack médio</th><th>Repack/CX</th><th>Despejo médio</th><th>Meta despejo</th><th>Despejo/unid.</th></tr></thead><tbody>${rows.map(o=>{
      const r=procAgg(['repack','bag','devolucao'],o),d=procAgg(['bombona'],o);
      const ravg=r.tasks?r.seconds/r.tasks:0,davg=d.tasks?d.seconds/d.tasks:0,rs=r.boxes?r.seconds/r.boxes:0,ds=d.boxes?d.seconds/d.boxes:0;
      return`<tr><td><strong>${monthLabel(o.month)}</strong></td><td>${fmtDuration(ravg)}</td><td>${fmtPerBox(rs)}</td><td><strong>${fmtDuration(davg)}</strong></td><td>${davg?`<span class="repack-pill ${davg<=DESPEJO_DAILY_TARGET?'ok':'bad'}">${davg<=DESPEJO_DAILY_TARGET?'OK':'Acima'}</span><small class="repack-target">50 min</small>`:'—'}</td><td>${fmtPerBox(ds)}</td></tr>`
    }).join('')}</tbody></table></div>`
  }
  function liveTable(rows,targets,meta){
    if(!rows.length)return'<div class="repack-empty compact"><strong>Ainda não há apontamentos do cronômetro neste mês.</strong><span>O histórico anterior continua preservado nos resultados consolidados acima.</span></div>';
    return`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Ajudante</th><th>Atividade</th><th>Embalagem</th><th>Quantidade</th><th>Duração</th><th>Tempo/unid.</th><th>Meta</th></tr></thead><tbody>${rows.map(t=>{
      const qty=Number(t.quantity_boxes||0),rate=qty?Number(t.duration_seconds)/qty:0,isDes=t.channel==='bombona',unit=isDes?'un.':'cx',tar=t.packaging_code?(targets.get(t.packaging_code)||meta):meta;
      return`<tr><td>${localDate(t.started_at)} ${localTime(t.started_at)}</td><td>${esc(t.worker?.display_name||'—')}</td><td>${esc(channelNames[t.channel]||t.channel)}</td><td>${esc(t.packaging_code||'—')}</td><td>${nf.format(qty)} ${unit}</td><td>${fmtDuration(t.duration_seconds)}</td><td>${fmtPerBox(rate)}${rate?' / '+unit:''}</td><td>${isDes?'<span class="repack-target">Meta avaliada na média diária</span>':`<span class="repack-pill ${rate&&rate<=tar?'ok':'bad'}">${rate&&rate<=tar?'OK':'Acima'}</span><small class="repack-target">${fmtPerBox(tar)}</small>`}</td></tr>`
    }).join('')}</tbody></table></div>`
  }
  function adminSection(){const list=S.adminWorkers||S.data?.workers||[];return`<section class="panel repack-admin"><div class="panel-heading"><h2>Equipe Repack</h2></div>${S.pinIssue?`<div class="repack-pin"><div><span>PIN emitido para ${esc(S.pinIssue.display_name)}</span><strong>${esc(S.pinIssue.pin)}</strong><small>Copie agora. Por segurança, depois ele só pode ser redefinido.</small></div><button class="outline-button" id="repackCopyPin">Copiar PIN</button></div>`:''}<div class="repack-create"><input id="repackWorkerName" placeholder="Nome do ajudante" maxlength="120"><button class="primary-button" id="repackWorkerCreate">Cadastrar e gerar PIN</button></div><div class="repack-worker-list">${list.length?list.map(w=>`<div class="repack-worker"><div><strong>${esc(w.display_name)}</strong><span>${w.active?'Ativo':'Inativo'}${w.pin_ready===false?' · sem PIN':''}</span></div><div><button class="outline-button" data-repack-reset="${esc(w.id)}">Redefinir PIN</button><button class="outline-button" data-repack-toggle="${esc(w.id)}" data-active="${w.active?'1':'0'}">${w.active?'Desativar':'Ativar'}</button></div></div>`).join(''):'<div class="repack-empty compact">Nenhum ajudante cadastrado.</div>'}</div></section>`}
  async function refreshAdmin(){if(role()!=='admin')return;S.adminWorkers=(await call('admin_workers')).workers||[];render()}
  function bind(){
    $('repackMonth')?.addEventListener('change',e=>{S.month=e.target.value;load()});$('repackRefresh')?.addEventListener('click',load);
    $('repackWorkerCreate')?.addEventListener('click',async()=>{const name=$('repackWorkerName')?.value.trim();if(!name)return window.showToast?.('Informe o nome do ajudante.',true);try{const d=await call('admin_worker_create',{display_name:name});S.pinIssue=d.issued;await refreshAdmin()}catch(e){window.showToast?.(e.message,true)}});
    document.querySelectorAll('[data-repack-reset]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Redefinir o PIN deste ajudante? O PIN anterior deixará de funcionar.'))return;try{const d=await call('admin_worker_reset_pin',{id:b.dataset.repackReset});S.pinIssue=d.issued;await refreshAdmin()}catch(e){window.showToast?.(e.message,true)}}));
    document.querySelectorAll('[data-repack-toggle]').forEach(b=>b.addEventListener('click',async()=>{try{await call('admin_worker_toggle',{id:b.dataset.repackToggle,active:b.dataset.active!=='1'});await refreshAdmin()}catch(e){window.showToast?.(e.message,true)}}));
    $('repackCopyPin')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(S.pinIssue?.pin||'');window.showToast?.('PIN copiado.')}catch{window.showToast?.('Copie o PIN manualmente.',true)}});
    clearInterval(window.__repackTicker);window.__repackTicker=setInterval(()=>document.querySelectorAll('[data-repack-elapsed]').forEach(el=>el.textContent=elapsed(el.dataset.repackElapsed)),1000);
  }
  ensureAssets();ensureView();setTimeout(addNav,520);
  window.__repack={open,load};
})();