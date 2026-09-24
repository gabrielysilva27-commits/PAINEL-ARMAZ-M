(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/receiving-nri-api';
  const BO_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const CONF_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/recebimento/';
  const $=id=>document.getElementById(id);
  let mode='nri',receipts=[],selected=null,xlsxPromise=null;

  async function call(action,payload={}){const token=window.state?.token||localStorage.getItem('pa_session')||'';const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':token},body:JSON.stringify({action,...payload})});const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro no Recebimento / NRI');return d}
  async function boCall(action,payload={},token=''){const headers={'Content-Type':'application/json'};if(token)headers['x-bo-token']=token;const r=await fetch(BO_API,{method:'POST',headers,body:JSON.stringify({action,...payload})});const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro de autenticação');return d}
  async function confCall(action,payload={},token){const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-bo-token':token},body:JSON.stringify({action,...payload})});const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro de autorização da NRI');return d}
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fd=v=>{const p=String(v||'').slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:v||'—'};
  const n=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v||0));
  const ft=v=>{if(!v)return'—';const s=String(v);if(/^\\d{2}:\\d{2}/.test(s))return s.slice(0,5);const d=new Date(s);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});};
  const receiptStatus=s=>({awaiting_conference:'Aguardando conferência',in_conference:'Em conferência',conference_completed:'Conferência concluída',cancelled:'Cancelado'}[s]||s);
  const pullStatus=s=>({pending:'Aguardando Puxada',in_progress:'Em cruzamento',matched:'Sem divergência',divergent:'Com divergência'}[s]||s);
  const isAdmin=()=>window.state?.user?.role==='admin';
  async function ensureXlsx(){
    if(window.XLSX)return window.XLSX;if(xlsxPromise)return xlsxPromise;
    xlsxPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.async=true;s.onload=()=>resolve(window.XLSX);s.onerror=()=>{xlsxPromise=null;reject(new Error('Não foi possível carregar o leitor de Excel.'));};document.head.appendChild(s)});return xlsxPromise
  }
  function normHeader(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase()}
  function normDocClient(v){return String(v??'').replace(/\D/g,'').replace(/^0+/,'')||'0'}
  function qty020501(v){
    if(typeof v==='number')return v;let s=String(v??'').trim().replace(/\s/g,'');if(!s)return 0;
    if(s.includes('/')){const p=s.split('/');const a=Number(String(p[0]).replace(/\./g,'').replace(',','.'))||0,b=Number(String(p[1]).replace(/\D/g,''))||0;return a+b/Math.pow(10,String(p[1]).replace(/\D/g,'').length||2)}
    s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0
  }
  function excelDate020501(v,XLSX){
    if(typeof v==='number'){const p=XLSX.SSF.parse_date_code(v);if(p)return String(p.y).padStart(4,'0')+'-'+String(p.m).padStart(2,'0')+'-'+String(p.d).padStart(2,'0')}
    const s=String(v??'').trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){const [d,m,y]=s.split('/');return y+'-'+m+'-'+d}if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);return null
  }
  async function import020501File(file){
    const XLSX=await ensureXlsx(),buf=await file.arrayBuffer(),book=XLSX.read(buf,{type:'array',cellDates:false}),ws=book.Sheets[book.SheetNames[0]];
    const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});if(data.length<2)throw new Error('O relatório está vazio.');
    const heads=(data[0]||[]).map(normHeader),idx={};heads.forEach((h,i)=>idx[h]=i);
    const required=['FORNEC','DOCUM','ITEM','DESCRICAO','UNIDADE','CODIGO OPERACAO','QTDE ENTRADA'];
    for(const h of required)if(idx[h]==null)throw new Error('Coluna "'+h+'" não encontrada no 02.05.01.');
    const agg=new Map(),rawRows=data.length-1;
    for(let r=1;r<data.length;r++){
      const row=data[r];if(!row||row.every(x=>x==null||x===''))continue;
      const supplier=normDocClient(row[idx['FORNEC']]),invoice=normDocClient(row[idx['DOCUM']]),sku=normDocClient(row[idx['ITEM']]);if(!supplier||supplier==='0'||!invoice||invoice==='0'||!sku||sku==='0')continue;
      const key=supplier+'|'+invoice+'|'+sku,old=agg.get(key)||{supplier_code:supplier,invoice_number:invoice,sku_code:sku,sku_name:String(row[idx['DESCRICAO']]||'').trim(),report_unit:String(row[idx['UNIDADE']]||'').trim(),system_qty:0,ops:new Set(),report_date:null};
      old.system_qty+=qty020501(row[idx['QTDE ENTRADA']]);const op=row[idx['CODIGO OPERACAO']];if(op!=null&&op!=='')old.ops.add(String(op).trim());
      if(idx['DATA']!=null&&!old.report_date)old.report_date=excelDate020501(row[idx['DATA']],XLSX);agg.set(key,old)
    }
    const rows=[...agg.values()].map(x=>({supplier_code:x.supplier_code,invoice_number:x.invoice_number,sku_code:x.sku_code,sku_name:x.sku_name,report_unit:x.report_unit,system_qty:Math.round(x.system_qty*1000)/1000,operation_codes:[...x.ops].sort().join('+'),report_date:x.report_date}));
    if(!rows.length)throw new Error('Nenhuma linha válida encontrada no 02.05.01.');
    const res=await call('system_020501_import',{source_file:file.name,raw_rows:rawRows,rows});return res.import
  }
  async function load020501Status(){
    try{const d=await call('system_020501_status'),s=d.status,last=s.last_import;if(!$('pullImportStatus'))return;
      $('pullImportStatus').innerHTML=last?'<strong>Base pronta</strong><span>'+esc(String(last.documents||0))+' NF(s) · '+esc(String(last.aggregated_rows||0))+' combinações · '+esc(dtAgent(last.imported_at))+'</span>':'<strong>Base pendente</strong><span>Importe o 02.05.01 para liberar o cruzamento.</span>';
    }catch(e){if($('pullImportStatus'))$('pullImportStatus').innerHTML='<strong>Base indisponível</strong><span>'+esc(e.message)+'</span>'}
  }

  function dtAgent(v){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
  async function loadAgentStatus(){
    if(!$('pullAgentStatus'))return;
    try{
      const d=await call('agent_status'),a=d.agent||{},nodes=a.nodes||[],ready=nodes.filter(x=>x.online&&x.calibration_ready),sync=nodes.find(x=>x.status==='syncing'&&x.online);
      let title='Offline',detail='Nenhum computador disponível.';
      if(!a.token_ready){title='Não instalado';detail='Configure o agente na Administração.'}
      else if(sync){title='Sincronizando';detail=(sync.display_name||'Computador')+(sync.hostname?' · '+sync.hostname:'')+' · '+(a.last_sync_from||'—')+' → '+(a.last_sync_to||'—')}
      else if(ready.length){title='Online';detail=ready.map(x=>(x.display_name||'Computador').replace(/^Computador\s+/i,'')+(x.hostname?' · '+x.hostname:'')).join('  •  ')+' · sync '+dtAgent(a.last_sync_completed_at)}
      else if(nodes.some(x=>x.token_ready&&!x.calibration_ready)){title='Aguardando Promax';detail=nodes.filter(x=>x.token_ready&&!x.calibration_ready).map(x=>(x.display_name||'Computador').replace(/^Computador\s+/i,'')).join(' • ')}
      else if(a.status==='error'){title='Indisponível';detail=a.last_error||'Nova tentativa automática em breve.'}
      $('pullAgentStatus').innerHTML='<strong>'+esc(title)+'</strong><span>'+esc(detail)+'</span>';
      $('pullAgentStatus').className='agent-'+(a.status||'offline')+(a.online?' online':'');
      if($('pullAgentSync')){$('pullAgentSync').disabled=!a.token_ready;$('pullAgentSync').textContent=a.status==='syncing'?'Sincronizando...':'Sincronizar agora'}
    }catch(e){$('pullAgentStatus').innerHTML='<strong>Agente indisponível</strong><span>'+esc(e.message)+'</span>'}
  }
  async function requestAgentSync(){
    const b=$('pullAgentSync');try{b.disabled=true;b.textContent='Solicitando...';const d=await call('agent_request_sync');showToast(d.already_pending?'Já existe uma sincronização pendente.':'Sincronização solicitada.');await loadAgentStatus()}catch(e){showToast(e.message,true)}finally{if(b){b.disabled=false;b.textContent='Sincronizar agora'}}
  }
  function ensureDialogs(root){
    root.insertAdjacentHTML('beforeend',
      '<dialog id="rxpReceiptDialog" class="rxp-dialog"><div class="rxp-dialog-inner"><div class="rxp-dialog-head"><div><p class="eyebrow">PORTARIA / RECEBIMENTO</p><h2 id="rxpReceiptDialogTitle"></h2></div><button class="rxp-close" id="rxpReceiptClose">×</button></div><div id="rxpReceiptDialogBody"></div></div></dialog>'+
      '<dialog id="rxpDetailDialog" class="rxp-dialog wide"><div class="rxp-dialog-inner"><div class="rxp-dialog-head"><div><p class="eyebrow">RECEBIMENTO / NRI</p><h2 id="rxpDetailTitle"></h2></div><button class="rxp-close" id="rxpDetailClose">×</button></div><div id="rxpDetailBody"></div></div></dialog>'+
      '<dialog id="rxpPrintDialog" class="rxp-dialog wide"><div class="rxp-dialog-inner"><div class="rxp-dialog-head"><div><p class="eyebrow">NRIs LIBERADAS</p><h2 id="rxpPrintTitle"></h2></div><button class="rxp-close" id="rxpPrintClose">×</button></div><div class="rxp-dialog-actions" style="margin-top:0;margin-bottom:10px"><button class="rxp-btn" id="rxpPrintSecond">Imprimir 2ª via</button><button class="rxp-btn primary" id="rxpPrintOriginal">Imprimir NRIs</button></div><div id="rxpPrintBody"></div></div></dialog>'+
      '<dialog id="rxpPullDialog" class="rxp-dialog wide"><div class="rxp-dialog-inner"><div class="rxp-dialog-head"><div><p class="eyebrow">PUXADA · FÍSICO × SISTEMA</p><h2 id="rxpPullTitle"></h2></div><button class="rxp-close" id="rxpPullClose">×</button></div><div id="rxpPullBody"></div></div></dialog>'+
      '<dialog id="rxpAuthDialog" class="rxp-dialog auth"><div class="rxp-dialog-inner"><div class="rxp-dialog-head"><div><p class="eyebrow">AUTORIZAÇÃO DE IMPRESSÃO</p><h2>Confirmar conferente</h2></div><button class="rxp-close" id="rxpAuthClose">×</button></div><p class="rxp-note">A NRI só pode ser impressa pelo conferente responsável pela conferência.</p><form id="rxpAuthForm"><div class="rxp-form-grid" style="grid-template-columns:1fr 1fr"><label>Conferente<select id="rxpAuthConf" required><option value="">Carregando...</option></select></label><label>PIN<input id="rxpAuthPin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required placeholder="4 dígitos"></label></div><p class="form-error" id="rxpAuthError"></p><div class="rxp-dialog-actions"><button type="button" class="rxp-btn" id="rxpAuthCancel">Cancelar</button><button type="submit" class="rxp-btn primary">Autorizar impressão</button></div></form></div></dialog>'
    );
    $('rxpReceiptClose').onclick=()=>$('rxpReceiptDialog').close();$('rxpDetailClose').onclick=()=>$('rxpDetailDialog').close();$('rxpPrintClose').onclick=()=>$('rxpPrintDialog').close();$('rxpPullClose').onclick=()=>$('rxpPullDialog').close();$('rxpAuthClose').onclick=()=>$('rxpAuthDialog').close();$('rxpAuthCancel').onclick=()=>$('rxpAuthDialog').close();
  }
  function shell(which){
    if(which==='nri')return '<div class="rxp-shell">'+
      '<section class="rxp-kpis">'+
        '<article class="rxp-kpi"><span>Aguardando empilhador</span><strong id="rxpUnloadWait">—</strong></article>'+
        '<article class="rxp-kpi"><span>Descarga iniciada</span><strong id="rxpUnload">—</strong></article>'+
        '<article class="rxp-kpi"><span>Em conferência</span><strong id="rxpIn">—</strong></article>'+
        '<article class="rxp-kpi print-queue" id="rxpPrintPendingCard"><span>Aguardando impressão</span><strong id="rxpPrintPending">—</strong></article>'+
        '<article class="rxp-kpi"><span>Conferências concluídas</span><strong id="rxpDone">—</strong></article>'+
      '</section>'+
      '<section class="rxp-panel"><div class="rxp-toolbar">'+
        '<label class="grow">Buscar<input id="rxpSearch" placeholder="Carreta, fábrica, carreteiro, placa, NF ou produto"></label>'+
        '<label>Status<select id="rxpStatus"><option value="all">Todos</option><option value="awaiting_conference">Aguardando</option><option value="in_conference">Em conferência</option><option value="conference_completed">Concluída</option></select></label>'+
        '<label>Impressão<select id="rxpPrintFilter"><option value="all">Todas</option><option value="pending_print">Fila de impressão</option><option value="printed">Já impressas</option></select></label>'+
        '<button class="rxp-btn" id="rxpOpenConf">Abrir tela do conferente</button><button class="rxp-btn" id="rxpRefresh">Atualizar</button><button class="rxp-btn primary" id="rxpNew">+ Nova carreta</button>'+
      '</div>'+
      '<div class="rxp-note"><strong>Fila de impressão:</strong> após o conferente finalizar no celular, as NRIs ficam aqui aguardando impressão no computador da sala. A impressão exige novamente o PIN do conferente responsável.</div>'+
      '<div class="rxp-table-wrap"><table class="rxp-table"><thead><tr><th>Recebimento</th><th>Chegada</th><th>Placa</th><th>NF / Pedido</th><th>Status</th><th>Portaria</th><th>Conferente</th><th>Folhas NRI</th><th>Ações</th></tr></thead><tbody id="rxpBody"></tbody></table></div><div class="rxp-empty hidden" id="rxpEmpty">Nenhum recebimento encontrado.</div></section></div>';
    return '<div class="rxp-shell rxp-pull-shell">'+
      '<section class="rxp-kpis rxp-pull-kpis">'+
        '<article class="rxp-kpi"><span>Aguardando</span><strong id="pullPending">—</strong></article>'+
        '<article class="rxp-kpi"><span>Sem divergência</span><strong id="pullMatched">—</strong></article>'+
        '<article class="rxp-kpi"><span>Com divergência</span><strong id="pullDivergent">—</strong></article>'+
      '</section>'+
      '<section class="rxp-panel rxp-pull-panel">'+
        '<div class="rxp-pull-ops">'+
          '<div class="rxp-pull-status"><span class="rxp-pull-label">PROMAX</span><div id="pullAgentStatus"><strong>Consultando...</strong><span></span></div></div>'+
          '<div class="rxp-pull-divider"></div>'+
          '<div class="rxp-pull-status"><span class="rxp-pull-label">BASE 02.05.01</span><div id="pullImportStatus"><strong>Consultando...</strong><span></span></div></div>'+
          '<div class="rxp-pull-actions"><input id="pullImportFile" type="file" accept=".xlsx,.xls" class="hidden"><button class="rxp-btn" id="pullImportButton">Importar manual</button><button class="rxp-btn primary" id="pullAgentSync">Sincronizar agora</button></div>'+
        '</div>'+
        '<details class="rxp-pull-help"><summary>Como funciona o cruzamento?</summary><p>O sistema encontra a NF, soma compra e bonificação do mesmo produto e converte a quantidade do 02.05.01 em paletes usando o cadastro 01.11. Para fábricas sem código conhecido, a busca usa somente a NF.</p></details>'+
        '<div class="rxp-toolbar rxp-pull-toolbar"><label class="grow"><span>Buscar</span><input id="pullSearch" placeholder="Carreta, fábrica, carreteiro, código ou produto"></label><label><span>Status</span><select id="pullStatus"><option value="all">Todos</option><option value="pending">Aguardando</option><option value="in_progress">Em cruzamento</option><option value="matched">Sem divergência</option><option value="divergent">Com divergência</option></select></label><button class="rxp-btn rxp-refresh-btn" id="pullRefresh">Atualizar</button></div>'+
        '<div class="rxp-table-wrap"><table class="rxp-table"><thead><tr><th>Recebimento</th><th>Conferido em</th><th>Conferente</th><th>Itens</th><th>Status Puxada</th><th>Ação</th></tr></thead><tbody id="pullBody"></tbody></table></div><div class="rxp-empty hidden" id="pullEmpty">Nenhuma conferência concluída.</div>'+
      '</section></div>';
  }
  async function open(which='nri'){
    mode=which;const root=$(which==='nri'?'receivingNriView':'pullCompareView');document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));root.classList.remove('hidden');document.querySelector('[data-view="'+(which==='nri'?'receiving-nri':'pull-compare')+'"]')?.classList.add('active');document.querySelector(which==='nri'?'.receiving-nav-group':'.pull-nav-group')?.classList.add('open');$('sidebar')?.classList.remove('open');
    $('pageTitle').textContent=which==='nri'?'Recebimento / NRI':'Puxada · Físico × Sistema';$('pageSubtitle').textContent=which==='nri'?'Da entrada da carreta à identificação dos paletes.':'Cruzamento do físico conferido às cegas com a quantidade do sistema.';
    root.innerHTML=shell(which);ensureDialogs(root);
    if(which==='nri'){let t;$('rxpSearch').oninput=()=>{clearTimeout(t);t=setTimeout(loadNri,250)};$('rxpStatus').onchange=loadNri;$('rxpPrintFilter').onchange=loadNri;$('rxpRefresh').onclick=loadNri;$('rxpNew').onclick=()=>openReceiptForm();$('rxpOpenConf').onclick=()=>window.open(CONF_URL,'_blank','noopener,noreferrer');$('rxpPrintPendingCard').onclick=()=>{$('rxpStatus').value='conference_completed';$('rxpPrintFilter').value='pending_print';loadNri()};await loadNri()}
    else{let t;$('pullSearch').oninput=()=>{clearTimeout(t);t=setTimeout(loadPull,250)};$('pullStatus').onchange=loadPull;$('pullRefresh').onclick=async()=>{await Promise.all([loadAgentStatus(),load020501Status()]);await loadPull()};$('pullAgentSync').onclick=requestAgentSync;$('pullImportButton').onclick=()=>$('pullImportFile').click();$('pullImportFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const b=$('pullImportButton');try{b.disabled=true;b.textContent='Importando...';const x=await import020501File(file);showToast('02.05.01 importado: '+x.documents+' NF(s), '+x.aggregated_rows+' produtos consolidados.');await load020501Status();await loadPull()}catch(err){showToast(err.message,true)}finally{b.disabled=false;b.textContent='Importar manual';e.target.value=''}};await Promise.all([loadAgentStatus(),load020501Status()]);await loadPull()}
  }
  async function loadNri(){
    try{
      const d=await call('list_receipts',{status:$('rxpStatus').value,search:$('rxpSearch').value});
      receipts=d.receipts||[];
      $('rxpUnloadWait').textContent=d.counts.awaiting_unload||0;
      $('rxpUnload').textContent=d.counts.unloading||0;
      $('rxpIn').textContent=d.counts.in_conference||0;
      $('rxpPrintPending').textContent=d.counts.print_pending||0;
      $('rxpDone').textContent=d.counts.conference_completed||0;
      const pf=$('rxpPrintFilter').value;
      const visible=receipts.filter(r=>pf==='all'||r.print_status===pf);
      $('rxpBody').innerHTML=visible.map(r=>{
        const printLabel=r.print_status==='pending_print'?'Aguardando impressão':r.print_status==='printed'?'Impresso':'—';
        const printClass=r.print_status==='pending_print'?'pending':r.print_status==='printed'?'good':'';
        const action=r.status==='conference_completed'
          ?'<button class="rxp-btn primary" data-print="'+r.id+'">'+(r.print_status==='printed'?'NRIs / 2ª via':'Imprimir NRIs')+'</button>'
          :'';
        return '<tr><td><strong>'+esc(r.display_name)+'</strong><br><small>'+esc(r.receipt_code)+'</small></td>'+
          '<td>'+fd(r.arrival_date)+'<br><small>'+esc(String(r.arrival_time||'').slice(0,5))+'</small></td>'+
          '<td>'+esc(r.plate||'—')+'</td>'+
          '<td>'+esc(r.nf_imperio||r.nf_ambev||'—')+'<br><small>Pedido '+esc(r.order_number||'—')+'</small></td>'+
          '<td>'+(()=>{let txt=receiptStatus(r.status),cls=r.status;if(r.status==='awaiting_conference'){if(r.unload_status==='pending'){txt='Aguardando empilhador';cls='pending'}else if(r.unload_status==='in_progress'){txt='Descarga iniciada';cls='in_progress'}else{txt='Liberada à conferência';cls='matched'}}return '<span class="rxp-status '+cls+'">'+txt+'</span><br><small>'+(r.unload_operator?.display_name?'Empilhador '+esc(r.unload_operator.display_name):'')+'</small><br><small class="'+printClass+'">'+printLabel+'</small>'})()+'</td>'+
          '<td>'+esc(r.gate_creator?.display_name||'—')+'</td>'+
          '<td>'+esc(r.conferencer?.display_name||'—')+'</td>'+
          '<td><strong>'+n(r.nri_count||0)+'</strong><br><small>P: 1 folha/palete · CX: 1 folha/código</small></td>'+
          '<td><div class="rxp-row-actions"><button class="rxp-btn" data-detail="'+r.id+'">Visualizar</button> '+action+(isAdmin()?'<button class="rxp-btn trash" data-delete-receipt="'+r.id+'" title="Excluir recebimento" aria-label="Excluir recebimento">🗑</button>':'')+'</div></td></tr>';
      }).join('');
      $('rxpEmpty').classList.toggle('hidden',visible.length>0);
      $('rxpBody').querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>detail(Number(b.dataset.detail)));
      $('rxpBody').querySelectorAll('[data-print]').forEach(b=>b.onclick=()=>previewNri(Number(b.dataset.print)));
      $('rxpBody').querySelectorAll('[data-delete-receipt]').forEach(b=>b.onclick=()=>deleteReceiptAdmin(Number(b.dataset.deleteReceipt)));
    }catch(e){showToast(e.message,true)}
  }
  async function deleteReceiptAdmin(id){
    const r=receipts.find(x=>Number(x.id)===Number(id));if(!r)return;
    if(!confirm('Excluir definitivamente '+(r.display_name||r.receipt_code)+'?\n\nIsso removerá o registro da Portaria, a conferência/NRI, impressões e o vínculo da Puxada. Use somente para apagar testes.'))return;
    try{await call('admin_delete_receipt',{id});showToast('Recebimento de teste excluído.');await loadNri();}catch(e){showToast(e.message,true)}
  }

  async function loadPull(){
    try{const d=await call('list_receipts',{status:'conference_completed',pull_status:$('pullStatus').value,search:$('pullSearch').value});receipts=d.receipts||[];$('pullPending').textContent=d.counts.pull_pending||0;$('pullMatched').textContent=d.counts.pull_matched||0;$('pullDivergent').textContent=d.counts.pull_divergent||0;$('pullBody').innerHTML=receipts.map(r=>'<tr><td><strong>'+esc(r.display_name)+'</strong><br><small>'+esc(r.receipt_code)+'</small></td><td>'+fd(r.conference_completed_at)+'<br><small>'+esc(String(r.conference_completed_at||'').slice(11,16))+'</small></td><td>'+esc(r.conferencer?.display_name||'—')+'</td><td>'+((r.items||[]).length)+'</td><td><span class="rxp-status '+r.pull_status+'">'+pullStatus(r.pull_status)+'</span></td><td><button class="rxp-btn primary" data-pull="'+r.id+'">Ver cruzamento</button></td></tr>').join('');$('pullEmpty').classList.toggle('hidden',receipts.length>0);$('pullBody').querySelectorAll('[data-pull]').forEach(b=>b.onclick=()=>openPull(Number(b.dataset.pull)))}catch(e){showToast(e.message,true)}
  }
  function nowDate(){return new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'})}function nowTime(){return new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}
  function openReceiptForm(r=null){
    const TRUCK_PLATES={'246':'LSZ-9355','271':'LMZ-4G31','229':'KYI-8259','160':'KZJ-4694','231':'LSN-7312','264':'KZM-9D84','203':'LRN-7589','225':'LSE-4160','210':'LRW-5314','289':'RIX-8E72','298':'RKK-8G53','312':'TTZ5E13','MKTP':'MKTP'};
    const truckOptions=['246','271','229','160','231','264','203','225','210','289','298','312','MKTP'].map(x=>'<option '+(String(r?.truck_number||'')===x?'selected ':'')+'value="'+x+'">'+x+'</option>').join('');
    const factoryOptions=['NOVA RIO','MACACU','PIRAI','JPA','MKP'].map(x=>'<option '+(String(r?.factory_name||'')===x?'selected ':'')+'value="'+x+'">'+x+'</option>').join('');
    const driverOptions=['COELHO','RONALDO','MESSIAS','ANDERSON','RODRIGO','KAYQUE','DEIVID','NETO','V.HUGO','MKP'].map(x=>'<option '+(String(r?.driver_name||'')===x?'selected ':'')+'value="'+x+'">'+x+'</option>').join('');
    selected=r;$('rxpReceiptDialogTitle').textContent=r?'Editar '+r.display_name:'Nova carreta';
    $('rxpReceiptDialogBody').innerHTML='<form id="rxpReceiptForm"><div class="rxp-form-grid">'+
      '<label>Número da carreta<select id="rrTruck" required><option value="">Selecione...</option>'+truckOptions+'</select></label>'+
      '<label>Placa<input id="rrPlate" readonly value="'+esc(r?.plate||'')+'"></label>'+
      '<label>Fábrica<select id="rrFactory" required><option value="">Selecione...</option>'+factoryOptions+'</select></label>'+
      '<label>Carreteiro / motorista<select id="rrDriver" required><option value="">Selecione...</option>'+driverOptions+'</select></label>'+
      '<label>Data chegada<input id="rrDate" type="date" required value="'+esc(r?.arrival_date||nowDate())+'"></label>'+
      '<label>Hora chegada<input id="rrTime" type="time" required value="'+esc(String(r?.arrival_time||nowTime()).slice(0,5))+'"></label>'+
      '<label>NF Império<input id="rrNfImp" value="'+esc(r?.nf_imperio||'')+'"></label>'+
      '<label>NF Ambev<input id="rrNfAmbev" value="'+esc(r?.nf_ambev||'')+'"></label>'+
      '<label>Nº Mapa<input id="rrMap" value="'+esc(r?.map_number||'')+'"></label>'+
      '<label>Nº Pedido<input id="rrOrder" value="'+esc(r?.order_number||'')+'"></label>'+
      '</div><p class="form-error" id="rrError"></p><div class="rxp-dialog-actions"><button type="button" class="rxp-btn" id="rrCancel">Cancelar</button><button type="submit" class="rxp-btn primary">Salvar recebimento</button></div></form>';
    const sync=()=>{$('rrPlate').value=TRUCK_PLATES[$('rrTruck').value]||'';};
    $('rrTruck').addEventListener('change',sync);sync();
    $('rrCancel').onclick=()=>$('rxpReceiptDialog').close();$('rxpReceiptForm').onsubmit=saveReceipt;$('rxpReceiptDialog').showModal()
  }
  async function saveReceipt(e){e.preventDefault();const receipt={truck_number:$('rrTruck').value,factory_name:$('rrFactory').value,driver_name:$('rrDriver').value,arrival_date:$('rrDate').value,arrival_time:$('rrTime').value,plate:$('rrPlate').value,nf_imperio:$('rrNfImp').value,nf_ambev:$('rrNfAmbev').value,map_number:$('rrMap').value,order_number:$('rrOrder').value};try{selected?await call('update_receipt',{id:selected.id,receipt}):await call('create_receipt',{receipt});$('rxpReceiptDialog').close();showToast('Recebimento salvo.');await loadNri()}catch(err){$('rrError').textContent=err.message}}

  async function detail(id){try{const d=await call('receipt_detail',{id});const r=d.receipt;selected=r;$('rxpDetailTitle').textContent=r.display_name;$('rxpDetailBody').innerHTML='<div class="rxp-detail-top"><div class="rxp-detail-card"><span>Recebimento</span><strong>'+esc(r.receipt_code)+'</strong></div><div class="rxp-detail-card"><span>Status</span><strong>'+receiptStatus(r.status)+'</strong></div><div class="rxp-detail-card"><span>NF / Pedido</span><strong>'+esc(r.nf_imperio||r.nf_ambev||'—')+' / '+esc(r.order_number||'—')+'</strong></div><div class="rxp-detail-card"><span>Placa</span><strong>'+esc(r.plate||'—')+'</strong></div><div class="rxp-detail-card"><span>Conferente</span><strong>'+esc(r.conferencer?.display_name||'—')+'</strong></div><div class="rxp-detail-card"><span>Puxada</span><strong>'+pullStatus(r.pull_status)+'</strong></div></div>'+((r.items||[]).length?'<table class="rxp-items-table"><thead><tr><th>NRI</th><th>Código</th><th>Produto</th><th>Unidade</th><th>Quantidade</th><th>Validade</th><th>Curva</th><th>Status</th></tr></thead><tbody>'+r.items.sort((a,b)=>a.line_no-b.line_no).map(x=>'<tr><td>'+((x.unit_text||'P')==='P'?String(x.nri_number).padStart(6,'0'):'—')+'</td><td>'+esc(x.sku_code)+'</td><td>'+esc(x.sku_name)+'</td><td>'+esc(x.unit_text||'P')+'</td><td>'+n(x.physical_qty)+'</td><td>'+fd(x.expiry_date)+'</td><td>'+esc(x.curve_class||'—')+'</td><td class="'+(x.shelf_life_status==='OK'?'rxp-ok':'rxp-nok')+'">'+esc(x.shelf_life_status||'—')+'</td></tr>').join('')+'</tbody></table>':'<div class="rxp-empty">A conferência física ainda não possui produtos.</div>')+'<div class="rxp-dialog-actions">'+(r.status!=='conference_completed'?'<button class="rxp-btn" id="rxpEditReceipt">Editar Portaria</button>':'')+(r.status==='conference_completed'?'<button class="rxp-btn primary" id="rxpDetailNri">Visualizar NRIs</button>':'')+'</div>';if($('rxpEditReceipt'))$('rxpEditReceipt').onclick=()=>{$('rxpDetailDialog').close();openReceiptForm(r)};if($('rxpDetailNri'))$('rxpDetailNri').onclick=()=>{$('rxpDetailDialog').close();previewNri(r.id)};$('rxpDetailDialog').showModal()}catch(e){showToast(e.message,true)}}
  function nriSheetCount(x){return (x?.unit_text||'P')==='P'?Number(x.physical_qty||x.pallet_count||0):1}
  function label(x,r,second=false){
    const hour=ft(r.conference_completed_at||r.arrival_time);
    return '<article class="nri-label nri-excel">'+
      '<div class="nri-x-vcode">'+esc(x.sku_code)+'</div>'+
      '<div class="nri-x-code">'+esc(x.sku_code)+'</div>'+
      '<div class="nri-x-desc">'+esc(x.sku_name)+'</div>'+
      '<div class="nri-x-gap nri-x-gap1"></div>'+
      '<div class="nri-x-curve-label">CURVA</div>'+
      '<div class="nri-x-curve-value">'+esc(x.curve_class||'-')+'</div>'+
      '<div class="nri-x-exp-label">VENCIMENTO:</div>'+
      '<div class="nri-x-exp-value">'+fd(x.expiry_date)+(second?'<b class="nri-x-copy">2° Via</b>':'')+'</div>'+
      '<div class="nri-x-gap nri-x-gap2"></div>'+
      '<div class="nri-x-date nri-x-date-left"><span>Recebimento:</span><strong>'+fd(r.arrival_date)+'</strong></div>'+
      '<div class="nri-x-date nri-x-date-right"><span>Carregar Até:</span><strong>'+fd(x.load_until_date)+'</strong></div>'+
      '<div class="nri-x-gap nri-x-gap3"></div>'+
      '<div class="nri-x-meta-head nri-x-m1">ID</div><div class="nri-x-meta-head nri-x-m2">CONFERENTE</div><div class="nri-x-meta-head nri-x-m3">PLACA</div><div class="nri-x-meta-head nri-x-m4">HORA</div><div class="nri-x-meta-head nri-x-m5">QTD PALETE</div><div class="nri-x-meta-head nri-x-m6">QTD LASTRO</div><div class="nri-x-meta-head nri-x-m7">ORIGEM</div><div class="nri-x-meta-head nri-x-m8">MOTORISTA</div>'+
      '<div class="nri-x-meta-val nri-x-v1"><strong>'+String(x.nri_number).padStart(6,'0')+'</strong></div><div class="nri-x-meta-val nri-x-v2">'+esc(r.conferencer?.display_name||'—')+'</div><div class="nri-x-meta-val nri-x-v3">'+esc(r.plate||'—')+'</div><div class="nri-x-meta-val nri-x-v4">'+esc(hour)+'</div><div class="nri-x-meta-val nri-x-v5">'+n(x.pallet_capacity)+'</div><div class="nri-x-meta-val nri-x-v6">'+n(x.layer_qty)+'</div><div class="nri-x-meta-val nri-x-v7">'+esc(r.factory_name)+'</div><div class="nri-x-meta-val nri-x-v8">'+esc(r.driver_name)+'</div>'+
      '<div class="nri-x-bottom"></div>'+
    '</article>'
  }
  function buildNriPages(second,preview=false){
    const pages=[];
    for(const item of selected.items||[]){
      const sheets=nriSheetCount(item);
      for(let sheet=0;sheet<sheets;sheet++){
        const one=label(item,selected,second);
        pages.push((preview?'<div class="nri-page-preview">':'<section class="print-page">')+
          '<div class="nri-print-slot">'+one+'</div><div class="nri-print-gap"></div>'+
          '<div class="nri-print-slot">'+one+'</div><div class="nri-print-gap"></div>'+
          '<div class="nri-print-slot">'+one+'</div>'+
          (preview?'</div>':'</section>'));
      }
    }
    return pages;
  }
  async function previewNri(id){try{
    const [d,h]=await Promise.all([call('receipt_detail',{id}),call('print_history',{id})]);selected=d.receipt;
    if(selected.status!=='conference_completed')return showToast('As NRIs só são liberadas após a conferência autenticada.',true);
    const sheets=(selected.items||[]).reduce((s,x)=>s+nriSheetCount(x),0);
    if(!sheets)return showToast('Este recebimento não possui produtos para gerar NRI.',true);
    const hasOriginal=(h.logs||[]).some(x=>x.print_type==='original');$('rxpPrintTitle').textContent=selected.display_name;renderLabels(false);
    $('rxpPrintOriginal').disabled=hasOriginal;$('rxpPrintOriginal').textContent=hasOriginal?'Original já impresso':'Imprimir NRIs';
    $('rxpPrintSecond').disabled=!hasOriginal;$('rxpPrintSecond').title=hasOriginal?'Gerar reimpressão registrada como 2ª via':'A 2ª via é liberada após a impressão original';
    $('rxpPrintOriginal').onclick=()=>printNri(false);$('rxpPrintSecond').onclick=()=>printNri(true);$('rxpPrintDialog').showModal()
  }catch(e){showToast(e.message,true)}}
  function renderLabels(second){
    const pages=buildNriPages(second,true),sheets=pages.length;
    $('rxpPrintBody').innerHTML='<div class="rxp-note"><strong>'+sheets+' folha(s)</strong> · Palete: 1 folha por palete · Caixa: 1 folha por código/produto · cada folha contém 3 NRIs idênticas · padrão da planilha NRI (A1:I11, escala 94%).</div><div class="nri-preview-wrap">'+pages.join('')+'</div>'
  }
  async function authorizePrint(){
    try{
      const d=await boCall('conferencers');
      $('rxpAuthConf').innerHTML='<option value="">Selecione...</option>'+(d.conferencers||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.display_name)+'</option>').join('');
      const expected=selected?.conference_by||'';if(expected)$('rxpAuthConf').value=expected;
    }catch(e){$('rxpAuthError').textContent=e.message}
    $('rxpAuthPin').value='';$('rxpAuthError').textContent='';
    return await new Promise(resolve=>{
      let settled=false;const finish=v=>{if(settled)return;settled=true;resolve(v)};
      $('rxpAuthDialog').onclose=()=>finish(null);
      $('rxpAuthForm').onsubmit=async e=>{e.preventDefault();$('rxpAuthError').textContent='';try{const d=await boCall('pin_login',{conferencer_id:$('rxpAuthConf').value,pin:$('rxpAuthPin').value});$('rxpAuthDialog').close();finish(d.token)}catch(err){$('rxpAuthError').textContent=err.message}};
      $('rxpAuthDialog').showModal();
    });
  }
  async function printNri(second){
    const confToken=await authorizePrint();if(!confToken)return;
    const pages=buildNriPages(second,false);if(!pages.length)return showToast('Este recebimento não possui produtos para gerar NRI.',true);
    const printItems=(selected.items||[]).map(x=>({item_id:x.id,copies:nriSheetCount(x)}));
    try{await confCall('conference_log_print',{id:selected.id,print_type:second?'second_copy':'original',items:printItems},confToken)}catch(e){return showToast(e.message,true)}
    const iframe=document.createElement('iframe');iframe.style.position='fixed';iframe.style.right='0';iframe.style.bottom='0';iframe.style.width='1px';iframe.style.height='1px';iframe.style.border='0';iframe.style.opacity='0';document.body.appendChild(iframe);
    const printCss='@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Calibri,Arial,sans-serif}.print-page{width:210mm;height:297mm;position:relative;padding-left:10.8pt;padding-top:57.6pt;page-break-after:always;overflow:hidden}.print-page:last-child{page-break-after:auto}.nri-print-slot{width:528.75pt;height:236.175pt;position:relative;overflow:visible}.nri-print-gap{height:21.15pt}.nri-label{width:562.5pt;height:251.25pt;display:grid;grid-template-columns:67.5pt 75pt repeat(7,60pt);grid-template-rows:30pt 37.5pt 3.75pt 18.75pt 82.5pt 3.75pt 30pt 3.75pt 18.75pt 18.75pt 3.75pt;transform:scale(.94);transform-origin:top left;font-family:Calibri,Arial,sans-serif;color:#000;line-height:1;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact}.nri-x-vcode{grid-column:1;grid-row:1/12;display:flex;align-items:center;justify-content:center;font-size:72pt;font-weight:700;transform:rotate(-90deg);white-space:nowrap}.nri-x-code{grid-column:2/4;grid-row:1/3;display:flex;align-items:center;justify-content:center;font-size:48pt;font-weight:700;border-left:1pt solid #000;border-top:1pt solid #000;border-right:1pt solid #000;border-bottom:1pt solid #000}.nri-x-desc{grid-column:4/10;grid-row:1/3;display:flex;align-items:center;justify-content:center;text-align:center;font-size:22pt;font-weight:700;text-decoration:underline;padding:0 3pt;border-top:1pt solid #000;border-right:1pt solid #000;border-bottom:1pt solid #000;overflow:hidden}.nri-x-gap{grid-column:2/10;border-left:1pt solid #000;border-right:1pt solid #000}.nri-x-gap1{grid-row:3}.nri-x-gap2{grid-row:6}.nri-x-gap3{grid-row:8}.nri-x-curve-label{grid-column:2;grid-row:4;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-size:18pt;font-weight:700;border-left:1pt solid #000;border-top:1pt solid #000;border-right:1pt solid #000}.nri-x-curve-value{grid-column:2;grid-row:5;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-size:72pt;font-weight:700;border-left:1pt solid #000;border-right:1pt solid #000;border-bottom:1pt solid #000}.nri-x-exp-label{grid-column:3/10;grid-row:4;display:flex;align-items:center;justify-content:center;font-size:18pt;font-weight:700;border-top:1pt solid #000;border-right:1pt solid #000}.nri-x-exp-value{grid-column:3/10;grid-row:5;position:relative;display:flex;align-items:center;justify-content:center;font-size:78pt;font-weight:700;border-right:1pt solid #000;border-bottom:1pt solid #000;white-space:nowrap}.nri-x-copy{position:absolute;right:8pt;top:5pt;font-size:20pt}.nri-x-date{grid-row:7;display:flex;align-items:center;justify-content:center;gap:8pt;font-size:18pt;font-weight:700;border-top:1pt solid #000;border-bottom:1pt solid #000}.nri-x-date strong{font-size:20pt;font-weight:700;text-decoration:underline}.nri-x-date-left{grid-column:2/6;border-left:1pt solid #000;border-right:1pt solid #000}.nri-x-date-right{grid-column:6/10;border-right:1pt solid #000}.nri-x-meta-head{grid-row:9;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10pt;font-weight:700}.nri-x-meta-val{grid-row:10;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10pt;font-weight:400;white-space:nowrap;overflow:hidden}.nri-x-v1 strong{font-weight:700;text-decoration:underline}.nri-x-m1,.nri-x-v1{grid-column:2;border-left:1pt solid #000}.nri-x-m2,.nri-x-v2{grid-column:3}.nri-x-m3,.nri-x-v3{grid-column:4}.nri-x-m4,.nri-x-v4{grid-column:5}.nri-x-m5,.nri-x-v5{grid-column:6}.nri-x-m6,.nri-x-v6{grid-column:7}.nri-x-m7,.nri-x-v7{grid-column:8}.nri-x-m8,.nri-x-v8{grid-column:9;border-right:1pt solid #000}.nri-x-bottom{grid-column:2/10;grid-row:11;border-left:1pt solid #000;border-right:1pt solid #000;border-bottom:1pt solid #000}';
    const doc=iframe.contentDocument||iframe.contentWindow.document;doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"><title></title><style>'+printCss+'</style></head><body>'+pages.join('')+'</body></html>');doc.close();
    iframe.contentWindow.onafterprint=()=>setTimeout(()=>{iframe.remove();loadNri()},400);setTimeout(()=>{iframe.contentWindow.focus();iframe.contentWindow.print()},250)
  }
  async function openPull(id){try{
    $('rxpPullBody').innerHTML='<div class="rxp-empty">Cruzando físico × sistema...</div>';$('rxpPullTitle').textContent='Processando...';$('rxpPullDialog').showModal();
    const d=await call('pull_auto_compare',{id}),x=d.comparison;selected=x.receipt;$('rxpPullTitle').textContent=selected.display_name;
    if(x.match_status!=='matched_invoice'){
      $('rxpPullBody').innerHTML='<div class="rxp-note warning"><strong>Cruzamento não concluído.</strong><br>'+esc(x.message||'Não foi possível localizar a NF no 02.05.01.')+(x.invoice_number?'<br><small>NF procurada: '+esc(x.invoice_number)+(x.supplier_code?' · Fornecedor '+esc(x.supplier_code):'')+'</small>':'')+'</div>';await loadPull();return
    }
    const labels={matched:'OK',divergent:'Divergente',physical_only:'Só no físico',system_only:'Só no sistema',no_capacity:'Sem fator 01.11'};
    const rows=x.rows||[];
    $('rxpPullBody').innerHTML='<div class="rxp-note"><strong>NF '+esc(x.invoice_number)+'</strong> · fornecedor '+esc(x.supplier_code||'por NF')+' · Compra e bonificação já somadas por produto. A comparação abaixo é feita em paletes equivalentes.</div>'+
      '<table class="rxp-items-table"><thead><tr><th>Código</th><th>Produto</th><th>Físico</th><th>Sistema 02.05.01</th><th>Paletes sistema</th><th>Diferença</th><th>Status</th></tr></thead><tbody>'+
      rows.map(r=>'<tr><td>'+esc(r.sku_code)+'</td><td>'+esc(r.sku_name)+'</td><td><strong>'+esc(r.physical_text)+'</strong><br><small>'+(r.physical_pallet_eq==null?'—':n(r.physical_pallet_eq)+' P eq.')+'</small></td><td>'+(r.system_raw_qty==null?'—':n(r.system_raw_qty)+' '+esc(r.system_unit||''))+(r.operation_codes?'<br><small>Operações '+esc(r.operation_codes)+'</small>':'')+'</td><td><strong>'+(r.system_pallet_eq==null?'—':n(r.system_pallet_eq)+' P')+'</strong><br><small>'+(r.boxes_per_pallet?('01.11: '+n(r.boxes_per_pallet)+' '+esc(r.system_unit||'')+'/P'):'Sem fator')+'</small></td><td class="'+(r.difference_pallet_eq==null?'':Math.abs(Number(r.difference_pallet_eq))<.0001?'rxp-ok':'rxp-nok')+'">'+(r.difference_pallet_eq==null?'—':n(r.difference_pallet_eq)+' P')+'</td><td class="'+(r.status==='matched'?'rxp-ok':r.status==='no_capacity'?'':'rxp-nok')+'">'+esc(labels[r.status]||r.status)+'</td></tr>').join('')+
      '</tbody></table>';
    await loadPull();
  }catch(e){$('rxpPullBody').innerHTML='<div class="rxp-empty error">'+esc(e.message)+'</div>';showToast(e.message,true)}}
  async function savePull(items){const payload=items.map(x=>({id:x.id,system_qty:$('rxpPullBody').querySelector('[data-system="'+x.id+'"]').value}));try{await call('pull_save',{id:selected.id,items:payload});$('rxpPullDialog').close();showToast('Cruzamento salvo.');await loadPull()}catch(e){showToast(e.message,true)}}
  window.__receivingNri={openNri:()=>open('nri'),openPull:()=>open('pull')};
})();