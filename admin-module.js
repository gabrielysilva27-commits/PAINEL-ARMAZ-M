(() => {
  const BO_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const BO_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/bo/';
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
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function userInitials(){return (window.state?.user?.display_name||window.state?.user?.username||'ADM').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();}
  function ensureView(){
    if(mounted)return;
    const main=document.querySelector('main');if(!main)return;
    const view=document.createElement('section');view.id='adminView';view.className='view hidden';main.appendChild(view);
    document.querySelectorAll('.nav-link').forEach(n=>n.addEventListener('click',()=>view.classList.add('hidden')));
    mounted=true;
  }
  function shell(){
    const u=window.state?.user||{};
    return '<div class="admin-module">'+
      '<section class="admin-card"><div class="admin-profile-line"><div class="admin-avatar">'+esc(userInitials())+'</div><div><strong>'+esc(u.display_name||u.username||'Administrador')+'</strong><small>ADMINISTRAÇÃO</small></div></div><p>Configurações administrativas e acessos operacionais do Painel Armazém.</p></section>'+
      '<div class="admin-module-grid">'+
        '<section class="admin-card"><div class="admin-access"><div><p class="eyebrow">B.O. DIGITAL</p><h2>Acesso dos conferentes</h2><p>Este é o endereço permanente do B.O. O mesmo QR poderá continuar sendo usado quando o Controle tiver um painel próprio.</p><div class="admin-url">'+BO_URL+'</div><div class="admin-actions"><button class="primary" id="adminCopyBo">Copiar link</button><button id="adminOpenBo">Abrir B.O.</button><button id="adminPrintQr">Imprimir QR</button><button id="adminDownloadQr">Baixar QR</button></div></div><img class="admin-qr" src="'+QR_DATA+'" alt="QR Code de acesso ao B.O. Digital" /></div></section>'+
        '<section class="admin-card"><p class="eyebrow">SEGURANÇA</p><h2>PINs dos conferentes</h2><p>PIN individual para identificar quem está emitindo cada B.O. Um PIN novo só aparece no momento da geração.</p><div class="admin-actions"><button class="primary" id="adminGeneratePins">Gerar PINs faltantes</button></div><div id="adminIssued"></div><div id="adminPinList" class="admin-pin-list"><span style="font-size:10px;color:var(--muted)">Carregando...</span></div></section>'+
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
  function downloadQr(){const a=document.createElement('a');a.href=QR_DATA;a.download='QR_BO_Digital_Conferentes.png';a.click();}
  async function open(){
    if(window.state?.user?.role!=='admin')return showToast('Área restrita à administração.',true);
    ensureView();
    document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
    $('adminView').classList.remove('hidden');
    $('pageTitle').textContent='Administração';$('pageSubtitle').textContent='Acessos, credenciais e configurações do Painel Armazém.';
    $('adminView').innerHTML=shell();
    $('adminCopyBo').onclick=async()=>{await navigator.clipboard?.writeText(BO_URL);showToast('Link do B.O. copiado.');};
    $('adminOpenBo').onclick=()=>window.open(BO_URL,'_blank','noopener,noreferrer');
    $('adminPrintQr').onclick=printQr;$('adminDownloadQr').onclick=downloadQr;$('adminGeneratePins').onclick=generateMissing;
    await loadPins();
  }
  function bind(){
    const btn=$('adminProfileButton');if(!btn)return setTimeout(bind,120);
    btn.onclick=open;btn.title='Abrir Administração';btn.setAttribute('aria-label','Abrir Administração');
  }
  bind();
  window.__adminModule={open};
})();