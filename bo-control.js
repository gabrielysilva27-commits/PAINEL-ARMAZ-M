(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const $=id=>document.getElementById(id);
  let permissions=null,activeStatus='pending',rows=[],selected=null;
  async function call(action,payload={}){
    const token=(window.state&&window.state.token)||localStorage.getItem('pa_session')||'';
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':token},body:JSON.stringify(Object.assign({action},payload))});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro no Controle de B.O.');return d;
  }
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmtDate(v){if(!v)return'—';const p=String(v).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:v;}
  function num(v){return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v||0));}
  function statusLabel(s){return({pending:'Pendente',validated:'Validado',returned:'Devolvido'})[s]||s;}
  function csvCell(v){const s=String(v==null?'':v);return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function downloadCsv(name,data){if(!data||!data.length){showToast('Não há registros para exportar.',true);return;}const headers=Object.keys(data[0]);const lines=[headers.map(csvCell).join(';')].concat(data.map(r=>headers.map(h=>csvCell(r[h])).join(';')));const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function setHeader(){if($('pageTitle'))$('pageTitle').textContent='Controle · B.O. de Estoque';if($('pageSubtitle'))$('pageSubtitle').textContent='Validação, rastreabilidade e saídas automáticas dos B.O.s digitais.';}
  function shellHtml(){
    return '<div class="bo-control-shell">'+
      '<section class="bo-control-kpis"><article class="bo-kpi pending"><span>Pendentes</span><strong id="boCountPending">—</strong></article><article class="bo-kpi validated"><span>Validados</span><strong id="boCountValidated">—</strong></article><article class="bo-kpi returned"><span>Devolvidos</span><strong id="boCountReturned">—</strong></article></section>'+
      '<section class="bo-control-panel"><div class="bo-control-toolbar"><label>Buscar<input id="boSearch" placeholder="B.O., funcionário, código ou produto" /></label><label>Status<select id="boStatus"><option value="pending">Pendentes</option><option value="validated">Validados</option><option value="returned">Devolvidos</option><option value="all">Todos</option></select></label><div class="bo-control-actions"><button class="bo-btn-secondary" id="boRefresh">Atualizar</button><button class="bo-btn-secondary" id="boExportPa">Exportar PA</button><button class="bo-btn-secondary" id="boExportDaily">Informativo diário</button></div></div><div class="bo-table-wrap"><table class="bo-table"><thead><tr><th>B.O.</th><th>Data/Hora</th><th>Conferente</th><th>Funcionário</th><th>Turno</th><th>Motivo</th><th>Local</th><th>Status</th><th>Ação</th></tr></thead><tbody id="boTableBody"></tbody></table></div><div class="bo-empty hidden" id="boEmpty">Nenhum B.O. encontrado.</div><p class="bo-export-note">PA e Informativo são gerados somente a partir de B.O.s validados.</p></section>'+
      (permissions&&permissions.can_manage_pins?'<section class="bo-control-panel" id="boPinPanel"><div><p class="eyebrow">ACESSO DOS CONFERENTES</p><h2 style="margin:0">PINs do B.O. Digital</h2><p class="bo-export-note">Os PINs são individuais e exibidos somente no momento da geração/reset.</p></div><div class="bo-control-actions" style="margin-top:12px"><button class="bo-btn-primary" id="boGeneratePins">Gerar PINs faltantes</button></div><div id="boPinIssued"></div><div id="boPinList" class="bo-pin-list" style="margin-top:12px"></div></section>':'')+
      '</div><dialog id="boReviewDialog" class="bo-review-dialog"><div class="bo-review-inner"><div class="bo-review-header"><div><p class="eyebrow">DETALHE DO B.O.</p><h2 id="boDialogTitle"></h2></div><button id="boDialogClose" aria-label="Fechar">×</button></div><div id="boDialogBody"></div></div></dialog>';
  }
  function renderShell(){
    $('boControlView').innerHTML=shellHtml();$('boStatus').value=activeStatus;$('boStatus').onchange=()=>{activeStatus=$('boStatus').value;load();};let t;$('boSearch').oninput=()=>{clearTimeout(t);t=setTimeout(load,250);};$('boRefresh').onclick=load;$('boExportPa').onclick=()=>exportData('pa');$('boExportDaily').onclick=()=>exportData('daily');$('boDialogClose').onclick=()=>$('boReviewDialog').close();if(permissions&&permissions.can_manage_pins){$('boGeneratePins').onclick=generateMissingPins;loadPins();}
  }
  async function load(){
    try{const d=await call('dashboard',{status:activeStatus,search:$('boSearch')?$('boSearch').value:''});rows=d.occurrences||[];$('boCountPending').textContent=d.counts.pending||0;$('boCountValidated').textContent=d.counts.validated||0;$('boCountReturned').textContent=d.counts.returned||0;const body=$('boTableBody');body.innerHTML=rows.map(r=>'<tr><td><strong>'+esc(r.bo_number)+'</strong></td><td>'+fmtDate(r.occurrence_date)+'<br><small>'+esc(String(r.occurrence_time||'').slice(0,5))+'</small></td><td>'+esc(r.conferencer&&r.conferencer.display_name||'—')+'</td><td>'+esc(r.employee_name)+'</td><td>'+esc(r.shift)+'</td><td>'+esc(r.reason)+'</td><td>'+esc(r.location)+'</td><td><span class="bo-badge '+r.status+'">'+statusLabel(r.status)+'</span></td><td><button class="bo-btn-secondary" data-open="'+r.id+'">Visualizar</button></td></tr>').join('');$('boEmpty').classList.toggle('hidden',rows.length>0);body.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openRow(Number(b.dataset.open)));}catch(e){showToast(e.message,true);}
  }
  function openRow(id){
    selected=rows.find(r=>Number(r.id)===id);if(!selected)return;$('boDialogTitle').textContent=selected.bo_number;const items=(selected.items||[]).slice().sort((a,b)=>a.line_no-b.line_no);
    let html='<div class="bo-review-card"><div><div class="bo-review-meta">'+
      '<div><span>Conferente</span><strong>'+esc(selected.conferencer&&selected.conferencer.display_name||'—')+'</strong></div>'+
      '<div><span>Data / hora</span><strong>'+fmtDate(selected.occurrence_date)+' · '+esc(String(selected.occurrence_time||'').slice(0,5))+'</strong></div>'+
      '<div><span>Turno / tipo</span><strong>'+esc(selected.shift)+' · '+esc(selected.movement_type)+'</strong></div>'+
      '<div><span>Local</span><strong>'+esc(selected.location)+'</strong></div>'+
      '<div><span>Funcionário</span><strong>'+esc(selected.employee_name)+'</strong></div>'+
      '<div><span>Função</span><strong>'+esc(selected.employee_function)+'</strong></div>'+
      '<div><span>Motivo</span><strong>'+esc(selected.reason)+'</strong></div>'+
      '<div><span>Responsável</span><strong>'+esc(selected.responsibility)+'</strong></div></div>'+
      (selected.comments?'<p><strong>Comentários:</strong> '+esc(selected.comments)+'</p>':'')+
      (selected.interview_report?'<p><strong>Entrevista:</strong> '+esc(selected.interview_report)+'</p>':'')+
      (selected.validation_comment?'<p><strong>Retorno do Controle:</strong> '+esc(selected.validation_comment)+'</p>':'')+
      '</div><div><table class="bo-review-products"><thead><tr><th>Código</th><th>Descrição</th><th>Total</th><th>Reemb.</th><th>Descarte</th></tr></thead><tbody>'+
      items.map(x=>'<tr><td><strong>'+esc(x.sku_code)+'</strong></td><td>'+esc(x.sku_name)+'</td><td>'+num(x.total_qty)+'</td><td>'+num(x.repacked_qty)+'</td><td>'+num(x.discarded_qty)+'</td></tr>').join('')+
      '</tbody></table></div></div>';
    if(selected.status==='pending'&&permissions&&permissions.can_validate)html+='<label style="display:grid;gap:6px;margin-top:16px;font-weight:700;font-size:12px">Comentário do Controle<textarea id="boReviewComment" rows="3" placeholder="Obrigatório somente para devolver ao conferente"></textarea></label><div class="bo-review-actions"><button class="bo-btn-danger" id="boReturnButton">Devolver para correção</button><button class="bo-btn-primary" id="boValidateButton">Validar B.O.</button></div>';
    $('boDialogBody').innerHTML=html;if($('boReturnButton'))$('boReturnButton').onclick=()=>review('returned');if($('boValidateButton'))$('boValidateButton').onclick=()=>review('validated');$('boReviewDialog').showModal();
  }
  async function review(decision){try{await call('review',{id:selected.id,decision,comment:$('boReviewComment')?$('boReviewComment').value:''});$('boReviewDialog').close();showToast(decision==='validated'?'B.O. validado com sucesso.':'B.O. devolvido ao conferente.');await load();}catch(e){showToast(e.message,true);}}
  async function exportData(kind){try{const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}),payload=kind==='daily'?{from:today,to:today}:{};const d=await call('export',payload);if(kind==='daily')downloadCsv('informativo-quebra-'+today+'.csv',d.daily);else downloadCsv('pa-bo-validados.csv',d.pa);}catch(e){showToast(e.message,true);}}
  async function loadPins(){try{const d=await call('pin_status');$('boPinList').innerHTML=d.conferencers.map(x=>'<div class="bo-pin-item"><div><strong>'+esc(x.display_name)+'</strong><small style="display:block;color:#777">'+(x.pin_ready?'PIN configurado':'PIN pendente')+'</small></div><button class="bo-btn-secondary" data-reset="'+x.id+'">'+(x.pin_ready?'Resetar PIN':'Gerar PIN')+'</button></div>').join('');$('boPinList').querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>resetPin(b.dataset.reset));}catch(e){showToast(e.message,true);}}
  function showIssued(items){$('boPinIssued').innerHTML=items&&items.length?'<div class="bo-pin-issued"><strong>Copie agora — estes PINs não serão exibidos novamente:</strong>'+items.map(x=>'<p>'+esc(x.display_name)+' — <code>'+esc(x.pin)+'</code></p>').join('')+'</div>':'';}
  async function generateMissingPins(){try{const d=await call('generate_missing_pins');showIssued(d.issued||[]);await loadPins();if(!d.issued||!d.issued.length)showToast('Todos os conferentes já possuem PIN.');}catch(e){showToast(e.message,true);}}
  async function resetPin(id){try{const d=await call('reset_pin',{id});showIssued([d.issued]);await loadPins();}catch(e){showToast(e.message,true);}}
  async function open(){setHeader();$('boControlView').innerHTML='<div class="bo-empty">Carregando Controle de B.O.…</div>';try{permissions=await call('permissions');if(!permissions.can_validate){$('boControlView').innerHTML='<section class="bo-control-panel"><strong>Acesso restrito.</strong><p>Somente o Controle e a administração podem validar B.O.s.</p></section>';return;}renderShell();await load();}catch(e){$('boControlView').innerHTML='<section class="bo-control-panel"><p class="form-error">'+esc(e.message)+'</p></section>';}}
  window.__boControl={open};
})();