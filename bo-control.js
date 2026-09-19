(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const $=id=>document.getElementById(id);
  const REASONS=['Falha no Manuseio','Falta','Falta de fitilho','Vencido','Consumo interno','Avaria','Falha manobrista','Descarte repack','Quebra ao descarregar','Sem tampa/Liq. pela metade','Produto sem gás','Quebra ao carregar','Embalagem secundária','Corrosão','Outros'];
  const FULL_LOCATIONS=['Picking','Análise/Bloqueio','Repack','Retornável','Estacionamento - Rota','Descartável','Pulmões/Descarga'];
  const EMPTY_LOCATIONS=['Saroba','Devolução - Rota','Vasilhame','Descarga','Carregamento - Puxada'];
  let permissions=null,activeStatus='pending',rows=[],selected=null,xlsxPromise=null;

  async function call(action,payload={}){
    const token=(window.state&&window.state.token)||localStorage.getItem('pa_session')||'';
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':token},body:JSON.stringify(Object.assign({action},payload))});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Erro no Controle de B.O.');
    return d;
  }
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmtDate(v){if(!v)return'—';const p=String(v).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:v;}
  function num(v){return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v||0));}
  function statusLabel(s){return({pending:'Pendente',validated:'Validado',returned:'Devolvido'})[s]||s;}
  function today(){return new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});}
  function initials(name){return String(name||'').trim().split(/\s+/).map(x=>x[0]||'').join('').slice(0,3).toUpperCase();}
  function checkbox(label,active){return '<span class="bo-paper-check '+(active?'active':'')+'"><i></i>'+esc(label)+'</span>';}
  function csvCell(v){const s=String(v==null?'':v);return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function downloadCsv(name,data){if(!data||!data.length){showToast('Não há registros para exportar.',true);return;}const headers=Object.keys(data[0]);const lines=[headers.map(csvCell).join(';')].concat(data.map(r=>headers.map(h=>csvCell(r[h])).join(';')));const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function setHeader(){if($('pageTitle'))$('pageTitle').textContent='Controle';if($('pageSubtitle'))$('pageSubtitle').textContent='B.O. de estoque · validação, rastreabilidade e saídas automáticas.';}

  async function ensureXlsx(){
    if(window.XLSX)return window.XLSX;
    if(xlsxPromise)return xlsxPromise;
    xlsxPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.async=true;
      s.onload=()=>resolve(window.XLSX);s.onerror=()=>{xlsxPromise=null;reject(new Error('Não foi possível carregar o gerador de Excel.'));};document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  function shellHtml(){
    return '<div class="bo-control-shell">'+
      '<section class="bo-control-kpis"><article class="bo-kpi pending"><span>Pendentes</span><strong id="boCountPending">—</strong></article><article class="bo-kpi validated"><span>Validados</span><strong id="boCountValidated">—</strong></article><article class="bo-kpi returned"><span>Devolvidos</span><strong id="boCountReturned">—</strong></article></section>'+
      '<section class="bo-control-panel"><div class="bo-control-toolbar">'+
      '<label>Buscar<input id="boSearch" placeholder="B.O., funcionário, código ou produto" /></label>'+
      '<label>Status<select id="boStatus"><option value="pending">Pendentes</option><option value="validated">Validados</option><option value="returned">Devolvidos</option><option value="all">Todos</option></select></label>'+
      '<div class="bo-control-actions"><button class="bo-btn-secondary" id="boRefresh">Atualizar</button><button class="bo-btn-secondary" id="boExportPa">PA (.xlsx)</button><button class="bo-btn-secondary" id="boPreviewDaily">Visualizar Informativo</button><button class="bo-btn-secondary" id="boExportDaily">Informativo (.xlsx)</button></div>'+
      '</div><div style="display:flex;justify-content:flex-end;margin-top:10px"><label style="display:grid;gap:5px;font-size:12px;font-weight:700">Data do Informativo<input id="boDailyDate" type="date" value="'+today()+'" style="border:1px solid #d7d8dd;border-radius:9px;padding:9px 10px"></label></div>'+
      '<div class="bo-table-wrap"><table class="bo-table"><thead><tr><th>B.O.</th><th>Data/Hora</th><th>Conferente</th><th>Funcionário</th><th>Turno</th><th>Motivo</th><th>Local</th><th>Status</th><th>Ação</th></tr></thead><tbody id="boTableBody"></tbody></table></div><div class="bo-empty hidden" id="boEmpty">Nenhum B.O. encontrado.</div><p class="bo-export-note">A PA e o Informativo são derivados automaticamente dos B.O.s validados. Não há nova digitação.</p></section>'+
      '</div>'+
      '<dialog id="boReviewDialog" class="bo-review-dialog"><div class="bo-review-inner"><div class="bo-review-header"><div><p class="eyebrow">VALIDAÇÃO DO CONTROLE</p><h2 id="boDialogTitle"></h2></div><button id="boDialogClose" aria-label="Fechar">×</button></div><div id="boDialogBody"></div></div></dialog>'+
      '<dialog id="boInformativoDialog" class="bo-informativo-dialog"><div class="bo-review-inner"><div class="bo-review-header"><div><p class="eyebrow">INFORMATIVO DE QUEBRA DIÁRIA</p><h2 id="boInfDialogTitle"></h2></div><button id="boInfClose" aria-label="Fechar">×</button></div><div class="bo-dialog-tools"><button class="bo-btn-secondary" id="boInfPrint">Imprimir / PDF</button><button class="bo-btn-primary" id="boInfDownload">Baixar XLSX</button></div><div id="boInfBody"></div></div></dialog>';
  }

  function renderShell(){
    $('boControlView').innerHTML=shellHtml();
    $('boStatus').value=activeStatus;
    $('boStatus').onchange=()=>{activeStatus=$('boStatus').value;load();};
    let t;$('boSearch').oninput=()=>{clearTimeout(t);t=setTimeout(load,250);};
    $('boRefresh').onclick=load;$('boExportPa').onclick=exportPaXlsx;$('boPreviewDaily').onclick=previewDaily;$('boExportDaily').onclick=exportDailyXlsx;
    $('boDialogClose').onclick=()=>$('boReviewDialog').close();$('boInfClose').onclick=()=>$('boInformativoDialog').close();
    $('boInfPrint').onclick=printInformativo;$('boInfDownload').onclick=exportDailyXlsx;
  }

  async function load(){
    try{
      const d=await call('dashboard',{status:activeStatus,search:$('boSearch')?$('boSearch').value:''});rows=d.occurrences||[];
      $('boCountPending').textContent=d.counts.pending||0;$('boCountValidated').textContent=d.counts.validated||0;$('boCountReturned').textContent=d.counts.returned||0;
      const body=$('boTableBody');body.innerHTML=rows.map(r=>'<tr><td><strong>'+esc(r.bo_number)+'</strong></td><td>'+fmtDate(r.occurrence_date)+'<br><small>'+esc(String(r.occurrence_time||'').slice(0,5))+'</small></td><td>'+esc(r.conferencer&&r.conferencer.display_name||'—')+'</td><td>'+esc(r.employee_name)+'</td><td>'+esc(r.shift)+'</td><td>'+esc(r.reason)+'</td><td>'+esc(r.location)+'</td><td><span class="bo-badge '+r.status+'">'+statusLabel(r.status)+'</span></td><td><button class="bo-btn-secondary" data-open="'+r.id+'">Visualizar</button></td></tr>').join('');
      $('boEmpty').classList.toggle('hidden',rows.length>0);body.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openRow(Number(b.dataset.open)));
    }catch(e){showToast(e.message,true);}
  }

  function openRow(id){
    selected=rows.find(r=>Number(r.id)===id);if(!selected)return;
    $('boDialogTitle').textContent=selected.bo_number;
    const items=(selected.items||[]).slice().sort((a,b)=>a.line_no-b.line_no);
    const conf=selected.conferencer&&selected.conferencer.display_name||'';
    const rubrica=initials(conf);
    let paper='<div class="bo-paper">'+
      '<div class="bo-paper-title">Movimentações de Estoque</div><div class="bo-paper-subtitle">B.O.</div>'+
      '<div class="bo-paper-top"><div class="bo-paper-box"><div><strong>Data:</strong> '+fmtDate(selected.occurrence_date)+' &nbsp;&nbsp; <strong>Hora:</strong> '+esc(String(selected.occurrence_time||'').slice(0,5))+'</div><div class="bo-paper-line"><strong>Emitido por:</strong> '+esc(conf)+'</div><div class="bo-paper-line">'+['A','B','C'].map(x=>checkbox('Turno '+x,selected.shift===x)).join('')+'</div></div>'+
      '<div class="bo-paper-box"><div style="text-align:center;font-weight:800;margin-bottom:10px">Tipo</div><div class="bo-paper-line" style="justify-content:center">'+['Entrada','Saída'].map(x=>checkbox(x,selected.movement_type===x)).join('')+'</div></div></div>'+
      '<div class="bo-paper-band">Local</div><div class="bo-paper-local"><div><h4>CHEIO</h4>'+FULL_LOCATIONS.map(x=>checkbox(x,selected.location===x)).join('')+'</div><div><h4>VAZIO</h4>'+EMPTY_LOCATIONS.map(x=>checkbox(x,selected.location===x)).join('')+'</div></div>'+
      '<table class="bo-paper-table"><thead><tr><th>Código</th><th>DESCRIÇÃO</th><th>TOTAL</th><th>TT REEMBALADO</th><th>TT DESCARTE</th><th>RUBRICA</th></tr></thead><tbody>'+
      items.map(x=>'<tr><td>'+esc(x.sku_code)+'</td><td>'+esc(x.sku_name)+'</td><td>'+num(x.total_qty)+'</td><td>'+num(x.repacked_qty)+'</td><td>'+num(x.discarded_qty)+'</td><td>'+esc(rubrica)+'</td></tr>').join('')+
      '</tbody></table>'+
      '<div class="bo-paper-comments"><strong>Comentários:</strong> '+esc(selected.comments||'')+'</div>'+
      '<div class="bo-paper-meta-row"><strong>Funcionário:</strong><span>'+esc(selected.employee_name)+'</span></div><div class="bo-paper-meta-row"><strong>Função:</strong><span>'+esc(selected.employee_function)+'</span></div>'+
      '<div class="bo-paper-band">MOTIVO</div><div class="bo-paper-reasons">'+REASONS.map(x=>checkbox(x,selected.reason===x)).join('')+'</div>'+
      '<div class="bo-paper-footer"><div><strong>Responsável</strong><div class="bo-paper-line">'+['Conferente','SVA','COA','GOD'].map(x=>checkbox(x,selected.responsibility===x)).join('')+'</div></div><div><strong>Técnico de Controle</strong><div style="margin-top:8px">'+esc(selected.validator&&selected.validator.display_name||selected.validator&&selected.validator.username||'')+'</div></div></div>'+
      '<div class="bo-paper-note">Ao término do turno entregar ao Técnico de Controle para que seja feito a validação.</div><div class="bo-paper-note">Deverá ser feito um formulário para cada ocorrência, exceto se for do mesmo produto.</div><div class="bo-paper-note">Para anomalia de quebra, será obrigatório a realização de entrevista com o funcionário que veio a quebrar. Anexar junto com BO.</div>'+
      '</div>';
    if(selected.interview_report)paper+='<p><strong>Entrevista registrada:</strong> '+esc(selected.interview_report)+'</p>';
    if(selected.validation_comment)paper+='<p><strong>Comentário do Controle:</strong> '+esc(selected.validation_comment)+'</p>';
    if(selected.status==='pending'&&permissions&&permissions.can_validate)paper+='<label style="display:grid;gap:6px;margin-top:16px;font-weight:700;font-size:12px">Comentário do Controle<textarea id="boReviewComment" rows="3" placeholder="Obrigatório somente para devolver ao conferente"></textarea></label><div class="bo-review-actions"><button class="bo-btn-danger" id="boReturnButton">Devolver para correção</button><button class="bo-btn-primary" id="boValidateButton">Validar B.O.</button></div>';
    $('boDialogBody').innerHTML=paper;
    if($('boReturnButton'))$('boReturnButton').onclick=()=>review('returned');if($('boValidateButton'))$('boValidateButton').onclick=()=>review('validated');
    $('boReviewDialog').showModal();
  }

  async function review(decision){try{await call('review',{id:selected.id,decision,comment:$('boReviewComment')?$('boReviewComment').value:''});$('boReviewDialog').close();showToast(decision==='validated'?'B.O. validado com sucesso.':'B.O. devolvido ao conferente.');await load();}catch(e){showToast(e.message,true);}}

  async function exportPaXlsx(){
    try{
      const d=await call('export',{});if(!d.pa||!d.pa.length)return showToast('Não há B.O.s validados para gerar a PA.',true);
      const XLSX=await ensureXlsx();const headers=['FÁBRICA','Semana','Data','Responsavél','Código','Descrição do produto','Qtde','Motivo','Situação','Área/ Local','Conferente','Turno','Hl','Valor','NF','LOTE','VALIDADE','DATA DA BAIXA'];
      const aoa=[headers].concat(d.pa.map(r=>headers.map(h=>r[h]??'')));const ws=XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols']=[8,8,12,30,12,48,9,28,14,24,16,8,12,14,14,14,14,16].map(w=>({wch:w}));ws['!autofilter']={ref:'A1:R'+aoa.length};
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'PA');XLSX.writeFile(wb,'PA_BOs_validados.xlsx',{compression:true});
      showToast('PA gerada com os mesmos campos da aba PA, incluindo descrição, HL e valor.');
    }catch(e){showToast(e.message,true);}
  }

  async function getDaily(){
    const date=$('boDailyDate')?$('boDailyDate').value:today();const d=await call('export',{from:date,to:date});return{date,rows:d.daily||[]};
  }

  function informativoHtml(date,data){
    const total=data.reduce((s,r)=>s+Number(r.Quantidade||0),0);
    const body=data.length?data.map(r=>'<tr><td>'+esc(r['Código'])+'</td><td>'+esc(r['Produto'])+'</td><td>'+esc(r['Situação'])+'</td><td>'+num(r['Quantidade'])+'</td><td>'+esc(r['Responsável'])+'</td><td>'+esc(r['Função'])+'</td><td>'+esc(r['Área'])+'</td><td>'+esc(r['Turno'])+'</td></tr>').join(''):'<tr><td colspan="8" style="text-align:center;padding:18px">Sem B.O.s validados nesta data.</td></tr>';
    return '<div class="bo-informativo-sheet"><div class="bo-inf-head"><div><div>Quebra diária feita no período da: <strong>'+fmtDate(date)+'</strong></div><div style="margin-top:8px">Às: <strong>'+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</strong></div></div><div><strong>PA perdido</strong><div>Total: '+num(total)+'</div><strong style="display:block;margin-top:8px">AG Perdido</strong><div>Total: 0</div></div></div><div class="bo-inf-title bo-inf-section">PRODUTO ACABADO - PA</div><table class="bo-inf-table"><thead><tr><th>Cód.</th><th>Produto</th><th>Situação</th><th>Qtde (Un)</th><th>Responsável</th><th>Função</th><th>Área</th><th>Turno</th></tr></thead><tbody>'+body+'</tbody></table><div class="bo-inf-title bo-inf-section">ATIVO DE GIRO - AG</div><table class="bo-inf-table"><thead><tr><th>Cód.</th><th>Produto</th><th>Situação</th><th>Qtde (Un)</th><th>Responsável</th><th>Função</th><th>Área</th><th>Turno</th></tr></thead><tbody><tr><td colspan="8" style="height:36px"></td></tr></tbody></table><div class="bo-inf-legend"><span>D = Descarte</span><span>F = Falta</span><span>A = Avariada</span><span>V = Validade</span><span>Q = Quebra</span><span>C = Consumo</span><span>FM = Falha ao manusear</span><span>LM = Liq. Pela metade</span></div><p style="margin-top:18px"><strong>Emitido por:</strong> Controle</p><p style="text-align:right">Duque de Caxias, '+fmtDate(date)+'</p><div style="border-top:1px solid #222;padding-top:5px">Controle</div></div>';
  }

  async function previewDaily(){
    try{const d=await getDaily();$('boInfDialogTitle').textContent='Informativo · '+fmtDate(d.date);$('boInfBody').innerHTML=informativoHtml(d.date,d.rows);$('boInformativoDialog').showModal();}catch(e){showToast(e.message,true);}
  }

  async function exportDailyXlsx(){
    try{
      const d=await getDaily();const XLSX=await ensureXlsx();
      const aoa=Array.from({length:147},()=>Array(11).fill(''));
      aoa[5][1]='Quebra diária feita no período da:';aoa[5][4]=fmtDate(d.date);aoa[5][9]='PA perdido';
      aoa[6][8]='Total';aoa[6][9]=d.rows.reduce((s,r)=>s+Number(r.Quantidade||0),0);
      aoa[7][9]='AG Perdido';aoa[8][1]='Às:';aoa[8][2]=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});aoa[8][8]='Total';aoa[8][9]=0;
      aoa[10][0]='PRODUTO ACABADO - PA';
      const headers=['Cód.','Produto','','','Situação','Qtde (Un)','Responsável','','Função','Área','Turno'];headers.forEach((v,i)=>aoa[11][i]=v);
      d.rows.slice(0,119).forEach((r,i)=>{const row=12+i;aoa[row][0]=r['Código'];aoa[row][1]=r['Produto'];aoa[row][4]=r['Situação'];aoa[row][5]=Number(r['Quantidade']||0);aoa[row][6]=r['Responsável'];aoa[row][8]=r['Função'];aoa[row][9]=r['Área'];aoa[row][10]=r['Turno'];});
      aoa[131][0]='ATIVO DE GIRO - AG';headers.forEach((v,i)=>aoa[132][i]=v);
      aoa[141][0]='Obs.:  ';aoa[141][1]='D = Descarte';aoa[141][3]='F = Falta';aoa[141][6]='A = Avariada ';aoa[141][7]='V = Validade ';aoa[141][9]='Q= Quebra';
      aoa[142][1]='C = Consumo';aoa[142][3]='FM = Falha ao manusear';aoa[142][6]='LM= Liq. Pela metade';
      aoa[144][0]='Emitido por:';aoa[146][0]='Controle';aoa[145][6]='Duque de Caxias,';aoa[145][7]=fmtDate(d.date);
      const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[9,22,12,12,14,11,22,12,18,20,9].map(w=>({wch:w}));
      ws['!merges']=[XLSX.utils.decode_range('A11:K11'),XLSX.utils.decode_range('B12:D12'),XLSX.utils.decode_range('G12:H12'),XLSX.utils.decode_range('A132:K132'),XLSX.utils.decode_range('B133:D133'),XLSX.utils.decode_range('G133:H133'),XLSX.utils.decode_range('A147:E147')];
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Quebra diária');XLSX.writeFile(wb,'Informativo_Quebra_Diaria_'+d.date+'.xlsx',{compression:true});
      showToast('Informativo diário gerado a partir dos B.O.s validados.');
    }catch(e){showToast(e.message,true);}
  }

  function printInformativo(){
    const content=$('boInfBody')&&$('boInfBody').innerHTML;if(!content)return;
    const w=window.open('','_blank','noopener,noreferrer');if(!w)return showToast('O navegador bloqueou a janela de impressão.',true);
    w.document.write('<!doctype html><html><head><title>Informativo de Quebra Diária</title><style>body{font-family:Arial,sans-serif;color:#111;padding:20px}.bo-informativo-sheet{border:1px solid #222;padding:18px}.bo-inf-head{display:flex;justify-content:space-between}.bo-inf-section{background:#111;color:#fff;text-align:center;font-weight:bold;padding:6px;margin-top:10px}.bo-inf-table{width:100%;border-collapse:collapse}.bo-inf-table th,.bo-inf-table td{border:1px solid #333;padding:5px;font-size:10px}.bo-inf-table th{background:#222;color:#fff}.bo-inf-legend{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:10px;font-size:10px}</style></head><body>'+content+'<script>window.onload=()=>window.print()<\/script></body></html>');w.document.close();
  }

  async function loadPins(){try{const d=await call('pin_status');$('boPinList').innerHTML=d.conferencers.map(x=>'<div class="bo-pin-item"><div><strong>'+esc(x.display_name)+'</strong><small style="display:block;color:#777">'+(x.pin_ready?'PIN configurado':'PIN pendente')+'</small></div><button class="bo-btn-secondary" data-reset="'+x.id+'">'+(x.pin_ready?'Resetar PIN':'Gerar PIN')+'</button></div>').join('');$('boPinList').querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>resetPin(b.dataset.reset));}catch(e){showToast(e.message,true);}}
  function showIssued(items){$('boPinIssued').innerHTML=items&&items.length?'<div class="bo-pin-issued"><strong>Copie agora — estes PINs não serão exibidos novamente:</strong>'+items.map(x=>'<p>'+esc(x.display_name)+' — <code>'+esc(x.pin)+'</code></p>').join('')+'</div>':'';}
  async function generateMissingPins(){try{const d=await call('generate_missing_pins');showIssued(d.issued||[]);await loadPins();if(!d.issued||!d.issued.length)showToast('Todos os conferentes já possuem PIN.');}catch(e){showToast(e.message,true);}}
  async function resetPin(id){try{const d=await call('reset_pin',{id});showIssued([d.issued]);await loadPins();}catch(e){showToast(e.message,true);}}

  async function open(){setHeader();$('boControlView').innerHTML='<div class="bo-empty">Carregando Controle de B.O.…</div>';try{permissions=await call('permissions');if(!permissions.can_validate){$('boControlView').innerHTML='<section class="bo-control-panel"><strong>Acesso restrito.</strong><p>Somente o Controle e a administração podem validar B.O.s.</p></section>';return;}renderShell();await load();}catch(e){$('boControlView').innerHTML='<section class="bo-control-panel"><p class="form-error">'+esc(e.message)+'</p></section>';}}
  window.__boControl={open};
})();