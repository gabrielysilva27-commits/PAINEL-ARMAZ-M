(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const $=id=>document.getElementById(id);
  const REASONS=['Falha no Manuseio','Falta','Falta de fitilho','Vencido','Consumo interno','Avaria','Falha manobrista','Descarte repack','Quebra ao descarregar','Sem tampa/Liq. pela metade','Produto sem gás','Quebra ao carregar','Embalagem secundária','Corrosão','Outros'];
  const FULL_LOCATIONS=['Picking','Análise/Bloqueio','Repack','Retornável','Estacionamento - Rota','Descartável','Pulmões/Descarga'];
  const EMPTY_LOCATIONS=['Saroba','Devolução - Rota','Vasilhame','Descarga','Carregamento - Puxada'];
  let interviewDocument=null;
  const interviewDocumentReady=Promise.all([import('./bo/interview-document.mjs?v=20261120-paper'),import('./bo/print-layout.mjs?v=20261120-a4')]).then(([document,layout])=>{interviewDocument={...document,...layout};});
  let permissions=null,activeStatus='pending',rows=[],selected=null,xlsxPromise=null,selectedIds=new Set();

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
  function statusLabel(s){return({pending:'Pendente',validated:'Validado',returned:'Devolvido',cancelled:'Excluído'})[s]||s;}
  function today(){return new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});}
  function subjectName(row){const type=row?.subject_type||'Funcionário';if(type==='Fábrica')return row.factory_name||'Fábrica';if(type==='Armazém')return 'Armazém';return row.employee_name||'—';}
  function subjectFunction(row){return (row?.subject_type||'Funcionário')==='Funcionário'?(row.employee_function||'—'):'';}
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
      '<div class="bo-control-filters">'+
      '<label class="bo-search-field">Buscar<input id="boSearch" placeholder="B.O., funcionário, fábrica, código ou produto" /></label>'+
      '<label class="bo-date-field">Data do B.O.<input id="boOccurrenceDate" type="date" /></label>'+
      '<label class="bo-status-field">Status<select id="boStatus"><option value="pending">Pendentes</option><option value="validated">Validados</option><option value="returned">Devolvidos</option><option value="cancelled">Excluídos</option><option value="all">Todos</option></select></label>'+
      '<button class="bo-btn-secondary bo-refresh-button" id="boRefresh">Atualizar</button>'+
      '</div>'+
      '<div class="bo-control-actionbar">'+
      '<div class="bo-bulk-actions"><button class="bo-btn-primary" id="boValidateSelected" disabled>Validar selecionados (0)</button><button class="bo-btn-secondary" id="boPrintSelected" disabled>Imprimir selecionados (0)</button></div>'+
      '<div class="bo-report-actions"><button class="bo-btn-secondary" id="boExportPa">PA (.xlsx)</button><label class="bo-daily-field"><span>Data do Informativo</span><input id="boDailyDate" type="date" value="'+today()+'"></label><button class="bo-btn-secondary" id="boPreviewDaily">Visualizar Informativo</button></div>'+
      '</div>'+
      '</div>'+
      '<div class="bo-table-wrap"><table class="bo-table"><thead><tr><th class="bo-select-col"><label class="bo-select-all" title="Selecionar todos os B.O.s visíveis"><input id="boSelectAll" type="checkbox"><span>Todos</span></label></th><th>B.O.</th><th>Data/Hora</th><th>Conferente</th><th>Origem</th><th>Turno</th><th>Motivo</th><th>Local</th><th>Status</th><th>Ação</th></tr></thead><tbody id="boTableBody"></tbody></table></div><div class="bo-empty hidden" id="boEmpty">Nenhum B.O. encontrado.</div><p class="bo-export-note">A PA e o Informativo são derivados automaticamente dos B.O.s validados. Não há nova digitação.</p></section>'+
      '</div>'+
      '<dialog id="boReviewDialog" class="bo-review-dialog"><div class="bo-review-inner"><div class="bo-review-header"><div><p class="eyebrow">B.O. · MOVIMENTAÇÕES DE ESTOQUE</p><h2 id="boDialogTitle"></h2></div><button id="boDialogClose" aria-label="Fechar">×</button></div><div class="bo-dialog-tools"><button class="bo-btn-secondary" id="boPrint">Imprimir / PDF</button><button class="bo-btn-secondary" id="boPrintInterview" style="display:none">Só entrevista / PDF</button></div><div id="boDialogBody"></div></div></dialog>'+
      '<dialog id="boInformativoDialog" class="bo-informativo-dialog"><div class="bo-review-inner"><div class="bo-review-header"><div><p class="eyebrow">INFORMATIVO DE QUEBRA DIÁRIA</p><h2 id="boInfDialogTitle"></h2></div><button id="boInfClose" aria-label="Fechar">×</button></div><div class="bo-dialog-tools"><button class="bo-btn-secondary" id="boInfPrint">Imprimir / PDF</button><button class="bo-btn-primary" id="boInfDownload">Baixar XLSX</button></div><div id="boInfBody"></div></div></dialog>';
  }

  function renderShell(){
    $('boControlView').innerHTML=shellHtml();
    const groupPanel=document.createElement('section');groupPanel.id='boGroupedPending';$('boControlView').prepend(groupPanel);
    import('./bo-group-control.js?v=20261120-discard').then(m=>m.renderGroupControl(groupPanel,call,async()=>{await load();await m.renderGroupControl(groupPanel,call,async()=>open());})).catch(error=>{groupPanel.textContent=error.message;});
    $('boStatus').value=activeStatus;
    $('boStatus').onchange=()=>{activeStatus=$('boStatus').value;load();};
    $('boOccurrenceDate').onchange=load;
    let t;$('boSearch').oninput=()=>{clearTimeout(t);t=setTimeout(load,250);};
    $('boRefresh').onclick=load;$('boValidateSelected').onclick=validateSelectedBos;$('boPrintSelected').onclick=printSelectedBos;$('boExportPa').onclick=exportPaXlsx;$('boPreviewDaily').onclick=previewDaily;
    $('boSelectAll').onchange=e=>{if(e.target.checked)rows.forEach(r=>selectedIds.add(Number(r.id)));else selectedIds.clear();syncSelectionUi();renderRowSelection();};
    $('boDialogClose').onclick=()=>$('boReviewDialog').close();$('boPrint').onclick=printBo;$('boPrintInterview').onclick=printInterview;$('boInfClose').onclick=()=>$('boInformativoDialog').close();
    $('boInfPrint').onclick=printInformativo;$('boInfDownload').onclick=exportDailyXlsx;
  }

  function flowStatus(row){
    return {text:statusLabel(row.status),cls:row.status};
  }
  function isBulkEligible(row){return row&&row.status==='pending'&&(row.record_kind!=='turn_c_origin'||row.confront_state==='completed');}
  function syncSelectionUi(){
    const count=selectedIds.size,btn=$('boPrintSelected'),validateBtn=$('boValidateSelected'),all=$('boSelectAll');
    const eligible=rows.filter(r=>selectedIds.has(Number(r.id))&&isBulkEligible(r));
    if(btn){btn.disabled=count===0;btn.textContent='Imprimir selecionados ('+count+')';}
    if(validateBtn){validateBtn.disabled=eligible.length===0;validateBtn.textContent='Validar selecionados ('+eligible.length+')';}
    if(all){const visible=rows.length,selectedVisible=rows.filter(r=>selectedIds.has(Number(r.id))).length;all.checked=visible>0&&selectedVisible===visible;all.indeterminate=selectedVisible>0&&selectedVisible<visible;}
  }
  function renderRowSelection(){
    const body=$('boTableBody');if(!body)return;
    body.querySelectorAll('[data-select-bo]').forEach(input=>{input.checked=selectedIds.has(Number(input.dataset.selectBo));});
    syncSelectionUi();
  }

  async function load(){
    try{
      const occurrenceDate=$('boOccurrenceDate')?$('boOccurrenceDate').value:'';
      const d=await call('dashboard',{status:activeStatus,search:$('boSearch')?$('boSearch').value:'',from:occurrenceDate||'',to:occurrenceDate||''});rows=d.occurrences||[];selectedIds.clear();
      $('boCountPending').textContent=d.counts.pending||0;$('boCountValidated').textContent=d.counts.validated||0;$('boCountReturned').textContent=d.counts.returned||0;
      const body=$('boTableBody');body.innerHTML=rows.map(r=>{const fs=flowStatus(r),relation=r.record_kind==='turn_a_confront'&&r.source?.bo_number?'<small>de '+esc(r.source.bo_number)+'</small>':'';return '<tr><td class="bo-select-col"><input class="bo-row-check" type="checkbox" data-select-bo="'+r.id+'" aria-label="Selecionar '+esc(r.bo_number)+'"></td><td><strong>'+esc(r.bo_number)+'</strong>'+relation+'</td><td>'+fmtDate(r.occurrence_date)+'<br><small>'+esc(String(r.occurrence_time||'').slice(0,5))+'</small></td><td>'+esc(r.conferencer&&r.conferencer.display_name||'—')+'</td><td>'+esc(subjectName(r))+'<br><small>'+esc(r.subject_type||'Funcionário')+'</small></td><td>'+esc(r.shift)+'</td><td>'+esc(r.reason)+'</td><td>'+esc(r.location)+'</td><td><span class="bo-badge '+fs.cls+'">'+esc(fs.text)+'</span></td><td><div class="bo-row-actions"><button class="bo-btn-secondary" data-open="'+r.id+'">Visualizar B.O.</button>'+(permissions&&permissions.can_delete?'<button class="bo-trash-btn" data-delete="'+r.id+'" title="Excluir B.O." aria-label="Excluir B.O.">🗑</button>':'')+'</div></td></tr>';}).join('');
      $('boEmpty').classList.toggle('hidden',rows.length>0);
      body.querySelectorAll('[data-select-bo]').forEach(input=>input.onchange=()=>{const id=Number(input.dataset.selectBo);if(input.checked)selectedIds.add(id);else selectedIds.delete(id);syncSelectionUi();});
      body.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openRow(Number(b.dataset.open)));body.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteBo(Number(b.dataset.delete)));syncSelectionUi();
    }catch(e){showToast(e.message,true);}
  }

  async function deleteBo(id){
    const row=rows.find(r=>Number(r.id)===Number(id));if(!row)return;
    if(!confirm('Excluir definitivamente '+row.bo_number+'?\n\nEsta ação é exclusiva do ADM e removerá este B.O. dos testes, incluindo os produtos vinculados.'))return;
    try{await call('admin_delete_occurrence',{id});showToast('B.O. excluído.');if(selected&&Number(selected.id)===Number(id)&&$('boReviewDialog')?.open)$('boReviewDialog').close();await load();}catch(e){showToast(e.message,true);}
  }

  function paperHtml(row){
    const items=(row.items||[]).slice().sort((a,b)=>a.line_no-b.line_no);
    const conf=row.conferencer&&row.conferencer.display_name||'';
    const flow=row.record_kind==='turn_c_origin'
      ?'<div class="bo-paper-flow source">REGISTRO DO TURNO C · '+(row.confront_state==='completed'?'CONFRONTADO PELO TURNO A':'AGUARDANDO CONFRONTO')+'</div>'
      :row.record_kind==='turn_a_confront'
        ?'<div class="bo-paper-flow official">RESULTADO OFICIAL · CONFRONTO DO TURNO A'+(row.source?.bo_number?' · ORIGEM '+esc(row.source.bo_number):'')+'</div>'
        :'';
    return '<div class="bo-paper'+(items.length>8?' bo-paper-dense':'')+'">'+
      '<div class="bo-paper-title">Movimentações de Estoque</div><div class="bo-paper-subtitle">B.O.</div>'+flow+
      '<div class="bo-paper-top"><div class="bo-paper-box"><div><strong>B.O.:</strong> '+esc(row.bo_number)+' &nbsp;&nbsp; <strong>Data:</strong> '+fmtDate(row.occurrence_date)+' &nbsp;&nbsp; <strong>Hora:</strong> '+esc(String(row.occurrence_time||'').slice(0,5))+'</div><div class="bo-paper-line"><strong>Emitido por:</strong> '+esc(conf)+'</div><div class="bo-paper-line">'+['A','B','C'].map(x=>checkbox('Turno '+x,row.shift===x)).join('')+'</div></div>'+
      '<div class="bo-paper-box"><div style="text-align:center;font-weight:800;margin-bottom:10px">Tipo</div><div class="bo-paper-line" style="justify-content:center">'+['Entrada','Saída'].map(x=>checkbox(x,row.movement_type===x)).join('')+'</div></div></div>'+
      '<div class="bo-paper-band">Local</div><div class="bo-paper-local"><div><h4>CHEIO</h4>'+FULL_LOCATIONS.map(x=>checkbox(x,row.location===x)).join('')+'</div><div><h4>VAZIO</h4>'+EMPTY_LOCATIONS.map(x=>checkbox(x,row.location===x)).join('')+'</div></div>'+
      '<table class="bo-paper-table"><thead><tr><th>Código</th><th>DESCRIÇÃO</th><th>TOTAL</th><th>TT REEMBALADO</th><th>TT DESCARTE</th></tr></thead><tbody>'+
      items.map(x=>'<tr><td>'+esc(x.sku_code)+'</td><td>'+esc(x.sku_name)+'</td><td>'+num(x.total_qty)+'</td><td>'+num(x.repacked_qty)+'</td><td>'+num(x.discarded_qty)+'</td></tr>').join('')+
      '</tbody></table>'+
      '<div class="bo-paper-comments"><strong>Comentários:</strong> '+esc(row.comments||'')+'</div>'+
      '<div class="bo-paper-meta-row"><strong>'+(row.subject_type==='Funcionário'||!row.subject_type?'Funcionário:':row.subject_type==='Fábrica'?'Fábrica:':'Origem:')+'</strong><span>'+esc(subjectName(row))+'</span></div>'+((row.subject_type==='Funcionário'||!row.subject_type)?'<div class="bo-paper-meta-row"><strong>Função:</strong><span>'+esc(subjectFunction(row))+'</span></div>':'')+
      '<div class="bo-paper-band">MOTIVO</div><div class="bo-paper-reasons">'+REASONS.map(x=>checkbox(x,row.reason===x)).join('')+'</div>'+
      '<div class="bo-paper-footer"><div><strong>Responsável</strong><div class="bo-paper-line">'+['Conferente','SVA','COA','GOD'].map(x=>checkbox(x,row.responsibility===x)).join('')+'</div></div><div><strong>Técnico de Controle</strong><div style="margin-top:8px">'+esc(row.validator&&row.validator.display_name||row.validator&&row.validator.username||'')+'</div></div></div>'+
      '<div class="bo-paper-note">Ao término do turno entregar ao Técnico de Controle para que seja feito a validação.</div><div class="bo-paper-note">Deverá ser feito um formulário para cada ocorrência, exceto se for do mesmo produto.</div><div class="bo-paper-note">Para anomalia de quebra, será obrigatório a realização de entrevista com o funcionário que veio a quebrar. Anexar junto com BO.</div>'+
      '</div>';
  }

  function openRow(id){
    selected=rows.find(r=>Number(r.id)===id);if(!selected)return;
    $('boDialogTitle').textContent=selected.bo_number;
    let paper=paperHtml(selected);
    if(selected.interview_report)paper+='<p><strong>Entrevista registrada:</strong> '+esc(selected.interview_report)+'</p>';
    if(selected.validation_comment)paper+='<p><strong>Comentário do Controle:</strong> '+esc(selected.validation_comment)+'</p>';
    if(selected.record_kind==='turn_c_origin'){
      paper+='<div class="bo-confront-info"><strong>Registro de origem do Turno C.</strong> '+(selected.confront_state==='completed'?'Confronto do Turno A concluído. Este B.O. está liberado para validação do Controle; a decisão será aplicada também ao resultado oficial do Turno A.':'Aguardando o Turno A realizar a repecagem e registrar o confronto. Este registro ainda não pode ser validado pelo Controle.')+'</div>';
    }
    if(isBulkEligible(selected)&&permissions&&permissions.can_validate)paper+='<label style="display:grid;gap:6px;margin-top:16px;font-weight:700;font-size:12px">Comentário do Controle<textarea id="boReviewComment" rows="3" placeholder="Obrigatório somente para devolver ao conferente"></textarea></label><div class="bo-review-actions"><button class="bo-btn-danger" id="boReturnButton">Devolver para correção</button><button class="bo-btn-primary" id="boValidateButton">Validar B.O.</button></div>';
    $('boDialogBody').innerHTML=paper;
    $('boPrintInterview').style.display=selected.interview_report?'':'none';
    if($('boReturnButton'))$('boReturnButton').onclick=()=>review('returned');if($('boValidateButton'))$('boValidateButton').onclick=()=>review('validated');
    $('boReviewDialog').showModal();
  }

  async function review(decision){try{await call('review',{id:selected.id,decision,comment:$('boReviewComment')?$('boReviewComment').value:''});$('boReviewDialog').close();showToast(decision==='validated'?'B.O. validado com sucesso.':'B.O. devolvido ao conferente.');await load();}catch(e){showToast(e.message,true);}}

  async function validateSelectedBos(){
    const chosen=rows.filter(r=>selectedIds.has(Number(r.id))),eligible=chosen.filter(isBulkEligible);
    if(!eligible.length)return showToast('Nenhum B.O. selecionado está pendente e elegível para validação.',true);
    const skipped=chosen.length-eligible.length;
    const message='Validar '+eligible.length+' B.O.'+(eligible.length===1?'':'s')+' selecionado'+(eligible.length===1?'':'s')+' agora?'+(skipped?'\n\n'+skipped+' registro'+(skipped===1?' será ignorado':'s serão ignorados')+' por não estar pendente ou por ainda aguardar confronto.':'');
    if(!confirm(message))return;
    const btn=$('boValidateSelected');if(btn)btn.disabled=true;
    try{
      const d=await call('bulk_validate',{ids:eligible.map(r=>Number(r.id))});
      const validated=Number(d.validated_count||0),ignored=Number(d.skipped_count||0)+skipped;
      showToast(validated+' B.O.'+(validated===1?' validado':'s validados')+' com sucesso.'+(ignored?' '+ignored+' ignorado'+(ignored===1?'.':'s.'):''));
      await load();
    }catch(e){showToast(e.message,true);syncSelectionUi();}
  }

  async function exportPaXlsx(){
    try{
      const d=await call('export',{});if(!d.pa||!d.pa.length)return showToast('Não há B.O.s validados para gerar a PA.',true);
      const XLSX=await ensureXlsx();const headers=['Data','Responsável','Código','Descrição do produto','Qtde','Motivo','Situação','Área/ Local','Conferente','Turno'];
      const rows=d.pa.map(r=>headers.map(h=>{
        if(h!=='Data')return r[h]??'';
        const raw=String(r[h]||'').slice(0,10),parts=raw.split('-');
        return parts.length===3?new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2])):raw;
      }));
      const aoa=[headers].concat(rows);const ws=XLSX.utils.aoa_to_sheet(aoa,{cellDates:true});
      for(let row=2;row<=aoa.length;row++){const cell=ws['A'+row];if(cell){cell.t='d';cell.z='dd/mm/yyyy';}}
      ws['!cols']=[12,30,12,48,9,28,14,24,16,8].map(w=>({wch:w}));ws['!autofilter']={ref:'A1:J'+aoa.length};
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'PA');XLSX.writeFile(wb,'PA_BOs_validados.xlsx',{compression:true,cellDates:true});
      showToast('PA gerada com a data em DD/MM/AAAA e somente os campos de entrada manual.');
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

  function interviewHtml(row){return interviewDocument.renderInterview(row);}  function printSheet(title,content,landscape=false){
    if(!content)return;
    const iframe=document.createElement('iframe');
    iframe.setAttribute('aria-hidden','true');
    iframe.style.position='fixed';
    iframe.style.left='-10000px';
    iframe.style.top='0';
    iframe.style.width=landscape?'297mm':'210mm';
    iframe.style.height=landscape?'210mm':'297mm';
    iframe.style.border='0';
    iframe.style.background='#fff';
    document.body.appendChild(iframe);
    const screenCss=document.getElementById('boControlCssEmbedded')?.textContent||'';
    const printCss='@page{size:A4 '+(landscape?'landscape':'portrait')+';margin:10mm}html,body{margin:0!important;padding:0!important;background:#fff!important;color:#111!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.bo-batch-page{break-after:page}.bo-batch-page:last-child{break-after:auto}.bo-paper{width:100%!important;max-width:none!important;margin:0!important}.bo-review-actions,.bo-dialog-tools,button{display:none!important}'+interviewDocument.BO_PRINT_CSS+interviewDocument.INTERVIEW_PRINT_CSS;
    const doc=iframe.contentDocument||iframe.contentWindow.document;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+screenCss+'\n'+printCss+'</style></head><body>'+content+'</body></html>');
    doc.close();
    const cleanup=()=>setTimeout(()=>{if(iframe.parentNode)iframe.remove();},800);
    const doPrint=()=>{
      try{
        const win=iframe.contentWindow;
        if(!win)throw new Error('Janela de impressão indisponível.');
        win.onafterprint=cleanup;
        win.focus();
        win.print();
      }catch(e){
        showToast('Não foi possível abrir a impressão.',true);
        cleanup();
      }
    };
    const ready=()=>{
      try{
        const fonts=doc.fonts&&doc.fonts.ready?doc.fonts.ready:Promise.resolve();
        fonts.finally(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(doPrint,120))));
      }catch(e){
        setTimeout(doPrint,180);
      }
    };
    if(doc.readyState==='complete')ready();
    else iframe.onload=ready;
  }

  function printBo(){
    const paper=$('boDialogBody')&&$('boDialogBody').querySelector('.bo-paper');
    if(!paper)return showToast('Abra um B.O. antes de imprimir.',true);
    printSheet(selected&&selected.bo_number?selected.bo_number:'B.O.',paper.outerHTML+interviewHtml(selected),false);
  }
  function printInterview(){if(selected?.interview_report)printSheet('Entrevista · '+selected.bo_number,interviewHtml(selected),false);}  function printSelectedBos(){
    const chosen=rows.filter(r=>selectedIds.has(Number(r.id)));
    if(!chosen.length)return showToast('Selecione pelo menos um B.O. para imprimir.',true);
    const content=chosen.map(r=>'<section class="bo-batch-page">'+paperHtml(r)+interviewHtml(r)+'</section>').join('');
    printSheet(chosen.length+' B.O.s selecionados',content,false);
  }


  function printInformativo(){
    const content=$('boInfBody')&&$('boInfBody').innerHTML;
    if(!content)return showToast('Visualize o Informativo antes de imprimir.',true);
    printSheet('Informativo de Quebra Diária',content,true);
  }

  async function loadPins(){try{const d=await call('pin_status');$('boPinList').innerHTML=d.conferencers.map(x=>'<div class="bo-pin-item"><div><strong>'+esc(x.display_name)+'</strong><small style="display:block;color:#777">'+(x.pin_ready?'PIN configurado':'PIN pendente')+'</small></div><button class="bo-btn-secondary" data-reset="'+x.id+'">'+(x.pin_ready?'Resetar PIN':'Gerar PIN')+'</button></div>').join('');$('boPinList').querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>resetPin(b.dataset.reset));}catch(e){showToast(e.message,true);}}
  function showIssued(items){$('boPinIssued').innerHTML=items&&items.length?'<div class="bo-pin-issued"><strong>Copie agora — estes PINs não serão exibidos novamente:</strong>'+items.map(x=>'<p>'+esc(x.display_name)+' — <code>'+esc(x.pin)+'</code></p>').join('')+'</div>':'';}
  async function generateMissingPins(){try{const d=await call('generate_missing_pins');showIssued(d.issued||[]);await loadPins();if(!d.issued||!d.issued.length)showToast('Todos os conferentes já possuem PIN.');}catch(e){showToast(e.message,true);}}
  async function resetPin(id){try{const d=await call('reset_pin',{id});showIssued([d.issued]);await loadPins();}catch(e){showToast(e.message,true);}}

  async function open(){setHeader();$('boControlView').innerHTML='<div class="bo-empty">Carregando Controle de B.O.…</div>';try{await interviewDocumentReady;permissions=await call('permissions');if(!permissions.can_validate){$('boControlView').innerHTML='<section class="bo-control-panel"><strong>Acesso restrito.</strong><p>Somente o Controle e a administração podem validar B.O.s.</p></section>';return;}renderShell();await load();}catch(e){$('boControlView').innerHTML='<section class="bo-control-panel"><p class="form-error">'+esc(e.message)+'</p></section>';}}
  window.__boControl={open};
})();