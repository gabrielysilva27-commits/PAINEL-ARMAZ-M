(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const LOCATIONS=['Picking','Análise/Bloqueio','Repack','Saroba','Descarga','Retornável','Estacionamento - Rota','Devolução - Rota','Carregamento - Puxada','Descartável','Pulmões/Descarga','Vasilhame'];
  const REASONS=['Falha no Manuseio','Falta','Falta de fitilho','Vencido','Consumo interno','Avaria','Falha manobrista','Descarte repack','Quebra ao descarregar','Sem tampa/Liq. pela metade','Produto sem gás','Quebra ao carregar','Embalagem secundária','Corrosão','Outros'];
  const RESPONSIBILITIES=['Conferente','SVA','COA','GOD'];
  const $=id=>document.getElementById(id);
  let token=sessionStorage.getItem('bo_token')||'',conferencer=null,shift='',movement='',subjectType='Funcionário',employeeTimer=null,skuTimers=new WeakMap();

  async function call(action,payload={},auth=true){
    const headers={'Content-Type':'application/json'};if(auth&&token)headers['x-bo-token']=token;
    const r=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro no B.O. Digital');return d;
  }
  function toast(msg,error=false){const t=$('toast');t.textContent=msg;t.classList.toggle('error',error);t.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add('hidden'),3200);}
  function show(id){for(const x of ['loginView','formView','successView','historyView'])$(x).classList.toggle('hidden',x!==id);}
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
  segmented('shiftOptions',v=>shift=v);segmented('movementOptions',v=>movement=v);segmented('subjectOptions',v=>setSubjectType(v));
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

  function resetForm(){
    $('boForm').reset();shift='';movement='';subjectType='Funcionário';$('shiftOptions').querySelectorAll('button').forEach(x=>x.classList.remove('active'));$('movementOptions').querySelectorAll('button').forEach(x=>x.classList.remove('active'));$('occurrenceDate').value=today();$('occurrenceTime').value=nowTime();$('employeeFunction').value='';$('itemsList').innerHTML='';addItem();$('formError').textContent='';setSubjectType('Funcionário');
  }
  function collect(){
    if(!shift)throw new Error('Selecione o turno.');if(!movement)throw new Error('Selecione Entrada ou Saída.');
    const items=[...$('itemsList').children].map(card=>({sku_code:card.querySelector('.sku-input').value,total_qty:card.querySelector('.qty-total').value,repacked_qty:card.querySelector('.qty-repacked').value,discarded_qty:card.querySelector('.qty-discarded').value,invoice_number:card.querySelector('.invoice-number').value,lot_number:card.querySelector('.lot-number').value,expiry_date:card.querySelector('.expiry-date').value}));
    return{occurrence_date:$('occurrenceDate').value,occurrence_time:$('occurrenceTime').value,shift,movement_type:movement,location:$('locationSelect').value,subject_type:subjectType,factory_name:$('factoryInput').value,employee_name:$('employeeInput').value,employee_function:$('employeeFunction').value,reason:$('reasonSelect').value,responsibility:$('responsibilitySelect').value,comments:$('comments').value,interview_report:$('interviewReport').value,items};
  }
  $('boForm').onsubmit=async e=>{e.preventDefault();const b=$('submitButton');$('formError').textContent='';try{b.disabled=true;b.textContent='Enviando...';const d=await call('submit',{occurrence:collect()});$('successNumber').textContent=d.occurrence.bo_number;show('successView');}catch(err){$('formError').textContent=err.message;window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});}finally{b.disabled=false;b.textContent='Enviar B.O.';}};
  $('newBoButton').onclick=()=>{show('formView');resetForm();};$('successHistoryButton').onclick=()=>openHistory();$('historyButton').onclick=()=>openHistory();$('backToFormButton').onclick=()=>{show('formView');resetForm();};

  async function openHistory(){show('historyView');$('historyList').innerHTML='<div class="history-card">Carregando...</div>';try{const d=await call('my_occurrences');$('historyList').innerHTML=d.occurrences.length?d.occurrences.map(row=>'<article class="history-card"><div class="history-top"><strong>'+escapeHtml(row.bo_number)+'</strong><span class="status '+row.status+'">'+({pending:'Pendente',validated:'Validado',returned:'Devolvido'}[row.status]||row.status)+'</span></div><p>'+escapeHtml(row.reason)+' · '+escapeHtml(row.location)+' · Turno '+escapeHtml(row.shift)+'</p><small>'+escapeHtml(row.occurrence_date)+' · '+(row.items?.length||0)+' produto(s)'+(row.validation_comment?' · '+escapeHtml(row.validation_comment):'')+'</small></article>').join(''):'<div class="history-card">Nenhum B.O. registrado por você ainda.</div>';}catch(e){$('historyList').innerHTML='<div class="history-card error">'+escapeHtml(e.message)+'</div>';}}
  initSelects();loadConferencers();restore();
})();