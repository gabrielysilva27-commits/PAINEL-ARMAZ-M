(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/temperature-api';
  const T={month:new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,7),area:'all',data:null,req:0};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number(v||0).toLocaleString('pt-BR');
  const temp=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'°C';
  const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const MONTHS={'01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez'};
  const monthLabel=v=>{const s=String(v||'');return (MONTHS[s.slice(5,7)]||s.slice(5,7))+'/'+s.slice(0,4);};
  const areaLabel=a=>a==='all'?'Todas as áreas':a;
  const statusLabel=s=>s==='ok'?'OK':s==='attention'?'Atenção':s==='critical'?'Crítico':'Sem leitura';
  const statusBadge=s=>'<span class="temp-status '+esc(s)+'">'+statusLabel(s)+'</span>';
  async function call(payload={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action:'dashboard',...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Falha ao carregar Temperatura');return d;
  }
  function areaCards(items){
    return '<div class="temp-area-grid">'+items.map(x=>{
      const dominant=!x.readings?'none':x.critical?'critical':x.attention?'attention':'ok';
      return '<button class="temp-area-card" data-temp-area="'+esc(x.area)+'"><div><strong>'+esc(x.area)+'</strong>'+statusBadge(dominant)+'</div><div class="temp-area-values"><span><small>Média</small><b>'+temp(x.avg_temp)+'</b></span><span><small>Máxima</small><b>'+temp(x.max_temp)+'</b></span><span><small>Crítico</small><b>'+num(x.critical)+'</b></span></div></button>';
    }).join('')+'</div>';
  }
  function monthlyRows(items,area){
    if(!items?.length)return '<tr><td colspan="6"><div class="temp-empty">Sem dados.</div></td></tr>';
    return items.map(x=>'<tr><td><strong>'+esc(monthLabel(x.month))+'</strong></td>'+
      (area!=='all'?'<td>'+temp(x.avg_temp)+'</td><td>'+temp(x.max_temp)+'</td>':'')+
      '<td>'+num(x.readings)+'</td><td>'+num(x.attention)+'</td><td>'+num(x.critical)+'</td></tr>').join('');
  }
  function recentRows(items){
    if(!items?.length)return '<tr><td colspan="6"><div class="temp-empty">Sem leituras neste período.</div></td></tr>';
    return items.map(r=>'<tr><td>'+date(r.reading_date)+'</td><td>'+esc(r.shift)+'</td><td><strong>'+esc(r.area)+'</strong></td><td>'+temp(r.temperature)+'</td><td>'+statusBadge(r.status)+'</td><td>'+esc(r.conferencer_name||'—')+'</td></tr>').join('');
  }
  function render(){
    const root=$('temperatureView'),d=T.data;if(!root||!d)return;
    const s=d.summary,selected=T.area!=='all'?d.by_area.find(x=>x.area===T.area):null;
    const months=[...new Set([...(d.months||[]),T.month])].sort();
    root.innerHTML='<div class="temperature-module">'+
      '<div class="temp-toolbar"><div class="temp-filters"><label>Mês<select id="tempMonth">'+months.map(m=>'<option value="'+m+'" '+(m===T.month?'selected':'')+'>'+monthLabel(m)+'</option>').join('')+'</select></label><label>Área<select id="tempArea"><option value="all">Todas</option>'+d.areas.map(a=>'<option value="'+esc(a)+'" '+(a===T.area?'selected':'')+'>'+esc(a)+'</option>').join('')+'</select></label></div><button class="temp-register" id="tempRegister">+ Registrar temperatura</button></div>'+
      '<section class="temp-kpis">'+
        '<article><small>Leituras</small><strong>'+num(s.readings)+'</strong></article>'+
        (selected?'<article><small>Média</small><strong>'+temp(selected.avg_temp)+'</strong></article><article><small>Máxima</small><strong>'+temp(selected.max_temp)+'</strong></article>':'')+
        '<article class="ok"><small>OK</small><strong>'+num(s.ok)+'</strong></article>'+
        '<article class="attention"><small>Atenção</small><strong>'+num(s.attention)+'</strong></article>'+
        '<article class="critical"><small>Crítico</small><strong>'+num(s.critical)+'</strong></article>'+
      '</section>'+
      (T.area==='all'?'<section class="panel temp-area-panel"><div class="panel-heading"><h2>Áreas</h2></div>'+areaCards(d.by_area)+'</section>':'')+
      '<section class="panel temp-monthly"><div class="panel-heading"><div><h2>Histórico mensal</h2><small>'+esc(areaLabel(T.area))+'</small></div></div><div class="temp-table-wrap"><table><thead><tr><th>Mês</th>'+(T.area!=='all'?'<th>Média</th><th>Máxima</th>':'')+'<th>Leituras</th><th>Atenção</th><th>Crítico</th></tr></thead><tbody>'+monthlyRows(d.monthly,T.area)+'</tbody></table></div></section>'+
      '<section class="panel temp-history"><div class="panel-heading"><div><h2>Leituras</h2><small>'+monthLabel(T.month)+' · '+esc(areaLabel(T.area))+'</small></div></div><div class="temp-table-wrap"><table><thead><tr><th>Data</th><th>Turno</th><th>Área</th><th>Temperatura</th><th>Status</th><th>Conferente</th></tr></thead><tbody>'+recentRows(d.recent)+'</tbody></table></div></section>'+
    '</div>';
    $('tempMonth').onchange=e=>{T.month=e.target.value;load();};
    $('tempArea').onchange=e=>{T.area=e.target.value;load();};
    $('tempRegister').onclick=()=>window.open(new URL('temperatura/',location.href).href,'_blank','noopener');
    root.querySelectorAll('[data-temp-area]').forEach(b=>b.onclick=()=>{T.area=b.dataset.tempArea;$('tempArea').value=T.area;load();});
  }
  async function load(){
    const root=$('temperatureView'),req=++T.req;if(root)root.innerHTML='<div class="temp-loading"><span></span>Carregando temperaturas…</div>';
    try{const d=await call({month:T.month,area:T.area});if(req!==T.req)return;T.data=d;render();}
    catch(e){if(req===T.req&&root)root.innerHTML='<div class="temp-error"><strong>Não foi possível carregar Temperatura</strong><span>'+esc(e.message||e)+'</span><button class="outline-button" id="tempRetry">Tentar novamente</button></div>';setTimeout(()=>{$('tempRetry')?.addEventListener('click',load);},0);}
  }
  window.__temperatureModule={open:load,refresh:load};
})();