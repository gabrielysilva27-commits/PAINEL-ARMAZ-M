(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const S={dash:null,detail:null,date:'',mode:'daily',query:'',status:''};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const pct=v=>nf.format(Number(v||0)*100)+'%';
  const dt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const monthLabel=v=>{if(!v)return'—';const [y,m]=v.split('-');return ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][Number(m)]+'/'+y;};
  async function call(action,payload={}){const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action,...payload})});const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Falha no OOR');return d;}
  function view(){let v=$('stockOorView');if(v)return v;const main=document.querySelector('main');if(!main)return null;v=document.createElement('section');v.id='stockOorView';v.className='view hidden';main.appendChild(v);return v;}
  async function load(){const root=view();if(!root)return;root.innerHTML='<div class="oor-loading">Carregando OOR…</div>';try{
    S.dash=await call('oor_dashboard',S.date?{reference_date:S.date}:{});
    S.date=S.dash.reference_date||'';
    S.detail=await call('oor_get',{reference_date:S.date});
    render();
  }catch(e){root.innerHTML='<div class="oor-empty"><strong>Não foi possível carregar o OOR</strong><span>'+esc(e.message)+'</span></div>';}}
  function cards(x){
    if(!x)return'';
    return '<section class="oor-kpis">'+
      '<article class="out"><small>OUT</small><strong>'+pct(x.out_pct)+'</strong><span>'+nf.format(x.out_count)+' de '+nf.format(x.total_count)+'</span></article>'+
      '<article class="over"><small>OVER</small><strong>'+pct(x.over_pct)+'</strong><span>'+nf.format(x.over_count)+' de '+nf.format(x.total_count)+'</span></article>'+
      '<article class="ok"><small>OK</small><strong>'+pct(x.ok_pct)+'</strong><span>'+nf.format(x.ok_count)+' de '+nf.format(x.total_count)+'</span></article>'+
    '</section>';
  }
  function detailMatches(){
    const rows=S.detail?.rows||[], d=S.dash?.daily;if(!rows.length||!d)return false;
    const c={OUT:0,OVER:0,OK:0};for(const r of rows)if(c[r.status]!=null)c[r.status]++;
    return rows.length===Number(d.total_count)&&c.OUT===Number(d.out_count)&&c.OVER===Number(d.over_count)&&c.OK===Number(d.ok_count);
  }
  function filteredDetail(){const q=S.query.trim().toLowerCase();return (S.detail?.rows||[]).filter(x=>(!S.status||x.status===S.status)&&(!q||String(x.sku_code).includes(q)||String(x.sku_name||'').toLowerCase().includes(q)));}
  function dailyView(){
    const d=S.dash?.daily, rows=filteredDetail(), showDetail=detailMatches();
    return cards(d)+
      '<section class="oor-context"><strong>'+dt(S.date)+'</strong><span>'+nf.format(d?.total_count||0)+' observações no dia</span></section>'+
      (showDetail?
        '<section class="oor-tools"><div><input id="oorSearch" placeholder="Buscar SKU ou produto" value="'+esc(S.query)+'"><select id="oorStatus"><option value="">Todos os status</option><option value="OUT" '+(S.status==='OUT'?'selected':'')+'>OUT</option><option value="OVER" '+(S.status==='OVER'?'selected':'')+'>OVER</option><option value="OK" '+(S.status==='OK'?'selected':'')+'>OK</option></select></div><span>'+rows.length+' SKUs</span></section>'+
        '<section class="oor-table"><table><thead><tr><th>SKU</th><th>Produto</th><th>Un.</th><th>Disponível</th><th>Mínimo</th><th>Máximo</th><th>Status</th></tr></thead><tbody>'+
        rows.map(x=>'<tr><td><strong>'+esc(x.sku_code)+'</strong></td><td class="oor-product">'+esc(x.sku_name||'')+'</td><td>'+esc(x.unit_code||'—')+'</td><td class="qty">'+nf.format(Number(x.available_qty||0))+'</td><td>'+nf.format(Number(x.out_qty||0))+'</td><td>'+nf.format(Number(x.over_qty||0))+'</td><td><span class="oor-status '+String(x.status||'').toLowerCase()+'">'+esc(x.status||'—')+'</span></td></tr>').join('')+
        '</tbody></table></section>'
        :'<section class="oor-note"><strong>Resumo histórico da planilha</strong><span>Os percentuais e contagens deste dia foram importados do OOR original. O detalhe por SKU só aparece quando a base diária completa estiver disponível no Painel.</span></section>'
      );
  }
  function accumulatedView(){
    const a=S.dash?.accumulated, rows=S.dash?.month_daily||[];
    return cards(a)+
      '<section class="oor-context"><strong>Acumulado · '+monthLabel(a?.month)+'</strong><span>'+dt(a?.through_date)+' · '+nf.format(a?.days||0)+' dias · '+nf.format(a?.total_count||0)+' observações</span></section>'+
      '<section class="oor-table compact"><table><thead><tr><th>Data</th><th>OUT</th><th>% OUT</th><th>OVER</th><th>% OVER</th><th>OK</th><th>% OK</th><th>Total</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><strong>'+dt(x.reference_date)+'</strong></td><td>'+nf.format(x.out_count)+'</td><td class="out-text">'+pct(x.out_pct)+'</td><td>'+nf.format(x.over_count)+'</td><td class="over-text">'+pct(x.over_pct)+'</td><td>'+nf.format(x.ok_count)+'</td><td class="ok-text">'+pct(x.ok_pct)+'</td><td>'+nf.format(x.total_count)+'</td></tr>').join('')+
      '</tbody></table></section>';
  }
  function monthlyView(){
    const rows=S.dash?.monthly||[];
    return '<section class="oor-context"><strong>Visão mensal</strong><span>Percentual calculado sobre todas as observações registradas em cada mês.</span></section>'+
      '<section class="oor-table compact"><table><thead><tr><th>Mês</th><th>Dias</th><th>OUT</th><th>% OUT</th><th>OVER</th><th>% OVER</th><th>OK</th><th>% OK</th><th>Total</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><strong>'+monthLabel(x.month)+'</strong></td><td>'+nf.format(x.days)+'</td><td>'+nf.format(x.out_count)+'</td><td class="out-text">'+pct(x.out_pct)+'</td><td>'+nf.format(x.over_count)+'</td><td class="over-text">'+pct(x.over_pct)+'</td><td>'+nf.format(x.ok_count)+'</td><td class="ok-text">'+pct(x.ok_pct)+'</td><td>'+nf.format(x.total_count)+'</td></tr>').join('')+
      '</tbody></table></section>';
  }
  function render(){
    const root=view();if(!root)return;const d=S.dash||{};
    root.innerHTML='<div class="oor">'+
      '<section class="oor-top"><div><strong>OOR</strong><small>Política '+esc(d.policy?.code||'—')+(d.policy?' · Vigente':'')+'</small></div><div class="oor-period"><label>Data<select id="oorDate">'+(d.dates||[]).map(x=>'<option value="'+esc(x)+'" '+(x===S.date?'selected':'')+'>'+dt(x)+'</option>').join('')+'</select></label></div></section>'+
      '<nav class="oor-tabs"><button data-mode="daily" class="'+(S.mode==='daily'?'active':'')+'">Diário</button><button data-mode="accumulated" class="'+(S.mode==='accumulated'?'active':'')+'">Acumulado</button><button data-mode="monthly" class="'+(S.mode==='monthly'?'active':'')+'">Mensal</button></nav>'+
      (S.mode==='daily'?dailyView():S.mode==='accumulated'?accumulatedView():monthlyView())+
      '<p class="oor-foot">Cálculo da planilha: % do status = quantidade de ocorrências do status ÷ total de observações do período.</p></div>';
    $('oorDate').onchange=async e=>{S.date=e.target.value;await load();};
    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{S.mode=b.dataset.mode;render();});
    if($('oorSearch'))$('oorSearch').oninput=e=>{S.query=e.target.value;render();};
    if($('oorStatus'))$('oorStatus').onchange=e=>{S.status=e.target.value;render();};
  }
  async function open(){const v=view();if(!v)return;document.querySelectorAll('main > .view').forEach(x=>x.classList.add('hidden'));document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));v.classList.remove('hidden');document.querySelector('[data-view="pull-oor"]')?.classList.add('active');document.querySelector('.pull-nav-group')?.classList.add('open');$('sidebar')?.classList.remove('open');if($('pageTitle'))$('pageTitle').textContent='OOR';if($('pageSubtitle'))$('pageSubtitle').textContent='Visão diária, acumulada e mensal de OUT / OVER / OK.';await load();}
  function install(){view();if(!$('stockOorCss')){const l=document.createElement('link');l.id='stockOorCss';l.rel='stylesheet';l.href='oor.css?v=20260923-3';document.head.appendChild(l);}window.__stockOor={open,reload:load};}
  install();
})();