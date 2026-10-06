(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const S={dash:null,detail:null,date:'',month:'',mode:'daily',status:'OUT',query:''};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const pct=v=>v==null?'—':nf.format(Number(v)*100)+'%';
  const dt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const monthLabel=v=>{if(!v)return'—';const [y,m]=v.split('-');return ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][Number(m)]+'/'+y;};
  function normHeader(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase().replace(/[.:]+$/g,'');}
  function detectDelimiter(text){const lines=text.split(/\r?\n/).filter(x=>x.trim()).slice(0,30),ops=[';','\t',','];let best=';',score=-1;for(const d of ops){const s=lines.reduce((a,l)=>a+l.split(d).length-1,0);if(s>score){score=s;best=d;}}return best;}
  function parseCsv(text,d){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=ch;continue;}if(ch==='"')quoted=true;else if(ch===d){row.push(field);field='';}else if(ch==='\n'){row.push(field.replace(/\r$/,''));if(row.some(v=>String(v).trim()))rows.push(row);row=[];field='';}else field+=ch;}if(field.length||row.length){row.push(field.replace(/\r$/,''));if(row.some(v=>String(v).trim()))rows.push(row);}return rows;}
  function numberValue(v){let s=String(v??'').trim().replace(/\s/g,'');if(!s)return null;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');s=s.replace(/[^\d+\-.]/g,'');const n=Number(s);return Number.isFinite(n)?n:null;}
  function oorQty(v,unit){const raw=String(v??'').trim().replace(/\s/g,'');if(!raw)return null;let s=raw.split('/')[0];if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/\./g,'');s=s.replace(/[^\d+\-.]/g,'');let n=Number(s);if(!Number.isFinite(n))return null;if(normHeader(unit)==='DZ')n=n/2;return n;}
  function skuValue(v){const s=String(v??'').trim().replace(/^'+/,'').replace(/\.0+$/,'').replace(/\D/g,'').replace(/^0+/,'');return s||'';}
  const SKU_ALIASES=['ITEM','COD ITEM','CODIGO ITEM','CODIGO DO ITEM','MATERIAL','COD MATERIAL','CODIGO MATERIAL','COD PRODUTO','CODIGO PRODUTO','COD PROD','CODIGO'];
  const QTY_ALIASES=['QTDE DISPONIVEL','QTD DISPONIVEL','QUANTIDADE DISPONIVEL','DISPONIVEL','ESTOQUE DISPONIVEL','SALDO DISPONIVEL','QTDE ESTOQUE','QTD ESTOQUE','QUANTIDADE ESTOQUE','SALDO ESTOQUE','SALDO','ESTOQUE','QTDE','QTD','QUANTIDADE'];
  const NAME_ALIASES=['DESCRICAO','DESC ITEM','DESCRICAO ITEM','NOME PRODUTO'],UNIT_ALIASES=['UNIDADE','UNID','UND','UN','UM'];
  const exactCol=(h,a)=>{for(const x of a){const i=h.indexOf(x);if(i>=0)return i;}return-1;};
  function ratio(rows,start,i,kind){let t=0,n=0;for(let r=start;r<Math.min(rows.length,start+80);r++){const v=String(rows[r][i]??'').trim();if(!v)continue;t++;if(kind==='sku'?/^'?\d+(?:\.0+)?$/.test(v):numberValue(v)!=null)n++;}return t?n/t:0;}
  function headerRow(rows){let best=0,score=-1;for(let r=0;r<Math.min(rows.length,40);r++){const h=rows[r].map(normHeader);let s=(exactCol(h,SKU_ALIASES)>=0?10:0)+(exactCol(h,QTY_ALIASES)>=0?10:0);if(h.some(x=>/ITEM|MATERIAL|COD PROD/.test(x)))s+=3;if(h.some(x=>/DISPON|SALDO|ESTOQUE|QTDE|QTD|QUANT/.test(x)))s+=3;if(s>score){score=s;best=r;}}return best;}
  function skuCol(h,rows,start){const e=exactCol(h,SKU_ALIASES);if(e>=0)return e;let best=-1,score=0;for(let i=0;i<h.length;i++){let s=ratio(rows,start,i,'sku')*100;if(/ITEM|MATERIAL|PROD/.test(h[i]))s+=35;if(/COD/.test(h[i]))s+=25;if(/DESCR|NOME|UNID|QT|SALDO|ESTOQUE/.test(h[i]))s-=80;if(s>score){score=s;best=i;}}return score>=70?best:-1;}
  function qtyCol(h,rows,start){const e=exactCol(h,QTY_ALIASES);if(e>=0)return e;let best=-1,score=-999;for(let i=0;i<h.length;i++){let s=ratio(rows,start,i,'num')*50;if(/DISPON|LIVRE/.test(h[i]))s+=120;if(/SALDO/.test(h[i]))s+=90;if(/ESTOQUE/.test(h[i]))s+=70;if(/QTDE|QTD|QUANT/.test(h[i]))s+=45;if(/BLOQ|RESERV|TRANSIT|AVARIA|QUALID|VENC|PRECO|VALOR|COD|ITEM/.test(h[i]))s-=120;if(s>score){score=s;best=i;}}return score>=55?best:-1;}
  async function parse020502File(file){const bytes=new Uint8Array(await file.arrayBuffer());let text=new TextDecoder('utf-8').decode(bytes);if((text.match(/\uFFFD/g)||[]).length>2)text=new TextDecoder('windows-1252').decode(bytes);const d=detectDelimiter(text),rows=parseCsv(text,d);if(rows.length<2)throw new Error('CSV do 02.05.02 vazio.');const hr=headerRow(rows),h=rows[hr].map(normHeader),start=hr+1,si=skuCol(h,rows,start),qi=qtyCol(h,rows,start);if(si<0)throw new Error('Coluna de item/SKU não encontrada. Cabeçalhos: '+h.join(' | '));if(qi<0)throw new Error('Coluna de saldo disponível não encontrada. Cabeçalhos: '+h.join(' | '));const ni=exactCol(h,NAME_ALIASES),ui=exactCol(h,UNIT_ALIASES),agg=new Map();for(let r=start;r<rows.length;r++){const sku=skuValue(rows[r][si]),qty=oorQty(rows[r][qi],ui>=0?rows[r][ui]:null);if(!sku||qty==null)continue;const old=agg.get(sku)||{sku_code:sku,sku_name:ni>=0?String(rows[r][ni]??'').trim():'',unit_code:ui>=0?String(rows[r][ui]??'').trim()||null:null,available_qty:0};old.available_qty+=qty;agg.set(sku,old);}const out=[...agg.values()].map(x=>({...x,available_qty:Math.round(x.available_qty*1000)/1000}));if(!out.length)throw new Error('Nenhum SKU válido encontrado no 02.05.02.');return{rows:out,quantity_column:h[qi]};}
  function ensureImportModal(){let m=$('oorImportModal');if(m)return m;m=document.createElement('div');m.id='oorImportModal';m.className='modal-backdrop hidden';m.innerHTML='<div class="modal-card"><div class="modal-header"><div><p class="eyebrow">CONTINGÊNCIA OOR</p><h2>Importar 02.05.02</h2></div><button type="button" class="close-button" id="oorImportClose">×</button></div><p class="modal-intro">Selecione somente o arquivo LIBERAÇÃO CHEIO do 02.05.02 e informe a data do estoque. DEVOLUÇÃO, ANÁLISE/PNC e outros tipos não são aceitos. O arquivo não é armazenado; somente o resultado por SKU é gravado no Painel.</p><div class="import-grid"><label>Data de referência<input id="oorImportDate" type="date"></label><label>Arquivo CSV<input id="oorImportFile" type="file" accept=".csv,.inf,text/csv"></label></div><p class="form-error" id="oorImportError"></p><div class="modal-actions"><button type="button" class="outline-button" id="oorImportCancel">Cancelar</button><button type="button" class="primary-button" id="oorImportConfirm">Importar e recalcular</button></div></div>';document.body.appendChild(m);const close=()=>m.classList.add('hidden');$('oorImportClose').onclick=close;$('oorImportCancel').onclick=close;$('oorImportConfirm').onclick=manualImport;return m;}
  function openImport(){const m=ensureImportModal(),date=$('oorImportDate');date.value=S.date||new Date().toISOString().slice(0,10);$('oorImportFile').value='';$('oorImportError').textContent='';m.classList.remove('hidden');}
  async function manualImport(){const err=$('oorImportError'),btn=$('oorImportConfirm'),file=$('oorImportFile').files?.[0],date=$('oorImportDate').value;err.textContent='';if(!date){err.textContent='Informe a data de referência.';return;}if(!file){err.textContent='Selecione o CSV do 02.05.02.';return;}if(!normHeader(file.name).includes('LIBERACAO CHEIO')){err.textContent='Selecione o arquivo LIBERAÇÃO CHEIO. Outros tipos não entram no OOR.';return;}btn.disabled=true;btn.textContent='Importando…';try{const parsed=await parse020502File(file);const d=await call('oor_import',{reference_date:date,rows:parsed.rows,source_file:file.name});window.showToast?.('02.05.02 importado: '+nf.format(d.rows||parsed.rows.length)+' SKUs.');$('oorImportModal').classList.add('hidden');S.date=date;S.month=date.slice(0,7);S.query='';await load();}catch(e){err.textContent=e.message||String(e);}finally{btn.disabled=false;btn.textContent='Importar e recalcular';}}
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
    return (S.detail?.rows||[]).filter(x=>(!S.status||(S.status==='INNO'?x.is_innovation&&x.indicator_eligible:S.status==='INDISP'?x.is_unavailable&&x.indicator_eligible:x.status===S.status))&&(!q||String(x.sku_code).includes(q)||String(x.sku_name||'').toLowerCase().includes(q)));
  }
  function indicatorCards(x,interactive=false){
    if(!x)return '<div class="oor-note"><strong>Sem base para os indicadores complementares nesta data.</strong></div>';
    const card=(key,label,value,detail)=>'<button type="button" class="oor-kpi extra '+(interactive&&S.status===key?'active':'')+'" '+(interactive&&key?'data-status="'+key+'"':'disabled')+'><span><small>'+label+'</small><strong>'+pct(value)+'</strong></span><em>'+detail+'</em></button>';
    return '<section class="oor-kpis oor-extra">'+card('','Ocupação de estoque',x.occupation_pct,nf.format(x.average_stock_qty??x.stock_qty)+' / '+nf.format(x.average_capacity_qty??x.capacity_qty)+' cx'+(x.days?' · média/dia':''))+card('INDISP','Indisponibilidade',x.unavailable_pct,nf.format(x.unavailable_count)+' de '+nf.format(x.product_count))+card('INNO','Inovação',x.innovation_pct,nf.format(x.innovation_count)+' de '+nf.format(x.product_count))+'</section>'+
      '<div class="oor-indicator-source">Capacidade, INNO e malha: '+esc(x.config_month||'—')+' · '+(x.source==='AGENTE_020502'?'Estoque atualizado pelo agente':x.source==='MIXED'?'Histórico da planilha e agente':'Histórico da planilha')+(x.days?' · '+nf.format(x.days)+' dias com base':'')+'</div>';
  }
  function indicatorTable(rows,monthly=false){
    return '<section class="oor-table compact oor-indicator-table"><table><thead><tr><th>'+(monthly?'Mês':'Data')+'</th><th>Ocupação</th><th>Indisponibilidade</th><th>Inovação</th><th>'+(monthly?'Dias com base':'Produtos')+'</th></tr></thead><tbody>'+rows.map(x=>'<tr><td><strong>'+(monthly?monthLabel(x.month):dt(x.reference_date))+'</strong></td><td>'+pct(x.occupation_pct)+'</td><td>'+pct(x.unavailable_pct)+'</td><td>'+pct(x.innovation_pct)+'</td><td>'+nf.format(monthly?x.days:x.product_count)+'</td></tr>').join('')+'</tbody></table></section>';
  }
  function dailyContent(){
    const d=S.dash?.daily, rows=filteredDetail(), has=S.detail?.detail_available;
    return cards(d,true)+indicatorCards(S.dash?.indicators?.daily,true)+
      '<div class="oor-detail-head"><div><strong>'+esc(({INNO:'Inovação',INDISP:'Indisponibilidade'})[S.status]||S.status||'Todos')+'</strong><span>'+rows.length+' produto'+(rows.length===1?'':'s')+'</span></div><input id="oorSearch" placeholder="Buscar SKU ou produto" value="'+esc(S.query)+'"></div>'+
      (has?
        '<section class="oor-table"><table><thead><tr><th>SKU</th><th>Produto</th><th>Un.</th><th>Disponível</th><th>Média/dia</th><th>Mín.</th><th>Máx.</th><th>Dias real</th><th>Status</th></tr></thead><tbody>'+
        (rows.length?rows.map(x=>'<tr><td><strong>'+esc(x.sku_code)+'</strong></td><td class="oor-product">'+esc(x.sku_name||'')+'</td><td>'+esc(x.unit_code||'—')+'</td><td>'+fmt(x.available_qty)+'</td><td>'+fmt(x.avg_sales_qty)+'</td><td>'+fmt(x.min_days)+'</td><td>'+fmt(x.max_days)+'</td><td>'+fmt(x.real_days)+'</td><td><span class="oor-status '+String(x.status||'').toLowerCase()+'">'+esc(x.status||'—')+'</span></td></tr>').join(''):'<tr><td colspan="9" class="empty-row">Nenhum produto neste status.</td></tr>')+
        '</tbody></table></section>'
        :'<section class="oor-note"><strong>Detalhe por produto ainda não carregado para esta data.</strong><span>Os indicadores históricos permanecem disponíveis normalmente.</span></section>');
  }
  function fmt(v){return v==null||v===''?'—':nf.format(Number(v));}
  function accumulatedContent(){
    const a=S.dash?.accumulated, rows=S.dash?.month_daily||[];
    return cards(a,false)+indicatorCards(S.dash?.indicators?.accumulated,false)+indicatorTable(S.dash?.indicators?.month_daily||[])+
      '<div class="oor-section-title"><strong>Acumulado · '+monthLabel(a?.month)+'</strong><span>'+nf.format(a?.total_count||0)+' observações</span></div>'+
      '<section class="oor-table compact"><table><thead><tr><th>Data</th><th>OUT</th><th>% OUT</th><th>OVER</th><th>% OVER</th><th>OK</th><th>% OK</th><th>Total</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><strong>'+dt(x.reference_date)+'</strong></td><td>'+nf.format(x.out_count)+'</td><td class="out-text">'+pct(x.out_pct)+'</td><td>'+nf.format(x.over_count)+'</td><td class="over-text">'+pct(x.over_pct)+'</td><td>'+nf.format(x.ok_count)+'</td><td class="ok-text">'+pct(x.ok_pct)+'</td><td>'+nf.format(x.total_count)+'</td></tr>').join('')+
      '</tbody></table></section>';
  }
  function monthlyContent(){
    const rows=S.dash?.monthly||[];
    return indicatorTable(S.dash?.indicators?.monthly||[],true)+'<div class="oor-section-title"><strong>OUT / OVER / OK por mês</strong></div>'+
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
      '<div class="oor-meta"><span>Política '+esc(d.policy?.code||'—')+(d.policy?' · Vigente':'')+'</span><button type="button" class="outline-button" id="oorImportButton">Contingência · Importar 02.05.02</button><label>Mês<select id="oorMonth">'+monthOptions()+'</select></label><label>Dia<select id="oorDate">'+dayOptions()+'</select></label></div></div>'+
      '<div class="oor-card-body">'+(S.mode==='daily'?dailyContent():S.mode==='accumulated'?accumulatedContent():monthlyContent())+'</div>'+
      '</section>';
    $('oorImportButton').onclick=openImport;
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
    if(!$('stockOorCss')){const l=document.createElement('link');l.id='stockOorCss';l.rel='stylesheet';l.href='oor.css?v=20261005-indicators';document.head.appendChild(l);}
    window.__stockOor={open,reload:load};
  }
  install();
})();
