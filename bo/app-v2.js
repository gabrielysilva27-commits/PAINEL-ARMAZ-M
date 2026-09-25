(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const LOCATIONS=['Picking','Análise/Bloqueio','Repack','Saroba','Descarga','Retornável','Estacionamento - Rota','Devolução - Rota','Carregamento - Puxada','Descartável','Pulmões/Descarga','Vasilhame'];
  const REASONS=['Falha no Manuseio','Falta','Falta de fitilho','Vencido','Consumo interno','Avaria','Falha manobrista','Descarte repack','Quebra ao descarregar','Sem tampa/Liq. pela metade','Produto sem gás','Quebra ao carregar','Embalagem secundária','Corrosão','Outros'];
  const RESPONSIBILITIES=['Conferente','SVA','COA','GOD'];
  const $=id=>document.getElementById(id);
  let token=sessionStorage.getItem('bo_token')||'',conferencer=null,shift='',movement='',subjectType='Funcionário',editingOccurrence=null,confrontSource=null,employeeTimer=null,skuTimers=new WeakMap();

  async function call(action,payload={},auth=true){
    const headers={'Content-Type':'application/json'};if(auth&&token)headers['x-bo-token']=token;
    const r=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro no B.O. Digital');return d;
  }
  function toast(msg,error=false){const t=$('toast');t.textContent=msg;t.classList.toggle('error',error);t.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add('hidden'),3200);}
  function show(id){for(const x of ['loginView','formView','successView','historyView','confrontView'])$(x).classList.toggle('hidden',x!==id);}
  function today(){return new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});}
  function nowTime(){return new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});}
  function needsInterview(){return subjectType==='Funcionário'&&$('reasonSelect').value.startsWith('Quebra ao ');}
  function updateInterview(){const required=needsInterview();$('interviewWrap').classList.toggle('hidden',!required);$('interviewReport').required=required;}
  function setSubjectType(value){subjectType=value||'Funcionário';$('subjectOptions').querySelectorAll('button[data-value]').forEach(b=>b.classList.toggle('active',b.dataset.value===subjectType));const isEmployee=subjectType==='Funcionário',isFactory=subjectType==='Fábrica';$('employeeFields').classList.toggle('hidden',!isEmployee);$('factoryWrap').classList.toggle('hidden',!isFactory);$('warehouseHint').classList.toggle('hidden',subjectType!=='Armazém');$('employeeInput').required=isEmployee;$('employeeFunction').required=isEmployee;$('factoryInput').required=isFactory;if(!isEmployee){$('employeeInput').value='';$('employeeFunction').value='';$('employeeResults').classList.add('hidden');}if(!isFactory)$('factoryInput').value='';updateInterview();}
  function initSelects(){for(const v of LOCATIONS)$('locationSelect').add(new Option(v,v));for(const v of REASONS)$('reasonSelect').add(new Option(v,v));for(const v of RESPONSIBILITIES)$('responsibilitySelect').add(new Option(v,v));}
  function segmented(id,setter){$(id).addEventListener('click',e=>{const b=e.target.closest('button[data-value]');if(!b)return;$(id).querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));setter(b.dataset.value||'');});}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  async function loadConferencers(){
    try{const d=await call('conferencers',{},false);$('conferencerSelect').innerHTML='<option value="">Selecione...</option>'+d.conferencers.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.display_name)+'</option>').join('');}
    catch(e){$('loginError').textContent=e.message;}
  }
  async function restore(){if(!token)return show('loginView');try{const d=await call('bo_session');conferencer=d.conferencer;enter();}catch{token='';sessionStorage.removeItem('bo_token');show('loginView');}}
  function enter(){show('formView');$('loggedName').textContent='Conferente: '+conferencer.display_name;resetForm();}

  $('pinForm').onsubmit=async e=>{e.preventDefault();const b=$('pinButton');b.disabled=true;$('loginError').textContent='';try{const d=await call('pin_login',{conferencer_id:$('conferencerSelect').value,pin:$('pinInput').value},false);token=d.token;conferencer=d.conferencer;sessionStorage.setItem('bo_token',token);$('pinInput').value='';enter();}catch(err){$('loginError').textContent=err.message;}finally{b.disabled=false;}};
  $('logoutButton').onclick=async()=>{try{await call('bo_logout')}catch{}token='';conferencer=null;sessionStorage.removeItem('bo_token');show('loginView');};
  function updateShiftFlowNotice(){
    const box=$('shiftFlowNotice');if(!box)return;
    if(confrontSource){
      box.classList.remove('hidden','turn-c');
      box.classList.add('turn-a');
      box.innerHTML='<strong>Confronto do Turno A</strong><span>Confira a repecagem do B.O. do Turno C. Este registro será o resultado oficial após validação do Controle.</span>';
    }else if(shift==='C'){
      box.classList.remove('hidden','turn-a');
      box.classList.add('turn-c');
      box.innerHTML='<strong>Turno C · registro de origem</strong><span>Este B.O. ficará visível no histórico e no Controle, mas não entra na PA/Informativo. O Turno A fará a repecagem em “Confrontos Turno C”.</span>';
    }else{
      box.classList.add('hidden');box.classList.remove('turn-a','turn-c');box.innerHTML='';
    }
  }
  segmented('shiftOptions',v=>{shift=v;updateShiftFlowNotice();});segmented('movementOptions',v=>movement=v);segmented('subjectOptions',v=>setSubjectType(v));
  $('reasonSelect').onchange=updateInterview;

  $('employeeInput').addEventListener('input',()=>{clearTimeout(employeeTimer);$('employeeFunction').value='';const q=$('employeeInput').value.trim();if(q.length<2){$('employeeResults').classList.add('hidden');return;}employeeTimer=setTimeout(async()=>{try{const d=await call('employee_search',{query:q});$('employeeResults').innerHTML=d.employees.map(x=>'<button type="button" class="search-result" data-name="'+escapeHtml(x.employee_name)+'" data-job="'+escapeHtml(x.job_title)+'" data-shift="'+escapeHtml(x.shift||'')+'"><strong>'+escapeHtml(x.employee_name)+'</strong><small>'+escapeHtml(x.job_title)+(x.shift?' · Turno '+escapeHtml(x.shift):'')+'</small></button>').join('')||'<div class="search-result">Nenhum funcionário encontrado.</div>';$('employeeResults').classList.remove('hidden');}catch(e){toast(e.message,true);}},260);});
  $('employeeResults').onclick=e=>{const b=e.target.closest('button[data-name]');if(!b)return;$('employeeInput').value=b.dataset.name;$('employeeFunction').value=b.dataset.job;$('employeeResults').classList.add('hidden');if(!shift&&b.dataset.shift){const sb=$('shiftOptions').querySelector('[data-value="'+b.dataset.shift+'"]');sb?.click();}};

  function addItem(values={}){
    const node=$('itemTemplate').content.firstElementChild.cloneNode(true),list=$('itemsList');list.appendChild(node);
    const renumber=()=>[...list.children].forEach((x,i)=>x.querySelector('.item-title').textContent='Produto '+(i+1));renumber();
    node.querySelector('.remove-item').onclick=()=>{if(list.children.length===1)return toast('O B.O. precisa ter pelo menos um produto.',true);node.remove();renumber();};
    const code=node.querySelector('.sku-input'),name=node.querySelector('.sku-name'),results=node.querySelector('.sku-results');
    code.value=values.sku_code||'';name.value=values.sku_name||'';node.querySelector('.qty-total').value=values.total_qty||'';node.querySelector('.qty-repacked').value=values.repacked_qty??0;node.querySelector('.qty-discarded').value=values.discarded_qty??0;node.querySelector('.invoice-number').value=values.invoice_number||'';node.querySelector('.lot-number').value=values.lot_number||'';node.querySelector('.expiry-date').value=values.expiry_date||'';
    code.addEventListener('input',()=>{name.value='';clearTimeout(skuTimers.get(code));const q=code.value.trim();if(!q){results.classList.add('hidden');return;}skuTimers.set(code,setTimeout(async()=>{try{const d=await call('catalog_search',{query:q});results.innerHTML=d.items.map(x=>'<button type="button" class="search-result" data-code="'+escapeHtml(x.sku_code)+'" data-name="'+escapeHtml(x.sku_name)+'"><strong>'+escapeHtml(x.sku_code)+'</strong><small>'+escapeHtml(x.sku_name)+'</small></button>').join('')||'<div class="search-result">Código não encontrado no 01.11.</div>';results.classList.remove('hidden');}catch(e){toast(e.message,true);}},220));});
    results.onclick=e=>{const b=e.target.closest('button[data-code]');if(!b)return;code.value=b.dataset.code;name.value=b.dataset.name;results.classList.add('hidden');};
  }
  $('addProductButton').onclick=()=>addItem();

  function updateEditingUi(){
    const editing=!!editingOccurrence,confronting=!!confrontSource;
    $('editingBanner').classList.toggle('hidden',!editing&&!confronting);
    if(confronting){
      $('editingTitle').textContent='Confrontando '+confrontSource.bo_number+' · Turno C';
      $('editingSubtitle').textContent='Registre o resultado encontrado pelo Turno A. Este será o B.O. oficial para indicadores e baixas.';
    }else if(editing){
      $('editingTitle').textContent='Editando '+editingOccurrence.bo_number;
      $('editingSubtitle').textContent=editingOccurrence.status==='returned'?'Corrija o B.O. devolvido e reenvie para validação.':'Enquanto estiver pendente, você pode alterar o B.O.';
    }
    $('shiftOptions').querySelectorAll('button').forEach(b=>{b.disabled=confronting&&b.dataset.value!=='A';});
    $('submitButton').textContent=confronting?'Salvar confronto do Turno A':editing?'Salvar alterações':'Enviar B.O.';
    updateShiftFlowNotice();
  }
  function resetForm(clearEditing=true){
    if(clearEditing){editingOccurrence=null;confrontSource=null;}
    $('boForm').reset();shift='';movement='';subjectType='Funcionário';$('shiftOptions').querySelectorAll('button').forEach(x=>x.classList.remove('active'));$('movementOptions').querySelectorAll('button').forEach(x=>x.classList.remove('active'));$('occurrenceDate').value=today();$('occurrenceTime').value=nowTime();$('employeeFunction').value='';$('itemsList').innerHTML='';addItem();$('formError').textContent='';setSubjectType('Funcionário');updateEditingUi();updateShiftFlowNotice();
  }
  function editOccurrence(row){
    confrontSource=null;editingOccurrence=row;
    resetForm(false);
    $('occurrenceDate').value=String(row.occurrence_date||'').slice(0,10);
    $('occurrenceTime').value=String(row.occurrence_time||'').slice(0,5);
    const sb=$('shiftOptions').querySelector('[data-value="'+row.shift+'"]');if(sb)sb.click();
    const mb=$('movementOptions').querySelector('[data-value="'+row.movement_type+'"]');if(mb)mb.click();
    setSubjectType(row.subject_type||'Funcionário');
    $('locationSelect').value=row.location||'';
    $('employeeInput').value=row.employee_name||'';
    $('employeeFunction').value=row.employee_function||'';
    $('factoryInput').value=row.factory_name||'';
    $('reasonSelect').value=row.reason||'';
    $('responsibilitySelect').value=row.responsibility||'';
    $('comments').value=row.comments||'';
    $('interviewReport').value=row.interview_report||'';
    updateInterview();
    $('itemsList').innerHTML='';
    (row.items||[]).sort((a,b)=>(a.line_no||0)-(b.line_no||0)).forEach(item=>addItem(item));
    if(!$('itemsList').children.length)addItem();
    updateEditingUi();show('formView');window.scrollTo({top:0,behavior:'smooth'});
  }
  function startConfront(row){
    editingOccurrence=null;confrontSource=row;resetForm(false);
    $('occurrenceDate').value=today();$('occurrenceTime').value=nowTime();
    const sb=$('shiftOptions').querySelector('[data-value="A"]');if(sb)sb.click();
    const mb=$('movementOptions').querySelector('[data-value="'+row.movement_type+'"]');if(mb)mb.click();
    setSubjectType(row.subject_type||'Funcionário');
    $('locationSelect').value=row.location||'';
    $('employeeInput').value=row.employee_name||'';
    $('employeeFunction').value=row.employee_function||'';
    $('factoryInput').value=row.factory_name||'';
    $('reasonSelect').value=row.reason||'';
    $('responsibilitySelect').value=row.responsibility||'';
    $('comments').value=row.comments||'';
    $('interviewReport').value=row.interview_report||'';
    updateInterview();$('itemsList').innerHTML='';
    (row.items||[]).slice().sort((a,b)=>(a.line_no||0)-(b.line_no||0)).forEach(item=>addItem(item));
    if(!$('itemsList').children.length)addItem();
    updateEditingUi();show('formView');window.scrollTo({top:0,behavior:'smooth'});
  }
  function collect(){
    if(!shift)throw new Error('Selecione o turno.');if(!movement)throw new Error('Selecione Entrada ou Saída.');
    const items=[...$('itemsList').children].map(card=>({sku_code:card.querySelector('.sku-input').value,total_qty:card.querySelector('.qty-total').value,repacked_qty:card.querySelector('.qty-repacked').value,discarded_qty:card.querySelector('.qty-discarded').value,invoice_number:card.querySelector('.invoice-number').value,lot_number:card.querySelector('.lot-number').value,expiry_date:card.querySelector('.expiry-date').value}));
    return{occurrence_date:$('occurrenceDate').value,occurrence_time:$('occurrenceTime').value,shift,movement_type:movement,location:$('locationSelect').value,subject_type:subjectType,factory_name:$('factoryInput').value,employee_name:$('employeeInput').value,employee_function:$('employeeFunction').value,reason:$('reasonSelect').value,responsibility:$('responsibilitySelect').value,comments:$('comments').value,interview_report:$('interviewReport').value,items};
  }
  $('boForm').onsubmit=async e=>{e.preventDefault();const b=$('submitButton');$('formError').textContent='';const editing=!!editingOccurrence,confronting=!!confrontSource;try{b.disabled=true;b.textContent=confronting?'Salvando confronto...':editing?'Salvando...':'Enviando...';const occurrence=collect();const d=confronting?await call('confront_submit',{source_id:confrontSource.id,occurrence}):editing?await call('update_occurrence',{id:editingOccurrence.id,occurrence}):await call('submit',{occurrence});$('successNumber').textContent=d.occurrence.bo_number;$('successMessage').textContent=confronting?'Confronto do Turno A registrado. O B.O. do Turno C permanece no histórico e este novo B.O. passa a ser o resultado oficial.':editing?'As alterações foram salvas e o B.O. voltou para a fila de validação.':(occurrence.shift==='C'?'Registro do Turno C salvo. Ele aguardará o confronto do Turno A antes de entrar nos indicadores oficiais.':'O registro foi enviado para validação do Controle.');editingOccurrence=null;confrontSource=null;show('successView');}catch(err){$('formError').textContent=err.message;window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});}finally{b.disabled=false;updateEditingUi();}};
  $('newBoButton').onclick=()=>{show('formView');resetForm();};$('successHistoryButton').onclick=()=>openHistory();$('historyButton').onclick=()=>openHistory();$('confrontButton').onclick=()=>openConfrontQueue();$('historyConfrontButton').onclick=()=>openConfrontQueue();$('backFromConfrontButton').onclick=()=>{show('formView');resetForm();};$('backToFormButton').onclick=()=>{show('formView');resetForm();};$('cancelEditButton').onclick=()=>{editingOccurrence=null;confrontSource=null;openHistory();};

  async function deleteOccurrence(row){
    if(!confirm('Excluir '+row.bo_number+'?\n\nEle deixará de aparecer como pendente e não poderá ser usado na PA ou no Informativo.'))return;
    try{await call('delete_occurrence',{id:row.id});toast('B.O. excluído.');await openHistory();}catch(e){toast(e.message,true);}
  }
  async function openConfrontQueue(){
    editingOccurrence=null;confrontSource=null;show('confrontView');$('confrontList').innerHTML='<div class="history-card">Carregando B.O.s do Turno C...</div>';
    try{
      const d=await call('confront_queue'),rows=d.occurrences||[];
      $('confrontList').innerHTML=rows.length?rows.map(row=>{
        const itemSummary=(row.items||[]).slice(0,3).map(x=>escapeHtml(x.sku_code)+' · '+escapeHtml(x.sku_name)+' ('+escapeHtml(x.total_qty)+')').join('<br>');
        return '<article class="history-card confront-card" data-confront-card="'+row.id+'" role="button" tabindex="0" aria-label="Abrir confronto do '+escapeHtml(row.bo_number)+'"><div class="history-top"><div><strong>'+escapeHtml(row.bo_number)+'</strong><span class="confront-origin">Turno C · aguardando confronto</span></div><span class="status pending">Pendente</span></div><p>'+escapeHtml(row.reason)+' · '+escapeHtml(row.location)+' · '+escapeHtml(row.occurrence_date)+'</p><div class="confront-items">'+itemSummary+((row.items||[]).length>3?'<br>+'+((row.items||[]).length-3)+' produto(s)':'')+'</div><div class="confront-open-hint">Toque para abrir confronto <span aria-hidden="true">→</span></div></article>';
      }).join(''):'<div class="history-card"><strong>Nenhum confronto pendente.</strong><p>Quando o Turno C registrar um B.O., ele aparecerá aqui para a repecagem do Turno A.</p></div>';
      $('confrontList').querySelectorAll('[data-confront-card]').forEach(card=>{
        const openCard=()=>{const row=rows.find(x=>String(x.id)===card.dataset.confrontCard);if(row)startConfront(row);};
        card.onclick=openCard;
        card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCard();}};
      });
    }catch(e){$('confrontList').innerHTML='<div class="history-card error">'+escapeHtml(e.message)+'</div>';}
  }

  async function openHistory(){
    editingOccurrence=null;show('historyView');$('historyList').innerHTML='<div class="history-card">Carregando...</div>';
    try{
      const d=await call('my_occurrences'),rows=d.occurrences||[];
      const labels={pending:'Pendente',validated:'Validado',returned:'Devolvido',cancelled:'Excluído'};
      $('historyList').innerHTML=rows.length?rows.map(row=>{
        const cOrigin=row.record_kind==='turn_c_origin',official=row.record_kind==='turn_a_confront';
        const editable=(row.status==='pending'||row.status==='returned')&&(!cOrigin||row.confront_state!=='completed');
        const origin=(row.subject_type||'Funcionário')+(row.subject_type==='Fábrica'&&row.factory_name?' · '+row.factory_name:'');
        const flow=cOrigin?(row.confront_state==='completed'?'Turno C · confrontado pelo A':'Turno C · aguardando confronto'):(official?'Turno A · resultado oficial de '+escapeHtml(row.source?.bo_number||'B.O. do Turno C'):'Turno '+escapeHtml(row.shift));
        const label=cOrigin?(row.confront_state==='completed'?'Confrontado':'Aguardando confronto'):(labels[row.status]||row.status);
        const cls=cOrigin?(row.confront_state==='completed'?'validated':'pending'):row.status;
        return '<article class="history-card '+(row.status==='cancelled'?'cancelled':'')+'"><div class="history-top"><div><strong>'+escapeHtml(row.bo_number)+'</strong><span class="confront-origin">'+flow+'</span></div><span class="status '+cls+'">'+escapeHtml(label)+'</span></div><p>'+escapeHtml(row.reason)+' · '+escapeHtml(row.location)+' · '+escapeHtml(origin)+'</p><small>'+escapeHtml(row.occurrence_date)+' · '+(row.items?.length||0)+' produto(s)'+(row.validation_comment?' · '+escapeHtml(row.validation_comment):'')+'</small>'+(editable?'<div class="history-actions"><button type="button" data-edit="'+row.id+'">'+(row.status==='returned'?'Corrigir':'Editar')+'</button><button type="button" class="danger" data-delete="'+row.id+'">Excluir</button></div>':'')+'</article>';
      }).join(''):'<div class="history-card">Nenhum B.O. registrado por você ainda.</div>';
      $('historyList').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const row=rows.find(x=>String(x.id)===b.dataset.edit);if(row)editOccurrence(row);});
      $('historyList').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{const row=rows.find(x=>String(x.id)===b.dataset.delete);if(row)deleteOccurrence(row);});
    }catch(e){$('historyList').innerHTML='<div class="history-card error">'+escapeHtml(e.message)+'</div>';}
  }
  initSelects();loadConferencers();restore();
})();