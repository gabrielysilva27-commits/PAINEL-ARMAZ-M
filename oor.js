(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const S={dash:null,detail:null,date:'',month:'',mode:'daily',status:'OUT',query:''};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const pct=v=>nf.format(Number(v||0)*100)+'%';
  const dt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const monthLabel=v=>{if(!v)return'—';const [y,m]=v.split('-');return ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][Number(m)]+'/'+y;};
  async function call(action,payload={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Falha no OOR');
    return d;
  }
  function view(){
    let v=$('stockOorView');
    if(v)return v;
    const main=document.querySelector('main');
    if(!main)return null;
    v=document.createElement('section');
    v.id='stockOorView';v.className='view hidden';
    main.appendChild(v);
    return v;
  }
  async function load(){
    const root=view();if(!root)return;
    root.innerHTML='<div class="oor-loading">Carregando OOR…</div>';
    try{
      S.dash=await call('oor_dashboard',S.date?{reference_date:S.date}:{});
      S.date=S.dash.reference_date||'';
      S.month=S.date?S.date.slice(0,7):S.month;
      S.detail=await call('oor_get',{reference_date:S.date});
      render();
    }catch(e){
      root.innerHTML='<div class="oor-empty"><strong>Não foi possível carregar o OOR</strong><span>'+esc(e.message)+'</span></div>';
    }
  }
  function cards(x,interactive=false){
    if(!x)return'';
    const card=(status,label,value,count,cls)=>'<button type="button" class="oor-kpi '+cls+' '+(interactive&&S.status===status?'active':'')+'" '+(interactive?'data-status="'+status+'"':'')+'><span><small>'+label+'</small><strong>'+pct(value)+'</strong></span><em>'+nf.format(count)+' de '+nf.format(x.total_count)+'</em></button>';
    return '<section class="oor-kpis">'+
      card('OUT','OUT',x.out_pct,x.out_count,'out')+
      card('OVER','OVER',x.over_pct,x.over_count,'over')+
      card('OK','OK',x.ok_pct,x.ok_count,'ok')+
    '</section>';
  }
  function filteredDetail(){
    const q=S.query.trim().toLowerCase();
    return (S.detail?.rows||[]).filter(x=>(!S.status||x.status===S.status)&&(!q||String(x.sku_code).includes(q)||String(x.sku_name||'').toLowerCase().includes(q)));
  }
  function dailyContent(){
    const d=S.dash?.daily, rows=filteredDetail(), has=S.detail?.detail_available;
    return cards(d,true)+
      '<div class="oor-detail-head"><div><strong>'+esc(S.status||'Todos')+'</strong><span>'+rows.length+' produto'+(rows.length===1?'':'s')+'</span></div><input id="oorSearch" placeholder="Buscar SKU ou produto" value="'+esc(S.query)+'"></div>'+
      (has?
        '<section class="oor-table"><table><thead><tr><th>SKU</th><th>Produto</th><th>Un.</th><th>Disponível</th><th>Média/dia</th><th>Mín.</th><th>Máx.</th><th>Dias real</th><th>Status</th></tr></thead><tbody>'+
        (rows.length?rows.map(x=>'<tr><td><strong>'+esc(x.sku_code)+'</strong></td><td class="oor-product">'+esc(x.sku_name||'')+'</td><td>'+esc(x.unit_code||'—')+'</td><td>'+fmt(x.available_qty)+'</td><td>'+fmt(x.avg_sales_qty)+'</td><td>'+fmt(x.min_days)+'</td><td>'+fmt(x.max_days)+'</td><td>'+fmt(x.real_days)+'</td><td><span class="oor-status '+String(x.status||'').toLowerCase()+'">'+esc(x.status||'—')+'</span></td></tr>').join(''):'<tr><td colspan="9" class="empty-row">Nenhum produto neste status.</td></tr>')+
        '</tbody></table></section>'
        :'<section class="oor-note"><strong>Detalhe por produto ainda não carregado para esta data.</strong><span>Os indicadores históricos permanecem disponíveis normalmente.</span></section>');
  }
  function fmt(v){return v==null||v===''?'—':nf.format(Number(v));}
  function accumulatedContent(){
    const a=S.dash?.accumulated, rows=S.dash?.month_daily||[];
    return cards(a,false)+
      '<div class="oor-section-title"><strong>Acumulado · '+monthLabel(a?.month)+'</strong><span>'+nf.format(a?.total_count||0)+' observações</span></div>'+
      '<section class="oor-table compact"><table><thead><tr><th>Data</th><th>OUT</th><th>% OUT</th><th>OVER</th><th>% OVER</th><th>OK</th><th>% OK</th><th>Total</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><strong>'+dt(x.reference_date)+'</strong></td><td>'+nf.format(x.out_count)+'</td><td class="out-text">'+pct(x.out_pct)+'</td><td>'+nf.format(x.over_count)+'</td><td class="over-text">'+pct(x.over_pct)+'</td><td>'+nf.format(x.ok_count)+'</td><td class="ok-text">'+pct(x.ok_pct)+'</td><td>'+nf.format(x.total_count)+'</td></tr>').join('')+
      '</tbody></table></section>';
  }
  function monthlyContent(){
    const rows=S.dash?.monthly||[];
    return '<div class="oor-section-title"><strong>Visão mensal</strong><span>Percentual acumulado de cada arquivo mensal</span></div>'+
      '<section class="oor-table compact"><table><thead><tr><th>Mês</th><th>OUT</th><th>% OUT</th><th>OVER</th><th>% OVER</th><th>OK</th><th>% OK</th><th>Total</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><strong>'+monthLabel(x.month)+'</strong></td><td>'+nf.format(x.out_count)+'</td><td class="out-text">'+pct(x.out_pct)+'</td><td>'+nf.format(x.over_count)+'</td><td class="over-text">'+pct(x.over_pct)+'</td><td>'+nf.format(x.ok_count)+'</td><td class="ok-text">'+pct(x.ok_pct)+'</td><td>'+nf.format(x.total_count)+'</td></tr>').join('')+
      '</tbody></table></section>';
  }
  function monthOptions(){
    const dates=S.dash?.dates||[];
    const months=[...new Set(dates.map(x=>String(x).slice(0,7)))];
    return months.map(m=>'<option value="'+esc(m)+'" '+(m===S.month?'selected':'')+'>'+monthLabel(m)+'</option>').join('');
  }
  function dayOptions(){
    const dates=(S.dash?.dates||[]).filter(x=>String(x).slice(0,7)===S.month);
    return dates.map(x=>'<option value="'+esc(x)+'" '+(x===S.date?'selected':'')+'>'+String(x).slice(8,10)+'</option>').join('');
  }
  function render(){
    const root=view();if(!root)return;const d=S.dash||{};
    root.innerHTML='<section class="oor-card">'+
      '<div class="oor-card-head"><div class="oor-tabs"><button data-mode="daily" class="'+(S.mode==='daily'?'active':'')+'">Diário</button><button data-mode="accumulated" class="'+(S.mode==='accumulated'?'active':'')+'">Acumulado</button><button data-mode="monthly" class="'+(S.mode==='monthly'?'active':'')+'">Mensal</button></div>'+
      '<div class="oor-meta"><span>Política '+esc(d.policy?.code||'—')+(d.policy?' · Vigente':'')+'</span><label>Mês<select id="oorMonth">'+monthOptions()+'</select></label><label>Dia<select id="oorDate">'+dayOptions()+'</select></label></div></div>'+
      '<div class="oor-card-body">'+(S.mode==='daily'?dailyContent():S.mode==='accumulated'?accumulatedContent():monthlyContent())+'</div>'+
      '</section>';
    $('oorMonth').onchange=async e=>{
      S.month=e.target.value;
      const dates=(S.dash?.dates||[]).filter(x=>String(x).slice(0,7)===S.month).sort();
      S.date=dates[dates.length-1]||'';
      S.query='';
      await load();
    };
    $('oorDate').onchange=async e=>{S.date=e.target.value;S.query='';await load();};
    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{S.mode=b.dataset.mode;render();});
    root.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{S.status=b.dataset.status;render();});
    if($('oorSearch'))$('oorSearch').oninput=e=>{S.query=e.target.value;render();};
  }
  async function open(){
    const v=view();if(!v)return;
    document.querySelectorAll('main > .view').forEach(x=>x.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
    v.classList.remove('hidden');
    document.querySelector('[data-view="pull-oor"]')?.classList.add('active');
    document.querySelector('.pull-nav-group')?.classList.add('open');
    $('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='OOR';
    if($('pageSubtitle'))$('pageSubtitle').textContent='OUT / OVER / OK diário, acumulado e mensal.';
    await load();
  }
  function install(){
    view();
    if(!$('stockOorCss')){const l=document.createElement('link');l.id='stockOorCss';l.rel='stylesheet';l.href='oor.css?v=20260923-4';document.head.appendChild(l);}
    window.__stockOor={open,reload:load};
  }
  install();
})();