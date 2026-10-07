(() => {
  let loading=null;
  const $=id=>document.getElementById(id);
  function ensureAssets(){
    if(window.__temperatureModule)return Promise.resolve(window.__temperatureModule);
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      if(!$('temperatureCss')){const l=document.createElement('link');l.id='temperatureCss';l.rel='stylesheet';l.href='temperature-dashboard-v3.css?v=20260929-1';document.head.appendChild(l);}
      const s=document.createElement('script');s.src='temperature-dashboard-v3.js?v=20260929-1';s.async=true;s.onload=()=>resolve(window.__temperatureModule);s.onerror=()=>{s.remove();loading=null;reject(new Error('Falha ao carregar Temperatura'))};document.body.appendChild(s);
    });
    return loading;
  }
  async function open(){
    document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
    $('temperatureView')?.classList.remove('hidden');
    document.querySelector('[data-view="temperature"]')?.classList.add('active');
    $('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='Temperatura';
    if($('pageSubtitle'))$('pageSubtitle').textContent='';
    if($('temperatureView'))$('temperatureView').innerHTML='<div class="temp-loading">Carregando temperaturas…</div>';
    try{const mod=await ensureAssets();await mod?.open?.();}catch(e){if($('temperatureView'))$('temperatureView').innerHTML='<p class="stock-error">'+String(e.message||e)+'</p>';}
  }
  function mount(){
    if(document.querySelector('[data-view="temperature"]'))return;
    const anchor=document.querySelector('[data-view="quality-rounds"]')||document.querySelector('[data-view="replenishment"]');
    const main=document.querySelector('main');
    if(!anchor||!main)return setTimeout(mount,140);
    const nav=document.createElement('button');nav.className='nav-link';nav.dataset.view='temperature';nav.innerHTML='<span>°</span> Temperatura';nav.onclick=open;anchor.insertAdjacentElement('afterend',nav);
    const view=document.createElement('section');view.id='temperatureView';view.className='view hidden';main.appendChild(view);
    for(const n of document.querySelectorAll('.nav-link:not([data-view="temperature"])'))n.addEventListener('click',()=>view.classList.add('hidden'));
  }
  setTimeout(mount,180);
})();
