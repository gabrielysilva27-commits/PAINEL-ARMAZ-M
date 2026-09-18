(() => {
  let loading=null;
  const $=id=>document.getElementById(id);
  function ensureAssets(){
    if(window.__qualityRounds)return Promise.resolve(window.__qualityRounds);
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      if(!$('qualityRoundsCss')){const l=document.createElement('link');l.id='qualityRoundsCss';l.rel='stylesheet';l.href='quality-rounds.css?v=20260918-1';document.head.appendChild(l);}
      const s=document.createElement('script');s.src='quality-rounds.js?v=20260918-1';s.async=true;s.onload=()=>resolve(window.__qualityRounds);s.onerror=()=>reject(new Error('Falha ao carregar Ronda de Qualidade'));document.body.appendChild(s);
    });
    return loading;
  }
  async function open(){
    document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
    $('qualityRoundsView')?.classList.remove('hidden');
    document.querySelector('[data-view="quality-rounds"]')?.classList.add('active');
    $('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='Ronda de Qualidade';
    if($('pageSubtitle'))$('pageSubtitle').textContent='Indicadores 2026 · Google Forms.';
    if($('qualityRoundsView'))$('qualityRoundsView').innerHTML='<div class="quality-loading">Carregando indicadores de qualidade…</div>';
    try{const mod=await ensureAssets();await mod?.open?.();}catch(e){if($('qualityRoundsView'))$('qualityRoundsView').innerHTML='<p class="stock-error">'+String(e.message||e)+'</p>';}
  }
  function mount(){
    if(document.querySelector('[data-view="quality-rounds"]'))return;
    const anchor=document.querySelector('[data-view="replenishment"]');
    const main=document.querySelector('main');
    if(!anchor||!main)return setTimeout(mount,120);
    const nav=document.createElement('button');nav.className='nav-link';nav.dataset.view='quality-rounds';nav.innerHTML='<span>✓</span> Ronda de Qualidade';nav.onclick=open;anchor.insertAdjacentElement('afterend',nav);
    const view=document.createElement('section');view.id='qualityRoundsView';view.className='view hidden';const after=$('replenishmentView');if(after)after.insertAdjacentElement('afterend',view);else main.appendChild(view);
    for(const n of document.querySelectorAll('.nav-link:not([data-view="quality-rounds"])'))n.addEventListener('click',()=>view.classList.add('hidden'));
  }
  setTimeout(mount,140);
})();