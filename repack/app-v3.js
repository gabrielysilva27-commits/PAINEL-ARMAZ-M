(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/repack-api';
  const PUB='sb_publishable_W8fSiZaa-n_tM1YhhsdVfQ_WErczC8K';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={bombona:'Despejo · Bombona',repack:'Repack',bag:'BAG',devolucao:'Devolução'};
  let token=sessionStorage.getItem('repack_token')||'',worker=null,home=null,processType='repack',tick=null;

  async function call(action,payload={},auth=true){
    const h={'Content-Type':'application/json','apikey':PUB};if(auth&&token)h['x-repack-token']=token;
    const r=await fetch(API,{method:'POST',headers:h,body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro no Repack');return d;
  }
  function toast(msg,error=false){const t=$('toast');t.textContent=msg;t.classList.toggle('error',error);t.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add('hidden'),3200)}
  function show(which){$('loginView').classList.toggle('hidden',which!=='login');$('homeView').classList.toggle('hidden',which!=='home')}
  const localTime=v=>new Date(v).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
  const localDate=v=>new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
  function fmtSeconds(s){s=Math.max(0,Math.floor(Number(s||0)));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}
  function fmtPerBox(t){const q=Number(t.quantity_boxes||0),s=Number(t.duration_seconds||0);if(!q||!s)return'—';const x=s/q,unit=t.channel==='bombona'?'UN':'CX';return`${Math.floor(x/60)}m ${String(Math.round(x%60)).padStart(2,'0')}s/${unit}`}
  function updateQuantityUI(task=null){const isDes=task?task.channel==='bombona':processType==='despejo';if($('quantityTitle'))$('quantityTitle').textContent=isDes?'Quantidade de unidades':'Quantidade de caixas';if($('quantityInput'))$('quantityInput').placeholder=isDes?'Ex.: 30 unidades':'Ex.: 25 caixas'}

  async function loadWorkers(){try{const d=await call('worker_list',{},false),list=d.workers||[];$('workerSelect').innerHTML='<option value="">Selecione...</option>'+list.map(x=>`<option value="${esc(x.id)}">${esc(x.display_name)}</option>`).join('');if(!list.length)$('loginError').textContent='Nenhum ajudante cadastrado. Solicite o cadastro no Painel Repack.'}catch(e){$('loginError').textContent=e.message}}
  async function restore(){if(!token)return show('login');try{const d=await call('worker_session');worker=d.worker;home=d.home;$('loggedWorker').textContent='Ajudante: '+worker.display_name;show('home');renderHome()}catch{token='';worker=null;home=null;sessionStorage.removeItem('repack_token');show('login')}}

  $('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';const b=$('loginButton');b.disabled=true;try{const d=await call('worker_login',{worker_id:$('workerSelect').value,pin:$('pinInput').value},false);token=d.token;worker=d.worker;home=d.home;sessionStorage.setItem('repack_token',token);$('pinInput').value='';$('loggedWorker').textContent='Ajudante: '+worker.display_name;show('home');renderHome()}catch(err){$('loginError').textContent=err.message}finally{b.disabled=false}};
  $('logoutButton').onclick=async()=>{try{await call('worker_logout')}catch{}token='';worker=null;home=null;sessionStorage.removeItem('repack_token');clearInterval(tick);show('login')};
  $('refreshButton').onclick=refresh;
  async function refresh(){try{const d=await call('worker_home');home=d.home;renderHome()}catch(e){toast(e.message,true)}}

  document.querySelectorAll('[data-process]').forEach(b=>b.onclick=()=>{processType=b.dataset.process;document.querySelectorAll('[data-process]').forEach(x=>x.classList.toggle('active',x===b));$('repackFields').classList.toggle('hidden',processType!=='repack');$('despejoTargetHint').classList.toggle('hidden',processType!=='despejo');updateQuantityUI()});
  $('channelSelect').onchange=()=>{if($('channelSelect').value==='bag')$('packagingSelect').value='BAG';updateTargetHint()};
  $('packagingSelect').onchange=updateTargetHint;
  function fillTargets(){const cur=$('packagingSelect').value;$('packagingSelect').innerHTML='<option value="">Não informar</option>'+(home?.targets||[]).map(x=>`<option value="${esc(x.packaging_code)}">${esc(x.packaging_code)} · ${Math.floor(Number(x.target_seconds_per_box)/60)}m ${String(Number(x.target_seconds_per_box)%60).padStart(2,'0')}s/CX</option>`).join('');if([...$('packagingSelect').options].some(o=>o.value===cur))$('packagingSelect').value=cur;updateTargetHint()}
  function updateTargetHint(){const code=$('packagingSelect').value,target=(home?.targets||[]).find(x=>x.packaging_code===code),sec=target?Number(target.target_seconds_per_box):Number(home?.default_target_seconds_per_box||170);$('targetHint').textContent=(code?'Meta '+code:'Meta base')+`: ${Math.floor(sec/60)}m ${String(sec%60).padStart(2,'0')}s por caixa.`}

  $('startButton').onclick=async()=>{const b=$('startButton');$('startError').textContent='';b.disabled=true;try{const channel=processType==='despejo'?'bombona':$('channelSelect').value,packaging=processType==='repack'?$('packagingSelect').value:'';await call('worker_start',{process_type:processType,channel,packaging_code:packaging});toast('Cronômetro iniciado.');await refresh()}catch(e){$('startError').textContent=e.message}finally{b.disabled=false}};
  $('finishButton').onclick=async()=>{const t=home?.active,b=$('finishButton');$('finishError').textContent='';const qty=Number($('quantityInput').value);if(!t)return;if(!qty||qty<=0){$('finishError').textContent=t.channel==='bombona'?'Informe a quantidade de unidades.':'Informe a quantidade de caixas.';return}b.disabled=true;try{const d=await call('worker_finish',{task_id:t.id,quantity_boxes:qty,notes:$('notesInput').value});home=d.home;$('quantityInput').value='';$('notesInput').value='';toast('Atividade salva.');renderHome()}catch(e){$('finishError').textContent=e.message}finally{b.disabled=false}};
  $('cancelButton').onclick=async()=>{const t=home?.active;if(!t||!confirm('Cancelar este cronômetro? A tarefa ficará registrada como cancelada e não entrará na produtividade.'))return;try{const d=await call('worker_cancel',{task_id:t.id});home=d.home;toast('Cronômetro cancelado.');renderHome()}catch(e){toast(e.message,true)}};

  function renderHome(){fillTargets();const t=home?.active;$('newTaskCard').classList.toggle('hidden',!!t);$('activeTaskCard').classList.toggle('hidden',!t);if(t){$('activeLabel').textContent=labels[t.channel]||t.channel;$('activeMeta').textContent=t.packaging_code?'Embalagem: '+t.packaging_code:'Sem embalagem informada';$('startedAt').textContent=localTime(t.started_at);updateQuantityUI(t);runTimer(t.started_at)}else{updateQuantityUI();clearInterval(tick)}renderHistory()}
  function runTimer(start){clearInterval(tick);const draw=()=>{$('timerDisplay').textContent=fmtSeconds((Date.now()-new Date(start).getTime())/1000)};draw();tick=setInterval(draw,1000)}
  function renderHistory(){const rows=home?.history||[];$('historyList').innerHTML=rows.length?rows.map(t=>{const unit=t.channel==='bombona'?'UN':'CX';return`<article class="history-row"><div><strong>${esc(labels[t.channel]||t.channel)}</strong><span>${localDate(t.started_at)} · ${localTime(t.started_at)}${t.packaging_code?' · '+esc(t.packaging_code):''}</span></div><div><strong>${Number(t.quantity_boxes).toLocaleString('pt-BR',{maximumFractionDigits:3})} ${unit}</strong><span>${fmtSeconds(t.duration_seconds)} · ${fmtPerBox(t)}</span></div></article>`}).join(''):'<div class="empty">Nenhum apontamento concluído ainda.</div>'}

  loadWorkers();restore();
})();