(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const S={dash:null,detail:null,history:null,date:'',mode:'daily',query:'',status:'OUT'};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const pct=v=>nf.format(Number(v||0)*100)+'%';
  const dt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const monthLabel=v=>{if(!v)return'—';const [y,m]=v.split('-');return ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][Number(m)]+'/'+y;};
  async function call(action,payload={}){const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action,...payload})});const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Falha no OOR');return d;}
  function view(){let v=$('stockOorView');if(v)return v;const main=document.querySelector('main');if(!main)return null;v=document.createElement('section');v.id='stockOorView';v.className='view hidden';main.appendChild(v);return v;}
  async function loadHistory(){
    if(S.history)return S.history;
    try{
      const b64=(await fetch('oor-history.b64?v=20260923-1',{cache:'force-cache'}).then(r=>r.text())).trim();
      const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      S.history=JSON.parse(await new Response(stream).text());
    }catch(e){
      console.warn('Histórico detalhado do OOR indisponível',e);
      S.history={d:{},n:{}};
    }
    return S.history;
  }
  async function load(){
    const root=view();if(!root)return;
    root.innerHTML='<div class="oor-loading">Carregando OOR…</div>';
    try{
      const [dash]=await Promise.all([call('oor_dashboard',S.date?{reference_date:S.date}:{}),loadHistory()]);
      S.dash=dash;S.date=dash.reference_date||'';
      S.detail=await call('oor_get',{reference_date:S.date}).catch(()=>({rows:[]}));
      render();
    }catch(e){root.innerHTML='<div class="oor-empty"><strong>Não foi possível carregar o OOR</strong><span>'+esc(e.message)+'</span></div>';}
  }
  function summaryForMode(){
    if(S.mode==='daily')return S.dash?.daily;
    return S.dash?.accumulated;
  }
  function cards(x){
    if(!x)return'';
    return '<div class="oor-kpis">'+
      ['OUT','OVER','OK'].map(st=>{
        const key=st.toLowerCase(),active=S.mode==='daily'&&S.status===st?' active':'';
        return '<button type="button" class="oor-kpi '+key+active+'" data-status="'+st+'"><span><small>'+st+'</small><b>'+pct(x[key+'_pct'])+'</b></span><em>'+nf.format(x[key+'_count'])+' de '+nf.format(x.total_count)+'</em></button>';
      }).join('')+
    '</div>';
  }
  function historyRows(){
    const day=S.history?.d?.[S.date]||{};
    const statuses=S.status?[S.status]:['OUT','OVER','OK'];
    const rows=[];
    statuses.forEach(st=>(day[st]||[]).forEach(sku=>{
      const meta=S.history?.n?.[sku]||['',''];
      rows.push({sku_code:sku,sku_name:meta[0]||'',unit_code:meta[1]||'',status:st});
    }));
    const q=S.query.trim().toLowerCase();
    return rows.filter(x=>!q||x.sku_code.includes(q)||x.sku_name.toLowerCase().includes(q));
  }
  function dailyView(){
    const d=S.dash?.daily,rows=historyRows();
    return cards(d)+
      '<div class="oor-list-head"><div><strong>'+esc(S.status||'Todos')+'</strong><span>'+nf.format(rows.length)+' produto(s) em '+dt(S.date)+'</span></div><input id="oorSearch" placeholder="Buscar SKU ou produto" value="'+esc(S.query)+'"></div>'+
      '<div class="oor-products"><table><thead><tr><th>SKU</th><th>Produto</th><th>Unidade</th><th>Status</th></tr></thead><tbody>'+
      (rows.length?rows.map(x=>'<tr><td><strong>'+esc(x.sku_code)+'</strong></td><td class="oor-product">'+esc(x.sku_name)+'</td><td>'+esc(x.unit_code||'—')+'</td><td><span class="oor-status '+x.status.toLowerCase()+'">'+x.status+'</span></td></tr>').join(''):'<tr><td colspan="4" class="empty-row">Nenhum produto neste status para a data selecionada.</td></tr>')+
      '</tbody></table></div>';
  }
  function accumulatedView(){
    const a=S.dash?.accumulated,rows=S.dash?.month_daily||[];
    return cards(a)+
      '<div class="oor-section-title"><strong>Acumulado · '+monthLabel(a?.month)+'</strong><span>'+nf.format(a?.days||0)+' dias registrados</span></div>'+
      '<div class="oor-products compact"><table><thead><tr><th>Data</th><th>OUT</th><th>% OUT</th><th>OVER</th><th>% OVER</th><th>OK</th><th>% OK</th><th>Total</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><strong>'+dt(x.reference_date)+'</strong></td><td>'+nf.format(x.out_count)+'</td><td class="out-text">'+pct(x.out_pct)+'</td><td>'+nf.format(x.over_count)+'</td><td class="over-text">'+pct(x.over_pct)+'</td><td>'+nf.format(x.ok_count)+'</td><td class="ok-text">'+pct(x.ok_pct)+'</td><td>'+nf.format(x.total_count)+'</td></tr>').join('')+
      '</tbody></table></div>';
  }
  function monthlyView(){
    const rows=S.dash?.monthly||[];
    return '<div class="oor-section-title"><strong>Visão mensal</strong><span>Acumulado final de cada planilha mensal</span></div>'+
      '<div class="oor-products compact"><table><thead><tr><th>Mês</th><th>OUT</th><th>% OUT</th><th>OVER</th><th>% OVER</th><th>OK</th><th>% OK</th><th>Base</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><strong>'+monthLabel(x.month)+'</strong></td><td>'+nf.format(x.out_count)+'</td><td class="out-text">'+pct(x.out_pct)+'</td><td>'+nf.format(x.over_count)+'</td><td class="over-text">'+pct(x.over_pct)+'</td><td>'+nf.format(x.ok_count)+'</td><td class="ok-text">'+pct(x.ok_pct)+'</td><td>'+nf.format(x.total_count)+'</td></tr>').join('')+
      '</tbody></table></div>';
  }
  function render(){
    const root=view();if(!root)return;const d=S.dash||{};
    root.innerHTML='<section class="oor-panel">'+
      '<div class="oor-panel-head"><div><div class="oor-heading-line"><strong>OOR</strong><span>Política '+esc(d.policy?.code||'—')+(d.policy?' · Vigente':'')+'</span></div><nav class="oor-tabs"><button data-mode="daily" class="'+(S.mode==='daily'?'active':'')+'">Diário</button><button data-mode="accumulated" class="'+(S.mode==='accumulated'?'active':'')+'">Acumulado</button><button data-mode="monthly" class="'+(S.mode==='monthly'?'active':'')+'">Mensal</button></nav></div>'+
      '<label>Data<select id="oorDate">'+(d.dates||[]).map(x=>'<option value="'+esc(x)+'" '+(x===S.date?'selected':'')+'>'+dt(x)+'</option>').join('')+'</select></label></div>'+
      '<div class="oor-panel-body">'+(S.mode==='daily'?dailyView():S.mode==='accumulated'?accumulatedView():monthlyView())+'</div>'+
      '<footer class="oor-formula">Diário: status na data ÷ registros da data. Acumulado/Mensal: cálculo preservado das planilhas OOR.</footer>'+
      '</section>';
    $('oorDate').onchange=async e=>{S.date=e.target.value;await load();};
    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{S.mode=b.dataset.mode;render();});
    root.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{if(S.mode!=='daily')return;S.status=b.dataset.status;render();});
    if($('oorSearch'))$('oorSearch').oninput=e=>{S.query=e.target.value;render();};
  }
  async function open(){
    const v=view();if(!v)return;document.querySelectorAll('main > .view').forEach(x=>x.classList.add('hidden'));document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));v.classList.remove('hidden');document.querySelector('[data-view="pull-oor"]')?.classList.add('active');document.querySelector('.pull-nav-group')?.classList.add('open');$('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='OOR';
    if($('pageSubtitle'))$('pageSubtitle').textContent='OUT / OVER / OK diário, acumulado e mensal.';
    await load();
  }
  function install(){view();if(!$('stockOorCss')){const l=document.createElement('link');l.id='stockOorCss';l.rel='stylesheet';l.href='oor.css?v=20260923-4';document.head.appendChild(l);}window.__stockOor={open,reload:load};}
  install();
})();