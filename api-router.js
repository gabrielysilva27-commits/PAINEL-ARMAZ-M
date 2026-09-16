(() => {
  const originalFetch=window.fetch.bind(window);
  const mainApi='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
  const marketplaceApi='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/marketplace-api';
  let layoutScriptPromise=null;

  window.fetch=(input,init={})=>{
    try{
      const url=typeof input==='string'?input:input?.url;
      if(url===mainApi&&typeof init.body==='string'){
        const p=JSON.parse(init.body);
        if(p?.action==='marketplace_base'||p?.action==='marketplace_import')return originalFetch(marketplaceApi,init);
      }
    }catch{}
    return originalFetch(input,init);
  };

  function ensureLayoutScript(){
    if(window.__pickingLayout)return Promise.resolve(window.__pickingLayout);
    if(layoutScriptPromise)return layoutScriptPromise;
    layoutScriptPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src='layout-picking-lite.js?v=20260916-1';s.async=true;
      s.onload=()=>resolve(window.__pickingLayout);s.onerror=()=>{layoutScriptPromise=null;reject(new Error('Não foi possível carregar o Layout.'));};
      document.body.appendChild(s);
    });
    return layoutScriptPromise;
  }

  setTimeout(()=>{
    const isColdRoomSku=(code,master)=>{const product=master.get(code),name=normText(product?.name||'');return name.includes('chopp')&&(name.includes('barril')||name.includes('keg'));};
    window.buildAreas=function(){
      const sales=state.reports.sales.data.values,picking=state.reports.picking.data.values,master=state.reports.catalog.data.values;
      const marketplaceSet=new Set((state.reports.marketplace?.data?.items||state.marketplaceItems).map(x=>normCode(x.sku_code)).filter(Boolean));
      const cold=new Set();for(const code of master.keys())if(isColdRoomSku(code,master))cold.add(code);
      return{
        Regulador:makeAreaRows(sales,master,code=>!marketplaceSet.has(code)&&!cold.has(code),true),
        Picking:makeAreaRows(picking,master,null,false),
        'Câmara Fria':makeAreaRows(sales,master,code=>cold.has(code),false),
        Marketplace:makeAreaRows(sales,master,code=>marketplaceSet.has(code),false)
      };
    };

    const source=document.getElementById('kpiSource');if(source){source.textContent='';source.style.display='none';}
    document.querySelectorAll('.nav-link').forEach(b=>{if(b.dataset.view!=='abc')b.remove();});
    document.getElementById('placeholderView')?.remove();

    const abcNav=document.querySelector('.nav-link[data-view="abc"]');
    const abcView=document.getElementById('abcView');
    if(!abcNav||!abcView)return;

    const layoutNav=document.createElement('button');
    layoutNav.className='nav-link';layoutNav.dataset.view='layout';layoutNav.innerHTML='<span>⌗</span> Layout';abcNav.insertAdjacentElement('afterend',layoutNav);

    const layoutView=document.createElement('section');layoutView.className='view hidden';layoutView.id='layoutView';
    layoutView.innerHTML='<div class="layout-module"><div class="layout-tabs"><button class="layout-tab active" data-layout-tab="picking">Picking</button></div><section class="layout-section" data-layout-panel="picking"></section></div>';
    abcView.insertAdjacentElement('afterend',layoutView);

    const activate=(target)=>{document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b===target));document.getElementById('sidebar')?.classList.remove('open');};
    abcNav.addEventListener('click',()=>{layoutView.classList.add('hidden');abcView.classList.remove('hidden');activate(abcNav);const t=document.getElementById('pageTitle'),s=document.getElementById('pageSubtitle');if(t)t.textContent='Curva ABC';if(s)s.textContent='Análise mensal por área operacional.';});
    layoutNav.addEventListener('click',async()=>{
      abcView.classList.add('hidden');layoutView.classList.remove('hidden');activate(layoutNav);
      const t=document.getElementById('pageTitle'),s=document.getElementById('pageSubtitle');if(t)t.textContent='Layout';if(s)s.textContent='Picking físico sincronizado com a Curva ABC.';
      try{const mod=await ensureLayoutScript();await mod?.open?.();}catch(e){showToast(e.message,true);}
    });

    document.documentElement.dataset.abcAreaRules='2026-09-16-picking-nao-v5';
    document.documentElement.dataset.layoutVersion='2026-09-16-layout-lite-v1';
  },0);
})();