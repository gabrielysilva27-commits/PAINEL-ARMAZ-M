(() => {
  let loading=null;
  const $=id=>document.getElementById(id);
  function ensureAssets(){
    if(window.__receivingQuality)return Promise.resolve(window.__receivingQuality);
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      if(!$('receivingQualityCss')){const l=document.createElement('link');l.id='receivingQualityCss';l.rel='stylesheet';l.href='receiving-quality.css?v=20260918-2';document.head.appendChild(l);}
      const s=document.createElement('script');s.src='receiving-quality.js?v=20260918-2';s.async=true;s.onload=()=>resolve(window.__receivingQuality);s.onerror=()=>reject(new Error('Falha ao carregar Qualidade do Recebimento'));document.body.appendChild(s);
    });
    return loading;
  }
  async function open(){
    document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
    $('receivingQualityView')?.classList.remove('hidden');
    document.querySelector('[data-view="receiving-quality"]')?.classList.add('active');
    $('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='Qualidade do Recebimento';
    if($('pageSubtitle'))$('pageSubtitle').textContent='Check de recebimento de puxada · 2026.';
    if($('receivingQualityView'))$('receivingQualityView').innerHTML='<div class="rq-loading">Carregando indicadores de recebimento…</div>';
    try{const mod=await ensureAssets();await mod?.open?.();}catch(e){if($('receivingQualityView'))$('receivingQualityView').innerHTML='<p class="stock-error">'+String(e.message||e)+'</p>';}
  }
  function mount(){
    if(document.querySelector('[data-view="receiving-quality"]'))return;
    const quality=document.querySelector('[data-view="quality-rounds"]');
    if(!quality)return setTimeout(mount,120);
    const nav=document.createElement('button');nav.className='nav-link';nav.dataset.view='receiving-quality';nav.innerHTML='<span>⇩</span> Qualidade do Recebimento';nav.onclick=open;quality.insertAdjacentElement('afterend',nav);
    const view=document.createElement('section');view.id='receivingQualityView';view.className='view hidden';const after=$('qualityRoundsView');if(after)after.insertAdjacentElement('afterend',view);else document.querySelector('main')?.appendChild(view);
    for(const n of document.querySelectorAll('.nav-link:not([data-view="receiving-quality"])'))n.addEventListener('click',()=>view.classList.add('hidden'));
  }
  setTimeout(mount,240);
})();