(() => {
  const BO_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const TEMP_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/temperature-api';
  const $=id=>document.getElementById(id);
  const AREAS=[
    {name:'Câmara Fria',points:1,morningOnly:true,rule:'OK ≤ 5°C · Atenção 5,1–8,9°C · Crítico ≥ 9°C'},
    {name:'Retornável',points:2,rule:'OK ≤ 22°C · Atenção 22,1–25°C · Crítico > 25°C'},
    {name:'Descartável',points:2,rule:'OK ≤ 22°C · Atenção 22,1–25°C · Crítico > 25°C'},
    {name:'Repack',points:1,rule:'OK ≤ 22°C · Atenção 22,1–25°C · Crítico > 25°C'},
    {name:'Marketplace',points:1,rule:'OK ≤ 22°C · Atenção 22,1–25°C · Crítico > 25°C'}
  ];
  let token=sessionStorage.getItem('bo_token')||'',conferencer=null,shift='',existing=[];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const temp=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'°C';
  function toast(msg,error=false){const t=$('toast');t.textContent=msg;t.classList.toggle('error',error);t.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add('hidden'),3200);}
  function show(id){for(const x of ['loginView','formView'])$(x).classList.toggle('hidden',x!==id);}
  async function boCall(action,payload={},auth=true){
    const h={'Content-Type':'application/json'};if(auth&&token)h['x-bo-token']=token;
    const r=await fetch(BO_API,{method:'POST',headers:h,body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro de identificação');return d;
  }
  async function tempCall(action,payload={}){
    const r=await fetch(TEMP_API,{method:'POST',headers:{'Content-Type':'application/json','x-bo-token':token},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro no controle de temperatura');return d;
  }
  function statusFor(area,t){
    if(area==='Câmara Fria')return t<=5?'ok':t<9?'attention':'critical';
    return t<=22?'ok':t<=25?'attention':'critical';
  }
  function statusLabel(s){return s==='ok'?'OK':s==='attention'?'Atenção':'Crítico';}
  function areaList(){return AREAS.filter(a=>!a.morningOnly||shift==='MANHÃ');}
  function areaCard(a){
    return '<article class="area-card" data-area="'+esc(a.name)+'"><div class="area-head"><div><strong>'+esc(a.name)+'</strong><small>'+esc(a.rule)+'</small></div><span class="status ok">Aguardando</span></div>'+
      '<div class="temp-inputs '+(a.points===1?'one':'')+'"><label>Temperatura'+(a.points===2?' 1':'')+'<input class="temp-1" type="number" step="0.1" min="-20" max="60" inputmode="decimal" required /></label>'+
      (a.points===2?'<label>Temperatura 2<input class="temp-2" type="number" step="0.1" min="-20" max="60" inputmode="decimal" required /></label>':'')+
      '</div><div class="area-result"><div><small>Resultado</small><strong class="result-value">—</strong></div><span class="status result-status ok">—</span></div></article>';
  }
  function renderAreas(){
    $('areasGrid').innerHTML=areaList().map(areaCard).join('');
    $('areasGrid').querySelectorAll('.area-card').forEach(card=>{
      card.querySelectorAll('input').forEach(inp=>inp.addEventListener('input',()=>updateCard(card)));
    });
    applyExisting();
  }
  function updateCard(card){
    const area=card.dataset.area,a=AREAS.find(x=>x.name===area),v1=Number(card.querySelector('.temp-1').value),i2=card.querySelector('.temp-2'),v2=i2?Number(i2.value):null;
    const valid1=Number.isFinite(v1)&&card.querySelector('.temp-1').value!=='',valid2=!i2||(Number.isFinite(v2)&&i2.value!=='');
    const result=valid1&&valid2?(a.points===2?Math.max(v1,v2):v1):null;
    const rv=card.querySelector('.result-value'),rs=card.querySelector('.result-status');
    card.classList.remove('ok','attention','critical');rs.classList.remove('ok','attention','critical');
    if(result==null){rv.textContent='—';rs.textContent='—';rs.classList.add('ok');return;}
    const st=statusFor(area,result);rv.textContent=temp(result);rs.textContent=statusLabel(st);rs.classList.add(st);card.classList.add(st);
  }
  function setShift(value){
    shift=value;$('shiftOptions').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.value===shift));renderAreas();loadExisting();
  }
  function applyExisting(){
    if(!existing.length)return;
    for(const r of existing){
      const card=[...$('areasGrid').querySelectorAll('.area-card')].find(x=>x.dataset.area===r.area);if(!card)continue;
      card.querySelector('.temp-1').value=r.temp_1??'';
      const t2=card.querySelector('.temp-2');if(t2)t2.value=r.temp_2??'';
      updateCard(card);
    }
  }
  async function loadExisting(){
    if(!token||!shift||!$('readingDate').value)return;
    try{
      const d=await tempCall('shift_readings',{reading_date:$('readingDate').value,shift});existing=d.readings||[];
      $('existingNotice').classList.toggle('hidden',!existing.length);
      $('existingNotice').textContent=existing.length?'Já existem '+existing.length+' leitura(s) para esta data e turno. Ao salvar, o registro será atualizado.':'';
      renderAreas();
    }catch(e){if(/PIN expirado/i.test(e.message)){token='';sessionStorage.removeItem('bo_token');show('loginView');}else toast(e.message,true);}
  }
  function gather(){
    return areaList().map(a=>{
      const card=[...$('areasGrid').querySelectorAll('.area-card')].find(x=>x.dataset.area===a.name);
      return {area:a.name,temp_1:card.querySelector('.temp-1').value,temp_2:card.querySelector('.temp-2')?.value??null};
    });
  }
  async function loadHistory(){
    if(!token)return;
    try{
      const d=await tempCall('my_readings'),rows=d.readings||[];
      $('historyBody').innerHTML=rows.length?rows.map(r=>'<tr><td>'+date(r.reading_date)+'</td><td>'+esc(r.shift)+'</td><td>'+esc(r.area)+'</td><td><strong>'+temp(r.temperature)+'</strong></td><td><span class="status '+esc(r.status)+'">'+statusLabel(r.status)+'</span></td></tr>').join(''):'<tr><td colspan="5"><div class="empty">Nenhum registro no site ainda.</div></td></tr>';
    }catch(e){$('historyBody').innerHTML='<tr><td colspan="5"><div class="empty">'+esc(e.message)+'</div></td></tr>';}
  }
  async function loadConferencers(){
    try{const d=await boCall('conferencers',{},false);$('conferencerSelect').innerHTML='<option value="">Selecione...</option>'+d.conferencers.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.display_name)+'</option>').join('');}
    catch(e){$('loginError').textContent=e.message;}
  }
  function enter(){
    show('formView');$('loggedName').textContent='Conferente: '+conferencer.display_name;$('readingDate').value=today();
    const hour=Number(new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',hour12:false}).slice(0,2));
    setShift(hour<14?'MANHÃ':hour<22?'TARDE':'NOITE');loadHistory();
  }
  async function restore(){
    if(!token)return show('loginView');
    try{const d=await boCall('bo_session');conferencer=d.conferencer;enter();}
    catch{token='';sessionStorage.removeItem('bo_token');show('loginView');}
  }
  $('pinForm').onsubmit=async e=>{e.preventDefault();const b=$('pinButton');b.disabled=true;$('loginError').textContent='';try{const d=await boCall('pin_login',{conferencer_id:$('conferencerSelect').value,pin:$('pinInput').value},false);token=d.token;conferencer=d.conferencer;sessionStorage.setItem('bo_token',token);$('pinInput').value='';enter();}catch(err){$('loginError').textContent=err.message;}finally{b.disabled=false;}};
  $('logoutButton').onclick=()=>{token='';conferencer=null;sessionStorage.removeItem('bo_token');show('loginView');};
  $('shiftOptions').querySelectorAll('button').forEach(b=>b.onclick=()=>setShift(b.dataset.value));
  $('readingDate').onchange=loadExisting;
  $('refreshHistory').onclick=loadHistory;
  $('temperatureForm').onsubmit=async e=>{
    e.preventDefault();$('formError').textContent='';if(!shift)return $('formError').textContent='Selecione o turno.';
    const b=$('submitButton');b.disabled=true;
    try{
      const d=await tempCall('submit',{reading_date:$('readingDate').value,shift,readings:gather()});
      existing=d.readings||[];toast('Temperaturas salvas.');$('existingNotice').classList.remove('hidden');$('existingNotice').textContent='Registro salvo para '+shift+'.';applyExisting();loadHistory();
    }catch(err){$('formError').textContent=err.message;toast(err.message,true);}finally{b.disabled=false;}
  };
  loadConferencers();restore();
})();