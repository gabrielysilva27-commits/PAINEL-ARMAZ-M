(() => {
  const BO_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const BO_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/bo/';
  const NRI_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/receiving-nri-api';
  const PORTARIA_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/portaria/';
  const RECEBIMENTO_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/recebimento/';
  const PORTARIA_QR="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZoAAAGaAQAAAAAefbjOAAADBElEQVR4nO2cS27cMAyGP1YGupRvMEexb9AjBT1SbmAfJQcIYC8D2Pi7EP2YZJVOOy9Tm9gefxgJQ5A/SSkmvj36H99nIKCAAgoooIACek7IfFRYC9DX67N6NhiXF9qbTC+g60ONJGkAGM382ZCkDrCWJEnSOXS96QV0Pajyv2MNzSuor9NkzQBinI3m7acMwCBNV59eQFeHqk/31gy1ibFG/a+pEiOI8VbTC+jmUAkTVifRvFWuKNr/8U0B3TeUVTQD5Am/AmjkoUJarh5mTQFdAPUlrwBrx5+yl8H1pLVjBTCXVONW0wvo2jriayl7Nvo6AfnDIJ+/cOdrCugSiJJVNoNLCHV5wvPQEj+SpCFJXZ48S+3ufE0BXQKtPmKqjPxeGTkJSJM1rxWQ300wmxg9D737NQX0D6C+Bumt2otKsmQtQH+asDZ/hI44ALRGjSRJU0kp1JHkdcw11+iyfETUeGZoZxFett7kQrmagDwBWQod8fzQYhGbCQxQRKUG9wylWqHBXw6LeGrIf2QtPmLzB0VRNGsmso2wiGeG3EfsQsJSs/QUtIwkz0PDIo4BqcO3QbijIGn5YGmJvww3m15AN/IRJWBA0ZO7DRFbOAll+fTQrmYJpPM8VGf5xxDK8kBQf5LULTUos5pStfK+BmnvQR5kTQFdlmssUrJ0OLIWHZG3qlX4iONAxSmQp+ItymYZjyQApSWevKj9GGsK6LJO11hD3wIwV0CC0u4aZr+COfoax4H6OsledhrzbPQnL2V7H+wx1hTQpVVsTzMG1nRzKWYC3uGI7PPpoX11em8bsDU3yrNyGxZxDGg70wXMpt8nNwtr80RRls3qLR5jTQFdHDW83VUqleshrqVSub0cPuIQ0OiHOtWN66Ge0azc9rY1PG4zvYCuBn050wUYzWtt8uyzRjBXgglruutOL6A7gEqZaq1YZ/mhjd6qyD4PAH3WEaWA3WjdmL+KidhVdwxo3/Quvc915y1sxzfSTm2GRTw1ZPGfyQIKKKCAAgoooL+E/gCIxGsJZnpOtgAAAABJRU5ErkJggg==";
  const RECEBIMENTO_QR="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAcIAAAHCAQAAAABUY/ToAAADf0lEQVR4nO2cTYrcMBCFX8WGLGWYA/RR7BvkSEOOlBtYR8kBBuylQeZloV+7M1kM03T35NVCtGV/SIaiftU24mPiv30QBESKFClSpEiRIh+PtCQ9zIbdzAYAWM3ghz3eANb81HTn3Yp8SHIkSS5lejUDHGmvS0fOAGxCR5Lkkfz4miK/GLlm+zIuHcmlI7D2gB8Am7BbVKRokT5pTZFfk+TPAbAJgNllszTrQpy7zZoin5vsT9c2LnsPP3Sg/wEQiAPtTD7Xe4q8HZl1yBHAChDrAPofbwbgOw3urSfWl8B49767FfmIJNowGR0xLu8O+amRJOfnek+RtyOjHar2hf4SQCCAwGbwl83oLwHJVH3GmiK/Fpns0MhQZjoCjsn6XP2C7JDIkyRf5gIwMsRLzqUWlFJ9gLMLwLggP/Jc7ynydmT1ZTSsLwTWAYRbkG8EGAAY0IN+6IKN8712K/KBSW89ALcZ/IW012W3NLf2TdhtE3Y7kvfYrciHIpNnIgNq2NPOxWipeLV8KV8mskiNh7IiAZzjvRwKxaF5Tjok8oocf/ewaf3O1GllAGe3mdnQ0SYANq3Jtdl0792KfCgy1an9hYCPDbK9J9YBsec6zrsRaxcAbEY/3XW3Ih+RLAFzlzP6BSkKgksDZ8fYy48NfcVDIg+SohsXK9H5F7qoV7X42CqSdEhkK7moiHx0iCm65ozUJct6VYva0iGRjTRqUTWnTfBzNhZVSjok8kqyDlVLkxJ8oCrNUh4vyiUdEpkk9zrWl3hWyODekM8K7Uafy9IEABt/9bk5+1zvKfJ2ZHt+KJobVw1PqTHW4qOTLxN5lhrx1GI1ZxdSIjajtEMWAIDyMpFnOdWHctMsJfjZ8IRj1iYdEtlIiqkX5D+ZMR86i3F2Nkap7ig7JPJKWl/WJGLd4eBr7bS6oHOMIk9yskNIHiwg9zVCW4YshHRIZJFaH2rioTKkf7zmOjXky0ReC4+Sa9I1oy/BdrZX0iGRR2nqQ8gNsuzajl2yRb0Okf8gx1IB8kO+5a1PQZEfdqsOLUVGT/meIm9AHmLqEgo1YQ/QWCTZIZF/kbMOAWii61MFsilbS4dEvkPGzwy9cjPAbfG7Z+kbVi7k4ZPXFPnc5OH8UD3tWjL6UrtOB4sA1RhFnuQ6L0ttsTYRK9VG9e1FXonpG+ciRYoUKVKkyP+c/AM6jY+0M4EoLwAAAABJRU5ErkJggg==";
  const QR_DATA="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZoAAAGaAQAAAAAefbjOAAADAUlEQVR4nO2bQY6cMBBFX8VIszQ36KPAzaLcDI4yB4iEly0Z/SxsAzMZKUqi0JmmvLDohicKyfpVriqb+O0xf/l9BhxyyCGHHHLIoeeErI6OMo2pA1IHs3VAag+MDzHPofOhQZK0AMS7aYoZs9vdIGaAIEnSW+g88xw6H0qbABAErCYtUNUCing8zDyHHgZJr2ZAUHUYRSP+wZsc+hyQjQSZmRnDAtJr92voj97k0P8NRUkToG+3DMMSxHyTIN4NAEn5PXSeeQ6dBnGMGAkqi+GnqT0wSNL0n3+TQ38DFZ+wp7IFGc19KFcQMzo+cK55Dp0OVY0YdpcQM7soSEsQRFWhcI24FDQot1AyZjQBNrZ9KHMfSqjxqb7JoT+F9iRlD5pSh32VBDFj1gOwes7yAlCLLGNGU5Qk5c1X5HJXWqBO7jWuAVVfkcx2oYD0IhtTh43AMVf1Kb7Job+MLNtUMhNRAoI0bUJRFcQ14smhtiKWFjaWBETzJGWBaAlt8hXx7FDLUce7ifi9EwmAtROpQ7B2LXEZsGE61zyHToe2yLJKQalmvI8xoRXMXSOuAWliNRvj3Uo2CtYSY5r1oImg8nN8iHkOPcBrpBcZqUezhWzDa4cNU+4Eq2lYetPch/PNc+h0aIsjvhtEYQAigWYDG6YgG6btxsnmOXQ6tNU+w5vKRdlz1unNfx5HPDl0yEfUDoi4pScWqG0zbdH4irgQtBqzddS2mX6tMeZ8y9iYzCDeva5xAWjLUHHwEHXDEdvPoSWxvBp+GWi+ZSC9CJKZtLQaeBUPs/rIY8xz6GyN2Mfh5MbQcte7RngccRVoP9P1pid/tXqMJ3UfQOeZ59D50K4MZR30UDPbraWKufeOmStAh8iyxI5A3XBM1D6ZMryucVkoHPYaNtK6qb75SeBLQO9PbLVCBhh0iLSWEzw2LP355jn0MCiqdszM1mEjq9WO/ZiPruNR5jl0GvTTma7Df3GrayxQA02PI54d+uBM1+GqlsD8TJdDDjnkkEMOOfTB+AFczmEtToF0HwAAAABJRU5ErkJggg==";
  const $=id=>document.getElementById(id);
  let mounted=false;

  async function boCall(action,payload={}){
    const token=(window.state&&window.state.token)||localStorage.getItem('pa_session')||'';
    const r=await fetch(BO_API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':token},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Erro na Administração');
    return d;
  }
  async function nriCall(action,payload={}){
    const token=(window.state&&window.state.token)||localStorage.getItem('pa_session')||'';
    const r=await fetch(NRI_API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':token},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro na Administração');return d;
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function userInitials(){return (window.state?.user?.display_name||window.state?.user?.username||'ADM').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();}
  function ensureView(){
    if(mounted)return;
    const main=document.querySelector('main');if(!main)return;
    const view=document.createElement('section');view.id='adminView';view.className='view hidden';main.appendChild(view);
    document.querySelectorAll('.nav-link').forEach(n=>n.addEventListener('click',()=>view.classList.add('hidden')));
    mounted=true;
  }
  function accessCard(tag,title,desc,url,qr,prefix){
    return '<section class="admin-card"><div class="admin-access"><div><p class="eyebrow">'+tag+'</p><h2>'+title+'</h2><p>'+desc+'</p><div class="admin-url">'+url+'</div><div class="admin-actions"><button class="primary" id="'+prefix+'Copy">Copiar link</button><button id="'+prefix+'Open">Abrir</button><button id="'+prefix+'Print">Imprimir QR</button><button id="'+prefix+'Download">Baixar QR</button></div></div><img class="admin-qr" src="'+qr+'" alt="QR Code '+title+'" /></div></section>';
  }
  function shell(){
    const u=window.state?.user||{};
    return '<div class="admin-module">'+
      '<section class="admin-card"><div class="admin-profile-line"><div class="admin-avatar">'+esc(userInitials())+'</div><div><strong>'+esc(u.display_name||u.username||'Administrador')+'</strong><small>ADMINISTRAÇÃO</small></div></div><p>Configurações administrativas e acessos operacionais do Painel Armazém.</p></section>'+
      '<div class="admin-module-grid">'+
        accessCard('B.O. DIGITAL','B.O. dos conferentes','Acesso permanente para registro de B.O.',''+BO_URL,QR_DATA,'adminBo')+
        accessCard('RECEBIMENTO / NRI','Conferência cega','QR dos conferentes para recebimento físico e geração das NRIs.',''+RECEBIMENTO_URL,RECEBIMENTO_QR,'adminNri')+
        accessCard('PORTARIA','Entrada de carreta','QR da Portaria. Cada pessoa entra com seu nome e PIN individual.',''+PORTARIA_URL,PORTARIA_QR,'adminGate')+
        '<section class="admin-card"><p class="eyebrow">SEGURANÇA</p><h2>PINs dos conferentes</h2><p>Os mesmos PINs identificam o conferente no B.O. e na conferência de recebimento.</p><div class="admin-actions"><button class="primary" id="adminGeneratePins">Gerar PINs faltantes</button></div><div id="adminIssued"></div><div id="adminPinList" class="admin-pin-list"><span style="font-size:10px;color:var(--muted)">Carregando...</span></div></section>'+
        '<section class="admin-card"><p class="eyebrow">PORTARIA</p><h2>PINs da Portaria</h2><p>Daniel, Rodrigo, Yuri e Lucas possuem identificação individual. Cada abertura de carreta fica vinculada ao usuário que entrou com o PIN.</p><div id="adminGateIssued"></div><div id="adminGateStatus" class="admin-pin-list"><span style="font-size:10px;color:var(--muted)">Carregando...</span></div></section>'+'<section class="admin-card"><p class="eyebrow">PUXADA · PROMAX</p><h2>Agente local</h2><p>Sincroniza automaticamente o relatório 02.05.01 no computador da empresa.</p><div id="adminAgentStatus" class="admin-pin-list"><span style="font-size:10px;color:var(--muted)">Carregando...</span></div><div id="adminAgentIssued"></div><div class="admin-actions"><button class="primary" id="adminAgentToken">Gerar token</button><button id="adminAgentReset">Resetar token</button></div><label style="display:grid;gap:6px;margin-top:12px;font-size:11px;font-weight:700">Intervalo automático<select id="adminAgentInterval"><option value="5">5 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label><div class="admin-actions"><button id="adminAgentSaveInterval">Salvar intervalo</button></div><p style="font-size:10px;color:var(--muted)">Instalação local: pasta <strong>agent-puxada</strong> do repositório. A calibração do Promax será concluída no PC da empresa.</p></section>'+
      '</div></div>';
  }

  async function loadPins(){
    try{
      const d=await boCall('pin_status');
      $('adminPinList').innerHTML=(d.conferencers||[]).map(x=>'<div class="admin-pin-item"><div><strong>'+esc(x.display_name)+'</strong><small>'+(x.pin_ready?'PIN configurado':'PIN pendente')+'</small></div><button data-pin-reset="'+esc(x.id)+'">'+(x.pin_ready?'Resetar':'Gerar')+'</button></div>').join('');
      $('adminPinList').querySelectorAll('[data-pin-reset]').forEach(b=>b.onclick=()=>resetPin(b.dataset.pinReset));
    }catch(e){$('adminPinList').innerHTML='<p class="form-error">'+esc(e.message)+'</p>';}
  }
  function showIssued(items){
    $('adminIssued').innerHTML=items?.length?'<div class="admin-issued"><strong>Copie agora. Estes PINs não serão exibidos novamente.</strong>'+items.map(x=>'<div class="admin-issued-row"><span>'+esc(x.display_name)+'</span><code>'+esc(x.pin)+'</code><button data-copy-pin="'+esc(x.pin)+'">Copiar</button></div>').join('')+'</div>':'';
    $('adminIssued').querySelectorAll('[data-copy-pin]').forEach(b=>b.onclick=async()=>{await navigator.clipboard?.writeText(b.dataset.copyPin);showToast('PIN copiado.');});
  }
  async function generateMissing(){try{const d=await boCall('generate_missing_pins');showIssued(d.issued||[]);await loadPins();if(!d.issued?.length)showToast('Todos os conferentes já possuem PIN.');}catch(e){showToast(e.message,true);}}
  async function resetPin(id){try{const d=await boCall('reset_pin',{id});showIssued([d.issued]);await loadPins();}catch(e){showToast(e.message,true);}}
  function printQr(){
    const w=window.open('','_blank','noopener,noreferrer');if(!w)return showToast('O navegador bloqueou a janela de impressão.',true);
    w.document.write('<!doctype html><html><head><title>QR B.O. Digital</title><style>body{font-family:Arial;text-align:center;padding:40px}img{width:320px;height:320px}h1{font-size:24px}p{font-size:14px;word-break:break-all}</style></head><body><h1>B.O. Digital — Armazém</h1><img src="'+QR_DATA+'"><p>'+BO_URL+'</p><script>window.onload=()=>window.print()<\/script></body></html>');w.document.close();
  }
  function downloadQr(){const a=document.createElement('a');a.href=QR_DATA;a.download='QR_BO_Digital_Conferentes.png';a.click();}  function bindAccess(prefix,url,qr,label,filename){
    $(prefix+'Copy').onclick=async()=>{await navigator.clipboard?.writeText(url);showToast('Link copiado.');};
    $(prefix+'Open').onclick=()=>window.open(url,'_blank','noopener,noreferrer');
    $(prefix+'Print').onclick=()=>printAccessQr(qr,url,label);
    $(prefix+'Download').onclick=()=>downloadAccessQr(qr,filename);
  }
  function printAccessQr(qr,url,label){
    const w=window.open('','_blank','noopener,noreferrer');if(!w)return showToast('O navegador bloqueou a janela de impressão.',true);
    w.document.write('<!doctype html><html><head><title>'+esc(label)+'</title><style>body{font-family:Arial;text-align:center;padding:40px}img{width:320px;height:320px}h1{font-size:24px}p{font-size:14px;word-break:break-all}</style></head><body><h1>'+esc(label)+'</h1><img src="'+qr+'"><p>'+esc(url)+'</p><script>window.onload=()=>window.print()<\/script></body></html>');w.document.close();
  }
  function downloadAccessQr(qr,filename){const a=document.createElement('a');a.href=qr;a.download=filename;a.click();}
  async function loadGatePin(){
    try{
      const d=await nriCall('gate_pin_status'),users=d.users||[];
      $('adminGateStatus').innerHTML=users.map(x=>'<div class="admin-pin-item"><div><strong>'+esc(x.display_name)+'</strong><small>'+(x.pin_ready?'PIN configurado':'PIN pendente')+'</small></div><button data-gate-pin="'+esc(x.id)+'" data-ready="'+(x.pin_ready?'1':'0')+'">'+(x.pin_ready?'Resetar':'Gerar')+'</button></div>').join('');
      $('adminGateStatus').querySelectorAll('[data-gate-pin]').forEach(b=>b.onclick=()=>setGatePin(b.dataset.gatePin,b.dataset.ready==='1'));
    }catch(e){$('adminGateStatus').innerHTML='<p class="form-error">'+esc(e.message)+'</p>';}
  }
  async function setGatePin(id,reset){
    try{
      const d=await nriCall(reset?'gate_reset_pin':'gate_generate_pin',{id});
      if(!d.issued){showToast('Este PIN já está configurado.');return loadGatePin();}
      $('adminGateIssued').innerHTML='<div class="admin-issued"><strong>Copie agora. Este PIN não será exibido novamente.</strong><div class="admin-issued-row"><span>'+esc(d.issued.display_name)+'</span><code>'+esc(d.issued.pin)+'</code><button id="adminCopyGatePin">Copiar</button></div></div>';
      $('adminCopyGatePin').onclick=async()=>{await navigator.clipboard?.writeText(d.issued.pin);showToast('PIN copiado.');};
      await loadGatePin();
    }catch(e){showToast(e.message,true);}
  }

  function adminDt(v){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
  async function loadAgentAdmin(){
    try{
      const d=await nriCall('agent_status'),a=d.agent||{};
      let status='Offline';
      if(!a.token_ready)status='Token não gerado';
      else if(!a.calibration_ready)status='Aguardando calibração';
      else if(a.status==='syncing')status='Sincronizando';
      else if(a.status==='error')status='Erro';
      else if(a.online)status='Online';
      $('adminAgentStatus').innerHTML='<div class="admin-pin-item"><div><strong>'+esc(status)+'</strong><small>PC: '+esc(a.hostname||'—')+' · Último contato: '+esc(adminDt(a.last_seen_at))+' · Última sincronização: '+esc(adminDt(a.last_sync_completed_at))+'</small>'+(a.last_error?'<small style="color:#b43e45">'+esc(a.last_error)+'</small>':'')+'</div></div>';
      $('adminAgentToken').disabled=!!a.token_ready;$('adminAgentReset').disabled=!a.token_ready;$('adminAgentInterval').value=String(a.sync_interval_minutes||10);
    }catch(e){$('adminAgentStatus').innerHTML='<p class="form-error">'+esc(e.message)+'</p>'}
  }
  async function issueAgentToken(reset){
    try{
      const d=await nriCall(reset?'agent_reset_token':'agent_generate_token');
      if(!d.issued){showToast('O token do agente já está configurado.');return loadAgentAdmin()}
      $('adminAgentIssued').innerHTML='<div class="admin-issued"><strong>Copie agora. Este token não será exibido novamente.</strong><div class="admin-issued-row"><span>Agente Puxada</span><code style="font-size:9px;word-break:break-all">'+esc(d.issued.token)+'</code><button id="adminCopyAgentToken">Copiar</button></div></div>';
      $('adminCopyAgentToken').onclick=async()=>{await navigator.clipboard?.writeText(d.issued.token);showToast('Token do agente copiado.')};
      await loadAgentAdmin();
    }catch(e){showToast(e.message,true)}
  }
  async function saveAgentInterval(){
    try{await nriCall('agent_set_interval',{minutes:Number($('adminAgentInterval').value)});showToast('Intervalo do agente atualizado.');await loadAgentAdmin()}catch(e){showToast(e.message,true)}
  }

  async function open(){
    if(window.state?.user?.role!=='admin')return showToast('Área restrita à administração.',true);
    ensureView();
    document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
    $('adminView').classList.remove('hidden');
    $('pageTitle').textContent='Administração';$('pageSubtitle').textContent='Acessos, credenciais e configurações do Painel Armazém.';
    $('adminView').innerHTML=shell();
    bindAccess('adminBo',BO_URL,QR_DATA,'B.O. Digital — Conferentes','QR_BO_Digital_Conferentes.png');
    bindAccess('adminNri',RECEBIMENTO_URL,RECEBIMENTO_QR,'Recebimento / NRI — Conferentes','QR_Recebimento_NRI_Conferentes.png');
    bindAccess('adminGate',PORTARIA_URL,PORTARIA_QR,'Portaria — Entrada de Carreta','QR_Portaria_Recebimento.png');
    $('adminGeneratePins').onclick=generateMissing;$('adminAgentToken').onclick=()=>issueAgentToken(false);$('adminAgentReset').onclick=()=>issueAgentToken(true);$('adminAgentSaveInterval').onclick=saveAgentInterval;
    await Promise.all([loadPins(),loadGatePin(),loadAgentAdmin()]);
  }
  function bind(){
    const btn=$('adminProfileButton');if(!btn)return setTimeout(bind,120);
    btn.onclick=open;btn.title='Abrir Administração';btn.setAttribute('aria-label','Abrir Administração');
  }
  bind();
  window.__adminModule={open};
})();