(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/temperature-api';
  const T={month:new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,7),area:'all',chartArea:'Câmara Fria',historyTab:'readings',data:null,req:0};
  const $=id=>document.getElementById(id);
  const AREAS=['Câmara Fria','Retornável','Descartável','Repack','Marketplace'];
  const RULES={
    'Câmara Fria':{okMax:5,critical:9,ok:'≤ 5,0 °C',attention:'5,1–8,9 °C',criticalText:'> 9,0 °C',measure:'1 ponto · manhã'},
    'Retornável':{okMax:22,critical:25,ok:'≤ 22,0 °C',attention:'22,1–25,0 °C',criticalText:'> 25,0 °C',measure:'2 pontos · maior leitura'},
    'Descartável':{okMax:22,critical:25,ok:'≤ 22,0 °C',attention:'22,1–25,0 °C',criticalText:'> 25,0 °C',measure:'2 pontos · maior leitura'},
    'Repack':{okMax:22,critical:25,ok:'≤ 22,0 °C',attention:'22,1–25,0 °C',criticalText:'> 25,0 °C',measure:'1 ponto · 3 turnos'},
    'Marketplace':{okMax:22,critical:25,ok:'≤ 22,0 °C',attention:'22,1–25,0 °C',criticalText:'> 25,0 °C',measure:'1 ponto · 3 turnos'}
  };
  const AREA_COLORS={'Câmara Fria':'#5b9de6','Retornável':'#8d7ae8','Descartável':'#e7a261','Repack':'#42aa98','Marketplace':'#d77daa'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number(v||0).toLocaleString('pt-BR');
  const temp=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'°C';
  const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const MONTHS={'01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez'};
  const monthLabel=v=>{const s=String(v||'');return (MONTHS[s.slice(5,7)]||s.slice(5,7))+'/'+s.slice(0,4);};
  const statusLabel=s=>s==='ok'?'OK':s==='attention'?'Atenção':s==='critical'?'Crítico':'Sem leitura';
  const statusBadge=s=>'<span class="temp-status '+esc(s)+'"><i></i>'+statusLabel(s)+'</span>';
  function statusForValue(area,value){
    if(value==null||!Number.isFinite(Number(value)))return 'none';
    const v=Number(value);
    if(area==='Câmara Fria')return v<=5?'ok':v<=9?'attention':'critical';
    return v<=22?'ok':v<=25?'attention':'critical';
  }

  async function call(payload={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action:'dashboard',...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Falha ao carregar Temperatura');
    return d;
  }

  function overview(s,selected){
    const stats=selected
      ? '<div class="temp-overview-number"><span>Total de leituras</span><strong>'+num(s.readings)+'</strong><em>período selecionado</em></div>'+
        '<div class="temp-overview-number"><span>Média das leituras</span><strong>'+temp(selected.avg_temp)+'</strong></div>'+
        '<div class="temp-overview-number"><span>Pico registrado</span><strong>'+temp(selected.max_temp)+'</strong></div>'
      : '<div class="temp-overview-number wide"><span>Total de leituras</span><strong>'+num(s.readings)+'</strong><em>período selecionado</em></div>';
    return '<section class="temp-overview">'+
      '<div class="temp-overview-numbers">'+stats+'</div>'+
      '<div class="temp-status-block"><small>Classificação das leituras</small><div class="temp-status-summary">'+
        '<span class="ok"><i></i><b>'+num(s.ok)+'</b> OK</span>'+
        '<span class="attention"><i></i><b>'+num(s.attention)+'</b> Atenção</span>'+
        '<span class="critical"><i></i><b>'+num(s.critical)+'</b> Crítico</span>'+
      '</div></div>'+
    '</section>';
  }

  function areaCards(items){
    return '<section class="temp-area-strip">'+items.map(x=>{
      const avgStatus=statusForValue(x.area,x.avg_temp);
      const color=AREA_COLORS[x.area]||'#9aa0a6';
      const criticalText=x.critical
        ? num(x.critical)+' '+(Number(x.critical)===1?'leitura crítica':'leituras críticas')
        : 'sem leitura crítica';
      return '<button class="temp-area-card" style="--area-color:'+color+'" data-temp-area="'+esc(x.area)+'">'+
        '<span class="temp-area-name"><i></i>'+esc(x.area)+'</span>'+
        '<strong>'+temp(x.avg_temp)+'</strong>'+
        '<span class="temp-area-caption">média das leituras</span>'+
        '<div class="temp-area-details"><span>pico '+temp(x.max_temp)+'</span><span class="'+(x.critical?'has-critical':'')+'">'+criticalText+'</span></div>'+
        '<span class="temp-average-status '+avgStatus+'"><i></i>Média · '+statusLabel(avgStatus)+'</span>'+
      '</button>';
    }).join('')+'</section>';
  }

  function monthlyRows(items,area){
    if(!items?.length)return '<tr><td colspan="6"><div class="temp-empty">Sem dados.</div></td></tr>';
    return items.map(x=>'<tr><td><strong>'+esc(monthLabel(x.month))+'</strong></td>'+
      (area!=='all'?'<td>'+temp(x.avg_temp)+'</td><td>'+temp(x.max_temp)+'</td>':'')+
      '<td>'+num(x.readings)+'</td><td>'+num(x.attention)+'</td><td>'+num(x.critical)+'</td></tr>').join('');
  }

  function recentRows(items){
    if(!items?.length)return '<tr><td colspan="6"><div class="temp-empty">Sem leituras neste período.</div></td></tr>';
    return items.map(r=>'<tr><td>'+date(r.reading_date)+'</td><td>'+esc(r.shift)+'</td><td><strong>'+esc(r.area)+'</strong></td><td><b>'+temp(r.temperature)+'</b></td><td>'+statusBadge(r.status)+'</td><td>'+esc(r.conferencer_name||'—')+'</td></tr>').join('');
  }

  function chartSvg(area,points){
    const rule=RULES[area]||RULES['Retornável'],areaColor=AREA_COLORS[area]||'#f47a20';
    const pts=(points||[]).filter(x=>Number.isFinite(Number(x.avg_temp)));
    if(!pts.length)return '<div class="temp-chart-empty">Sem leituras neste mês.</div>';
    const W=760,H=252,L=44,R=18,Tp=24,B=30;
    const vals=pts.map(x=>Number(x.avg_temp));
    let lo=Math.floor(Math.min(...vals,rule.okMax)-2),hi=Math.ceil(Math.max(...vals,rule.critical)+2);
    if(area==='Câmara Fria')lo=Math.max(0,lo);
    if(hi-lo<6){const mid=(hi+lo)/2;lo=Math.floor(mid-3);hi=Math.ceil(mid+3);}
    const plotW=W-L-R,plotH=H-Tp-B;
    const y=v=>Tp+(hi-v)/(hi-lo)*plotH;
    const x=i=>L+(pts.length===1?plotW/2:(i/(pts.length-1))*plotW);
    const okY=Math.max(Tp,Math.min(Tp+plotH,y(rule.okMax)));
    const critY=Math.max(Tp,Math.min(Tp+plotH,y(rule.critical)));
    const pointStatus=v=>area==='Câmara Fria'?(v<=5?'ok':v<=9?'attention':'critical'):(v<=22?'ok':v<=25?'attention':'critical');
    const line=pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(Number(p.avg_temp)).toFixed(1)).join(' ');
    const pointsMarkup=pts.map((p,i)=>{
      const v=Number(p.avg_temp),px=x(i),py=y(v),status=pointStatus(v);
      const labelY=Math.max(Tp+9,Math.min(Tp+plotH-3,py+(i%2===0?-9:13)));
      const label=v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
      return '<g class="temp-chart-point '+status+'"><circle class="temp-chart-dot" cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" r="'+(i===pts.length-1?4:3)+'"></circle>'+
        '<text class="temp-chart-data-label" x="'+px.toFixed(1)+'" y="'+labelY.toFixed(1)+'" text-anchor="middle">'+label+'</text></g>';
    }).join('');
    const idx=[0,Math.floor((pts.length-1)/2),pts.length-1].filter((v,i,a)=>a.indexOf(v)===i);
    const xlabels=idx.map(i=>'<text class="temp-chart-axis" x="'+x(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="'+(i===0?'start':i===pts.length-1?'end':'middle')+'">'+esc(String(pts[i].date).slice(8,10))+'</text>').join('');
    const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    return '<div class="temp-chart-wrap">'+
      '<div class="temp-chart-legend"><span class="ok"><i></i>OK</span><span class="attention"><i></i>Atenção</span><span class="critical"><i></i>Crítico</span></div>'+
      '<div class="temp-chart-stat"><span>'+pts.length+' dias com leitura</span><strong>'+temp(avg)+' média diária</strong></div>'+
      '<svg class="temp-chart" style="--temp-chart-color:'+areaColor+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Carta de controle de '+esc(area)+'">'+
        '<rect class="temp-zone critical" x="'+L+'" y="'+Tp+'" width="'+plotW+'" height="'+Math.max(0,critY-Tp)+'"></rect>'+
        '<rect class="temp-zone attention" x="'+L+'" y="'+critY+'" width="'+plotW+'" height="'+Math.max(0,okY-critY)+'"></rect>'+
        '<rect class="temp-zone ok" x="'+L+'" y="'+okY+'" width="'+plotW+'" height="'+Math.max(0,Tp+plotH-okY)+'"></rect>'+
        '<line class="temp-chart-rule attention" x1="'+L+'" y1="'+okY+'" x2="'+(W-R)+'" y2="'+okY+'"></line>'+
        '<line class="temp-chart-rule critical" x1="'+L+'" y1="'+critY+'" x2="'+(W-R)+'" y2="'+critY+'"></line>'+
        '<text class="temp-chart-limit attention" x="'+(L+4)+'" y="'+Math.max(Tp+11,okY-5)+'">'+temp(rule.okMax)+'</text>'+
        '<text class="temp-chart-limit critical" x="'+(L+4)+'" y="'+Math.max(Tp+11,critY-5)+'">'+temp(rule.critical)+'</text>'+
        '<path class="temp-chart-line" d="'+line+'"></path>'+pointsMarkup+xlabels+
      '</svg></div>';
  }

  function rulesBlock(area){
    const r=RULES[area]||RULES['Retornável'];
    return '<div class="temp-rule-bar">'+
      '<div class="ok"><span>OK</span><strong>'+esc(r.ok)+'</strong><small>OK</small></div>'+
      '<div class="attention"><span>Atenção</span><strong>'+esc(r.attention)+'</strong><small>Solicitar atenção dos ajudantes na movimentação</small></div>'+
      '<div class="critical"><span>Crítico</span><strong>'+esc(r.criticalText)+'</strong><small>Não realizar movimentação manual de caixaria / localizar os SKUs de caixaria nas áreas mais frescas do armazém</small></div>'+
    '</div>';
  }

  function controlPanel(d){
    const area=T.area==='all'?T.chartArea:T.area;
    const series=(d.control||[]).find(x=>x.area===area);
    const tabs=T.area==='all'?'<div class="temp-chart-tabs">'+AREAS.map(a=>'<button type="button" data-chart-area="'+esc(a)+'" class="'+(a===area?'active':'')+'" style="--tab-color:'+(AREA_COLORS[a]||'#f47a20')+'">'+esc(a)+'</button>').join('')+'</div>':'';
    return '<section class="panel temp-control-panel">'+
      '<div class="temp-control-head"><div class="temp-control-title"><h2>Carta de controle</h2><span>'+esc(area)+'</span><small>Média diária</small></div>'+tabs+'</div>'+
      chartSvg(area,series?.points||[])+rulesBlock(area)+
    '</section>';
  }

  function historyPanel(d){
    const isReadings=T.historyTab==='readings';
    const monthlyHead='<tr><th>Mês</th>'+(T.area!=='all'?'<th>Média</th><th>Máxima</th>':'')+'<th>Leituras</th><th>Atenção</th><th>Crítico</th></tr>';
    return '<section class="panel temp-history-panel">'+
      '<div class="temp-history-head"><h2>Histórico</h2><div class="temp-history-tabs">'+
        '<button type="button" data-history-tab="readings" class="'+(isReadings?'active':'')+'">Leituras</button>'+
        '<button type="button" data-history-tab="monthly" class="'+(!isReadings?'active':'')+'">Mensal</button>'+
      '</div></div>'+
      (isReadings
        ? '<div class="temp-table-wrap"><table class="temp-readings-table"><thead><tr><th>Data</th><th>Turno</th><th>Área</th><th>Temperatura</th><th>Status</th><th>Conferente</th></tr></thead><tbody>'+recentRows(d.recent)+'</tbody></table></div>'
        : '<div class="temp-table-wrap"><table class="temp-monthly-table"><thead>'+monthlyHead+'</thead><tbody>'+monthlyRows(d.monthly,T.area)+'</tbody></table></div>')+
    '</section>';
  }

  function render(){
    const root=$('temperatureView'),d=T.data;if(!root||!d)return;
    if(T.area!=='all')T.chartArea=T.area;
    if(!AREAS.includes(T.chartArea))T.chartArea='Câmara Fria';
    const s=d.summary,selected=T.area!=='all'?d.by_area.find(x=>x.area===T.area):null;
    const months=[...new Set([...(d.months||[]),T.month])].sort();

    root.innerHTML='<div class="temperature-module">'+
      '<div class="temp-toolbar">'+
        '<div class="temp-filters">'+
          '<label><span>Mês</span><select id="tempMonth">'+months.map(m=>'<option value="'+m+'" '+(m===T.month?'selected':'')+'>'+monthLabel(m)+'</option>').join('')+'</select></label>'+
          '<label><span>Área</span><select id="tempArea"><option value="all">Todas</option>'+d.areas.map(a=>'<option value="'+esc(a)+'" '+(a===T.area?'selected':'')+'>'+esc(a)+'</option>').join('')+'</select></label>'+
        '</div>'+
        '<button class="temp-register" id="tempRegister">Registrar temperatura</button>'+
      '</div>'+
      overview(s,selected)+
      (T.area==='all'?areaCards(d.by_area):'')+
      controlPanel(d)+
      historyPanel(d)+
    '</div>';

    $('tempMonth').onchange=e=>{T.month=e.target.value;load();};
    $('tempArea').onchange=e=>{T.area=e.target.value;if(T.area!=='all')T.chartArea=T.area;load();};
    $('tempRegister').onclick=()=>window.open(new URL('temperatura/',location.href).href,'_blank','noopener');
    root.querySelectorAll('[data-temp-area]').forEach(b=>b.onclick=()=>{T.area=b.dataset.tempArea;T.chartArea=T.area;load();});
    root.querySelectorAll('[data-chart-area]').forEach(b=>b.onclick=()=>{T.chartArea=b.dataset.chartArea;render();});
    root.querySelectorAll('[data-history-tab]').forEach(b=>b.onclick=()=>{T.historyTab=b.dataset.historyTab;render();});
  }

  async function load(){
    const root=$('temperatureView'),req=++T.req;
    if(root)root.innerHTML='<div class="temp-loading"><span></span>Carregando…</div>';
    try{
      const d=await call({month:T.month,area:T.area});
      if(req!==T.req)return;
      T.data=d;
      render();
    }catch(e){
      if(req===T.req&&root)root.innerHTML='<div class="temp-error"><strong>Não foi possível carregar Temperatura</strong><span>'+esc(e.message||e)+'</span><button class="outline-button" id="tempRetry">Tentar novamente</button></div>';
      setTimeout(()=>{$('tempRetry')?.addEventListener('click',load);},0);
    }
  }

  window.__temperatureModule={open:load,refresh:load};
})();