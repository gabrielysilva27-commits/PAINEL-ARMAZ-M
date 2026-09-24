(() => {
  const BO_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/bo-api';
  const BO_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/bo/';
  const NRI_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/receiving-nri-api';
  const PUTAWAY_API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/putaway-api';
  const PORTARIA_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/portaria/';
  const RECEBIMENTO_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/recebimento/';
  const CONFERENTE_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/conferente/';
  const EMPILHADOR_URL='https://painel-armaz-m.gabrielysilva27.workers.dev/recebimento/guarda.html';
  const CONFERENTE_QR="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZoAAAGaAQAAAAAefbjOAAADBElEQVR4nO2cQW7bMBBF31QCsqSBHqBHoW7QIwW9mXyUHCAAtQwg4XdBUpKNLpq6lVVpuIoVP3gIT2b+zJAx8el1/fJ5BhxyyCGHHHLIoWNCVlaLdUxm3fLsMhkM9Q3dU8xzaHsoSpIScLUW9QAxNVIPWEcjSdIttJ15Dm0PDSUAqKeRWXaLyez17SX7gZm1zzPPoc2g9u61xXQxCO+m6/exFQOI4VnmOfR0SD++SeqHFntNwPUC1v2LT3Jon1CNEUHAAMQ3A2hGY7hgsWqHdSdr53ty6C9A11xXFBVJTAA0gqEFmHKp8SzzHNo6RqwDQBjLD9cLBuHDSgR5hnkObQ6Rq8qYyDWn+jAipUYQxlx6SKmR+jCWKrXf+Z4cegRa6YisGeLbiwwaSsII7yaYTAwvsq3Nc2hzKMeIvPr6EoJEXAJFGMnpxGPE4aHqArUrKaXSpip9TBVZoT7MnrPzPTn0CFRiRB9mMRGUnSGHh+wROUaUX7hHHBq6UZZLckhA1FgchFCDh8eIw0PrrNHT5GiRswaQhUP2l5Xe2PmeHHoEqt90akTUWCeeNYnUVf3FPeLw0PpvX2mWlxpZNGYRmsk94gzQnDWYhcPIug4FljrUleXxoSoWqfEgC81ZVMalXZlcWZ4Byj1LA+Y559TejDk+TNDICGNtcO58Tw49AtXqU6q1Rn5cao0y5tA6k3iMOAU0tFgXPsxea+NyXWvkkXgj655knkObQbdzjaZ0o+biIiuKPAoFV5YngFicIXeso0rHeulR1Mal1xpngNZd7HIqQlVMzG4BFFdxjzg8NJ+hEvX41FJrTK1gMmIPdr2817NWO9+TQ49Dy52uoieDRHxrsS6MZGUZ52jxf+zJocerzywcEvWKl9bqYXmzZ41DQysdUa/13Z2dqcvnGueAfnGn62tuYQqa0WK6oKIoRiz225rn0B6gyTSfpYMgWTe06yvC/+GeHPr9dacjVsXoMvjyU3UngtZD73mawf1cI5cZriPOAJn/ZzKHHHLIIYcccugPoZ9ZpLiQkKjSfQAAAABJRU5ErkJggg==";
  const EMPILHADOR_QR="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAcIAAAHCAQAAAABUY/ToAAADoUlEQVR4nO2cW4rrOhBFVx0H8mlDDyBDUWZwhtT0kM4M7KFkBvJnQGbfD0mx3A8uNJ0b59yqj+AkXliCYqsekk18z6Zf3wTBSSeddNJJJ510cn+kFTvUn2czpgGYhsXyLee53nX+kWc6+ZeRQZIUyU5jdkrYawQ708nOLAZ0kiRtyUeM1sldknPRFzsDhMtRMB/QOJvBXASqlarnnKeTP0+SpSVEIMROhNgVRaKXpNiJLEH1KovW+FzzdPIRpEYWMztdTYpVoO78TCefkaxLUy9gBqZTwujTweg7GfNRQAms24Lkc83TybuTk5mZDUC4HEo8lK9iCayBJadljx+tk7sisw41+jKdEsBimoYOTaeriXmxIlU/8Uwn/y6yjamhk8Ze0tgnCEpIsZNGbnF2TfA9pnbyZsUj8lUC+oTGvrhP/pqrQusf7kNOtqbGItSMHlb3KbIUK+K5vZMba0SmrGqd6jIG0Kv9GiSvDzn5zornVB1aF7TiV7ca4whFjNyHnNxYbYF1ypqTK9G5Yl1vGXtJUqJ+uA852ViNeEpfo0TXkdL6KH4Fa4zkOuTkZ2S4HID+Wvd5ZFm6msbZTFLCztvA+jnn6eQdyNLrmH4nDDrZ7R8xv4ig5WDQick6GfPwyNE6uUeyXcvyB1Di55rWa1y79V4fcvKDtRl9XF2lhke3wlHO0Dwvc/Kj1dw+kcuL41opyoWjTbA99l4fcvK9ValJkBN8yClZLQiV3/KC5v0yJ78g7TwfqxhVR8qJGP3VCJLsVaVf9vDROrkvsqkxrt2Mts2xbo0FvD7k5Ce2xkMfV7W6FaT8Bs197kNOviPnA/lUWTnDsRhBVyNczJjsUPL9sjX20aN1ck9k23MttSCo7VYa4Wm2pLkOObmxNo+HprLIrQ+b17KgtCk+Ptc8nbwf2dYYqTXppqiYb4ntza5DTn5OLka4HFVPSIPZsBghdsoHPsDPuTr5NdnsxC/bz9ba9dXWFaz8++DROrkvMstK7dZ3ScwDmqz27achCuiSMb8kwh+DMD5qtE7ukdzuhS1d1XK16Ze1Xz0ecrK1GlPDF4E1NCtY09p/rnk6+V+S81H2qqvZuU+YDXU7UUn1PR5y8t/IEBfTmx2lt6EccaW8MSaht/patJ2M1skdkO/f+yFmsCCwEMFgMYW4HGB+SRYidbvsc83TyfuRt749sMpNjprXU/Y589+Wsp9rnk7ejzR/x7mTTjrppJNOOvk/J/8BK89jc2BAyPUAAAAASUVORK5CYII=";
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
  async function putawayCall(action,payload={}){
    const token=(window.state&&window.state.token)||localStorage.getItem('pa_session')||'';
    const r=await fetch(PUTAWAY_API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':token},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Erro na Administração');return d;
  }
  const pinDirectory={conferencers:[],gate:[],forklift:[]};
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
      '<div class="admin-role-access-grid">'+
        accessCard('CONFERENTES','Portal do conferente','Um único QR para B.O. Digital e Conferência cega / NRI.',''+CONFERENTE_URL,CONFERENTE_QR,'adminConf')+
        accessCard('PORTARIA','Entrada de carreta','Entrada e acompanhamento da carreta com nome e PIN individual.',''+PORTARIA_URL,PORTARIA_QR,'adminGate')+
        accessCard('EMPILHADORES','Descarga e Guarda','Um único QR para iniciar/finalizar descarga e executar as Ordens de Guarda.',''+EMPILHADOR_URL,EMPILHADOR_QR,'adminFork')+
      '</div>'+
      '<div class="admin-module-grid">'+
        '<section class="admin-card admin-pin-console"><p class="eyebrow">SEGURANÇA OPERACIONAL</p><h2>Credenciais e PINs</h2><p>Conferentes, Portaria e Empilhadores ficam no mesmo controle. Selecione o grupo e a pessoa; não é necessário manter uma lista aberta nome a nome.</p>'+
          '<div id="adminPinSummary" class="admin-pin-summary"><span>Carregando credenciais...</span></div>'+
          '<div class="admin-pin-validator"><label>Equipe<select id="adminPinGroup"><option value="conferencers">Conferentes</option><option value="gate">Portaria</option><option value="forklift">Empilhadores</option></select></label><label>Pessoa<select id="adminPinPerson"></select></label></div>'+
          '<div id="adminPinSelected" class="admin-pin-selected"></div>'+
          '<div class="admin-actions"><button class="primary" id="adminPinAction">Gerar / redefinir PIN</button><button id="adminPinMissing">Gerar pendentes do grupo</button><button id="adminPinOpenForklift">Abrir tela dos empilhadores</button></div>'+
          '<div id="adminPinUnifiedIssued"></div>'+
        '</section>'+'<section class="admin-card"><p class="eyebrow">PUXADA · PROMAX</p><h2>Agente Puxada</h2><p>Um único agente lógico pode rodar em dois computadores. O primeiro PC que pegar uma sincronização bloqueia a tarefa para o outro, evitando duplicidade.</p><div id="adminAgentStatus" class="admin-pin-list"><span style="font-size:10px;color:var(--muted)">Carregando...</span></div><div id="adminAgentNodes" class="admin-pin-list"></div><div id="adminAgentIssued"></div><label style="display:grid;gap:6px;margin-top:12px;font-size:11px;font-weight:700">Intervalo automático<select id="adminAgentInterval"><option value="5">5 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label><div class="admin-actions"><button id="adminAgentSaveInterval">Salvar intervalo</button><button class="primary" id="adminAgentSyncNow">Sincronizar agora</button><button id="adminAgentRefresh">Atualizar status</button></div><p style="font-size:10px;color:var(--muted)">Após a instalação inicial, o agente se atualiza automaticamente. Cada PC mantém seu próprio token; novas automações são distribuídas pelo atualizador sem reinstalação manual.</p></section>'+
      '</div></div>';
  }

  function groupLabel(group){
    return group==='conferencers'?'Conferentes':group==='gate'?'Portaria':'Empilhadores';
  }
  function activePeople(group){
    return (pinDirectory[group]||[]).filter(x=>x.active!==false);
  }
  function renderPinSummary(){
    if(!$('adminPinSummary'))return;
    $('adminPinSummary').innerHTML=['conferencers','gate','forklift'].map(group=>{
      const people=activePeople(group),ready=people.filter(x=>x.pin_ready).length;
      const cls=people.length&&ready===people.length?'good':ready?'partial':'pending';
      return '<button type="button" class="admin-pin-summary-item '+cls+'" data-pin-group-summary="'+group+'"><span>'+groupLabel(group)+'</span><strong>'+ready+'/'+people.length+'</strong><small>'+(ready===people.length&&people.length?'Configurados':(people.length-ready)+' pendente(s)')+'</small></button>';
    }).join('');
    $('adminPinSummary').querySelectorAll('[data-pin-group-summary]').forEach(b=>b.onclick=()=>{$('adminPinGroup').value=b.dataset.pinGroupSummary;renderPinPeople()});
  }
  function renderPinPeople(){
    const group=$('adminPinGroup').value,people=activePeople(group),select=$('adminPinPerson');
    select.innerHTML=people.length?people.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.display_name)+'</option>').join(''):'<option value="">Nenhuma pessoa ativa</option>';
    renderPinSelected();
  }
  function selectedPinPerson(){
    const group=$('adminPinGroup')?.value,id=$('adminPinPerson')?.value;
    return activePeople(group).find(x=>String(x.id)===String(id))||null;
  }
  function renderPinSelected(){
    const group=$('adminPinGroup')?.value,person=selectedPinPerson(),box=$('adminPinSelected'),button=$('adminPinAction');
    if(!box||!button)return;
    if(!person){box.innerHTML='<span>Nenhuma pessoa disponível neste grupo.</span>';button.disabled=true;return}
    button.disabled=false;
    button.textContent=person.pin_ready?'Redefinir PIN':'Gerar PIN';
    const visiblePin=group==='conferencers'&&person.pin?String(person.pin):'';
    box.innerHTML='<div><strong>'+esc(person.display_name)+'</strong><small>'+esc(groupLabel(group))+'</small>'+(visiblePin?'<code class="admin-pin-visible">'+esc(visiblePin)+'</code>':'')+'</div><div class="admin-pin-selected-actions"><span class="admin-pin-state '+(person.pin_ready?'ready':'pending')+'">'+(person.pin_ready?'PIN configurado':'PIN pendente')+'</span>'+(visiblePin?'<button type="button" id="adminCopySelectedPin">Copiar PIN</button>':'')+'</div>';
    if(visiblePin&&$('adminCopySelectedPin'))$('adminCopySelectedPin').onclick=async()=>{await navigator.clipboard?.writeText(visiblePin);showToast('PIN copiado.')};
  }
  function showUnifiedIssued(item){
    const box=$('adminPinUnifiedIssued');if(!box)return;
    if(!item){box.innerHTML='';return}
    box.innerHTML='<div class="admin-issued"><strong>PIN atualizado. O ADM poderá consultá-lo nesta tela.</strong><div class="admin-issued-row"><span>'+esc(item.display_name)+'</span><code>'+esc(item.pin)+'</code><button id="adminCopyUnifiedPin">Copiar</button></div></div>';
    $('adminCopyUnifiedPin').onclick=async()=>{await navigator.clipboard?.writeText(item.pin);showToast('PIN copiado.')};
  }
  async function loadUnifiedPins(){
    try{
      const [c,g,f]=await Promise.all([boCall('pin_status'),nriCall('gate_pin_status'),putawayCall('forklift_admin_list')]);
      pinDirectory.conferencers=(c.conferencers||[]).map(x=>({...x,group:'conferencers'}));
      pinDirectory.gate=(g.users||[]).map(x=>({...x,group:'gate'}));
      pinDirectory.forklift=(f.operators||[]).map(x=>({...x,group:'forklift'}));
      renderPinSummary();renderPinPeople();
    }catch(e){
      if($('adminPinSummary'))$('adminPinSummary').innerHTML='<p class="form-error">'+esc(e.message)+'</p>';
      showToast(e.message,true);
    }
  }
  async function issueSelectedPin(){
    const group=$('adminPinGroup').value,person=selectedPinPerson();if(!person)return;
    const verb=person.pin_ready?'redefinir':'gerar';
    if(person.pin_ready&&!confirm('Redefinir o PIN de '+person.display_name+'? O PIN atual deixará de funcionar.'))return;
    const b=$('adminPinAction');b.disabled=true;
    try{
      let issued=null;
      if(group==='conferencers'){
        const d=await boCall('reset_pin',{id:person.id});issued=d.issued;
      }else if(group==='gate'){
        const d=await nriCall(person.pin_ready?'gate_reset_pin':'gate_generate_pin',{id:person.id});issued=d.issued;
      }else{
        const d=await putawayCall('forklift_admin_reset_pin',{id:person.id});issued=d.operator;
      }
      if(!issued)throw new Error('Não foi possível '+verb+' o PIN.');
      showUnifiedIssued(issued);await loadUnifiedPins();
    }catch(e){showToast(e.message,true)}finally{b.disabled=false;renderPinSelected()}
  }
  async function issueMissingForGroup(){
    const group=$('adminPinGroup').value,missing=activePeople(group).filter(x=>!x.pin_ready);
    if(!missing.length)return showToast('Todos os '+groupLabel(group).toLowerCase()+' já possuem PIN.');
    if(!confirm('Gerar '+missing.length+' PIN(s) pendente(s) de '+groupLabel(group)+'?'))return;
    const issued=[];
    try{
      if(group==='conferencers'){
        const d=await boCall('generate_missing_pins');issued.push(...(d.issued||[]));
      }else if(group==='gate'){
        for(const person of missing){const d=await nriCall('gate_generate_pin',{id:person.id});if(d.issued)issued.push(d.issued)}
      }else{
        for(const person of missing){const d=await putawayCall('forklift_admin_reset_pin',{id:person.id});if(d.operator)issued.push(d.operator)}
      }
      const box=$('adminPinUnifiedIssued');
      box.innerHTML=issued.length?'<div class="admin-issued"><strong>PINs atualizados. O ADM poderá consultá-los nesta tela.</strong>'+issued.map(x=>'<div class="admin-issued-row"><span>'+esc(x.display_name)+'</span><code>'+esc(x.pin)+'</code><button data-copy-unified="'+esc(x.pin)+'">Copiar</button></div>').join('')+'</div>':'';
      box.querySelectorAll('[data-copy-unified]').forEach(b=>b.onclick=async()=>{await navigator.clipboard?.writeText(b.dataset.copyUnified);showToast('PIN copiado.')});
      await loadUnifiedPins();
    }catch(e){showToast(e.message,true)}
  }

  async function loadPins(){
    try{
      const d=await boCall('pin_status');
      $('adminPinList').innerHTML=(d.conferencers||[]).map(x=>'<div class="admin-pin-item"><div><strong>'+esc(x.display_name)+'</strong><small>'+(x.pin_ready?'PIN configurado':'PIN pendente')+'</small></div><button data-pin-reset="'+esc(x.id)+'">'+(x.pin_ready?'Resetar':'Gerar')+'</button></div>').join('');
      $('adminPinList').querySelectorAll('[data-pin-reset]').forEach(b=>b.onclick=()=>resetPin(b.dataset.pinReset));
    }catch(e){$('adminPinList').innerHTML='<p class="form-error">'+esc(e.message)+'</p>';}
  }
  function showIssued(items){
    $('adminIssued').innerHTML=items?.length?'<div class="admin-issued"><strong>PINs atualizados. O ADM poderá consultá-los nesta tela.</strong>'+items.map(x=>'<div class="admin-issued-row"><span>'+esc(x.display_name)+'</span><code>'+esc(x.pin)+'</code><button data-copy-pin="'+esc(x.pin)+'">Copiar</button></div>').join('')+'</div>':'';
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
      $('adminGateIssued').innerHTML='<div class="admin-issued"><strong>PIN atualizado. O ADM poderá consultá-lo nesta tela.</strong><div class="admin-issued-row"><span>'+esc(d.issued.display_name)+'</span><code>'+esc(d.issued.pin)+'</code><button id="adminCopyGatePin">Copiar</button></div></div>';
      $('adminCopyGatePin').onclick=async()=>{await navigator.clipboard?.writeText(d.issued.pin);showToast('PIN copiado.');};
      await loadGatePin();
    }catch(e){showToast(e.message,true);}
  }

  function adminDt(v){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
  async function loadAgentAdmin(){
    try{
      const d=await nriCall('agent_status'),a=d.agent||{},nodes=a.nodes||[];
      let overall='Offline';
      if(a.status==='syncing')overall='Sincronizando';
      else if(a.online)overall='Online';
      else if(a.status==='error')overall='Com falha';
      else if(a.token_ready)overall='Aguardando um computador ficar disponível';
      else overall='Não instalado';
      const lr=a.last_run||null;
      let runLine='Nenhuma execução registrada.';
      if(lr){
        if(lr.status==='completed'){
          runLine='Última execução OK · versão '+(lr.agent_version||'—')+' · '+Number(lr.raw_rows||0)+' linha(s) · '+Number(lr.aggregated_rows||0)+' item(ns) consolidado(s) · '+Number(lr.documents||0)+' documento(s)';
        }else if(lr.status==='running'){
          runLine='Execução #'+lr.id+' em andamento · versão '+(lr.agent_version||'—');
        }else{
          runLine='Última execução com falha · versão '+(lr.agent_version||'—')+(lr.message?' · '+lr.message:'');
        }
      }
      $('adminAgentStatus').innerHTML='<div class="admin-pin-item"><div><strong>'+esc(overall)+'</strong><small>1 agente · 2 computadores · última sincronização '+esc(adminDt(a.last_sync_completed_at))+' · intervalo '+esc(a.sync_interval_minutes||10)+' min</small><small>Versão publicada: '+esc(a.latest_agent_version||'—')+' · atualização automática</small><small style="'+(lr&&lr.status==='completed'?'color:#238636;font-weight:700':'')+'">'+esc(runLine)+'</small></div></div>';
      $('adminAgentNodes').innerHTML=nodes.map(x=>{
        let status='Offline';
        if(!x.token_ready)status='Token pendente';
        else if(!x.calibration_ready)status='Aguardando Promax';
        else if(x.status==='syncing')status='Sincronizando';
        else if(x.status==='error')status='Erro';
        else if(x.online)status='Online / disponível';
        const version=x.agent_version||'—',target=x.update_target_version||a.latest_agent_version||'—';
        let upd='Atualizador não instalado';
        if(x.updater_version){
          if(x.update_status==='downloading')upd='Baixando '+target;
          else if(x.update_status==='staged'||x.update_status==='applying')upd='Aplicando '+target;
          else if(x.update_status==='failed')upd='Falha ao atualizar para '+target;
          else if(x.update_status==='manual_required')upd='Atualização manual necessária';
          else if(a.latest_agent_version&&version===a.latest_agent_version)upd='Atualizado';
          else if(x.update_status==='available')upd='Atualização '+target+' disponível';
          else upd='Auto-update ativo';
        }
        const meta=(x.hostname?('PC: '+x.hostname+' · '):'')+'Versão: '+version+' · '+upd+' · Último contato: '+adminDt(x.last_seen_at)+(x.last_sync_completed_at?' · Última sync: '+adminDt(x.last_sync_completed_at):'');
        const err=x.update_error||x.last_error;
        return '<div class="admin-pin-item"><div><strong>'+esc(x.display_name)+'</strong><small>'+esc(status)+'</small><small>'+esc(meta)+'</small>'+(err?'<small style="color:#b43e45">'+esc(err)+'</small>':'')+'</div><button data-agent-node="'+esc(x.id)+'" data-ready="'+(x.token_ready?'1':'0')+'">'+(x.token_ready?'Resetar token':'Gerar token')+'</button></div>';
      }).join('');
      $('adminAgentNodes').querySelectorAll('[data-agent-node]').forEach(b=>b.onclick=()=>issueAgentToken(b.dataset.agentNode,b.dataset.ready==='1'));
      $('adminAgentInterval').value=String(a.sync_interval_minutes||10);
    }catch(e){$('adminAgentStatus').innerHTML='<p class="form-error">'+esc(e.message)+'</p>'}
  }
  async function issueAgentToken(nodeId,reset){
    try{
      const d=await nriCall(reset?'agent_reset_token':'agent_generate_token',{node_id:nodeId});
      if(!d.issued){showToast('Este computador já possui token configurado.');return loadAgentAdmin()}
      $('adminAgentIssued').innerHTML='<div class="admin-issued"><strong>Copie agora. Este token não será exibido novamente.</strong><div class="admin-issued-row"><span>'+esc(d.issued.display_name)+'</span><code style="font-size:9px;word-break:break-all">'+esc(d.issued.token)+'</code><button id="adminCopyAgentToken">Copiar</button></div></div>';
      $('adminCopyAgentToken').onclick=async()=>{await navigator.clipboard?.writeText(d.issued.token);showToast('Token deste computador copiado.')};
      await loadAgentAdmin();
    }catch(e){showToast(e.message,true)}
  }
  async function saveAgentInterval(){
    try{await nriCall('agent_set_interval',{minutes:Number($('adminAgentInterval').value)});showToast('Intervalo do agente atualizado.');await loadAgentAdmin()}catch(e){showToast(e.message,true)}
  }

  async function syncAgentNow(){
    const b=$('adminAgentSyncNow');if(b)b.disabled=true;
    try{
      const d=await nriCall('agent_request_sync',{});
      if(d.already_pending)showToast('Já existe uma sincronização aguardando ou em execução.');
      else showToast('Sincronização solicitada. O agente vai assumir a tarefa agora.');
      await loadAgentAdmin();
      setTimeout(loadAgentAdmin,2500);
      setTimeout(loadAgentAdmin,8000);
      setTimeout(loadAgentAdmin,18000);
    }catch(e){showToast(e.message,true)}
    finally{if(b)b.disabled=false}
  }

  async function open(){
    if(window.state?.user?.role!=='admin')return showToast('Área restrita à administração.',true);
    ensureView();
    document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
    $('adminView').classList.remove('hidden');
    $('pageTitle').textContent='Administração';$('pageSubtitle').textContent='Acessos, credenciais e configurações do Painel Armazém.';
    $('adminView').innerHTML=shell();
    bindAccess('adminConf',CONFERENTE_URL,CONFERENTE_QR,'Portal do Conferente — B.O. + NRI','QR_Portal_Conferentes.png');
    bindAccess('adminGate',PORTARIA_URL,PORTARIA_QR,'Portaria — Entrada de Carreta','QR_Portaria_Recebimento.png');
    bindAccess('adminFork',EMPILHADOR_URL,EMPILHADOR_QR,'Empilhadores — Descarga + Guarda','QR_Empilhadores_Descarga_Guarda.png');
    $('adminPinGroup').onchange=renderPinPeople;$('adminPinPerson').onchange=renderPinSelected;$('adminPinAction').onclick=issueSelectedPin;$('adminPinMissing').onclick=issueMissingForGroup;$('adminPinOpenForklift').onclick=()=>window.open(RECEBIMENTO_URL+'guarda.html','_blank','noopener,noreferrer');$('adminAgentSaveInterval').onclick=saveAgentInterval;$('adminAgentSyncNow').onclick=syncAgentNow;$('adminAgentRefresh').onclick=loadAgentAdmin;
    await Promise.all([loadUnifiedPins(),loadAgentAdmin()]);
  }
  function bind(){
    const btn=$('adminProfileButton');if(!btn)return setTimeout(bind,120);
    btn.onclick=open;btn.title='Abrir Administração';btn.setAttribute('aria-label','Abrir Administração');
  }
  bind();
  window.__adminModule={open};
})();