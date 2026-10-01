(() => {
  const originalFetch=window.fetch.bind(window);
  const mainApi='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
  const marketplaceApi='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/marketplace-api';
  let layoutScriptPromise=null,blitzScriptPromise=null,pullObserver=null;

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

  function loadCss(href){if(document.querySelector(`link[href^="${href.split('?')[0]}"]`))return;const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);}
  function loadScript(src){return new Promise((resolve,reject)=>{if(document.querySelector(`script[src^="${src.split('?')[0]}"]`))return resolve();const s=document.createElement('script');s.src=src;s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error('Não foi possível carregar '+src));document.body.appendChild(s);});}
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
  function ensureBlitz(){loadCss('blitz.css?v=20261001-planilha-3');if(!blitzScriptPromise)blitzScriptPromise=loadScript('blitz.js?v=20261001-planilha-3');return blitzScriptPromise;}

  function ensurePuxadaMenu(){
    const nav=document.querySelector('.sidebar nav');
    if(!nav)return;
    if(!document.getElementById('puxadaMenuStyle')){
      const st=document.createElement('style');st.id='puxadaMenuStyle';st.textContent='.module-nav-group{display:grid;gap:3px}.module-nav-group .module-toggle{position:relative}.module-nav-group .module-toggle:after{content:"⌄";position:absolute;right:10px;color:#9b9ca1}.module-nav-group.open .module-toggle:after{content:"⌃"}.module-nav-group:not(.open) .module-submenu{display:none}.module-submenu{display:grid;gap:2px;margin:0 0 2px 18px}.module-submenu .module-sub-link{font-size:12px;padding:9px 10px 9px 8px;border-radius:8px;color:#7b7c82}.module-submenu .module-sub-link>span{width:22px}.module-submenu .module-sub-link.active{background:var(--orange-soft);color:#b95612}.module-nav-group.open>.module-toggle{font-weight:700;color:#5f6068}';
      document.head.appendChild(st);
    }
    let group=document.querySelector('.pull-nav-group');
    if(!group){
      group=document.createElement('div');group.className='module-nav-group pull-nav-group open';
      const toggle=document.createElement('button');toggle.type='button';toggle.className='nav-link module-toggle';toggle.innerHTML='<span>→</span> Puxada';
      const submenu=document.createElement('div');submenu.className='module-submenu';
      group.append(toggle,submenu);toggle.onclick=()=>group.classList.toggle('open');
      const anchor=document.querySelector('[data-view="efd"]')||document.querySelector('[data-view="abc"]')||nav.firstElementChild;
      if(anchor?.parentElement===nav)anchor.insertAdjacentElement('afterend',group);else nav.appendChild(group);
    }
    const submenu=group.querySelector('.module-submenu');
    const byView=v=>document.querySelector('.nav-link[data-view="'+CSS.escape(v)+'"]');
    const move=(view,html)=>{const btn=byView(view);if(!btn)return false;btn.innerHTML=html;btn.classList.add('module-sub-link');if(btn.parentElement!==submenu)submenu.appendChild(btn);return true;};
    const make=(view,html,ready)=>{let btn=byView(view);if(!btn){btn=document.createElement('button');btn.type='button';btn.className='nav-link module-sub-link';btn.dataset.view=view;submenu.appendChild(btn);}btn.innerHTML=html;btn.classList.add('module-sub-link');if(btn.parentElement!==submenu)submenu.appendChild(btn);btn.onclick=()=>{group.classList.add('open');let tries=18;const go=()=>{const fn=ready();if(typeof fn==='function'){fn();return;}if(--tries>0)setTimeout(go,180);else window.showToast?.('Módulo ainda carregando. Tente novamente em alguns segundos.',true);};go();};};
    move('layout','<span>⌗</span> Layout');
    move('stock-base','<span>▦</span> Físico × Sistema');
    move('replenishment','<span>↻</span> Reabastecimento');
    make('pull-oor','<span>⊙</span> OOR',()=>window.__stockOor?.open);
    make('pull-policy','<span>▦</span> Política de Estoque',()=>window.__stockPolicy?.open);
    move('pull-pedforme','<span>▤</span> Pedforme');
    move('temperature','<span>°</span> Temperatura');
    if(!pullObserver){pullObserver=new MutationObserver(()=>ensurePuxadaMenu());pullObserver.observe(nav,{childList:true,subtree:true});}
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
    document.getElementById('placeholderView')?.remove();

    const abcNav=document.querySelector('.nav-link[data-view="abc"]');
    const abcView=document.getElementById('abcView');
    if(!abcNav||!abcView)return;
    abcNav.onclick=null;

    let layoutNav=document.querySelector('.nav-link[data-view="layout"]');
    if(!layoutNav){
      layoutNav=document.createElement('button');
      layoutNav.className='nav-link';layoutNav.dataset.view='layout';layoutNav.innerHTML='<span>⌗</span> Layout';abcNav.insertAdjacentElement('afterend',layoutNav);
    }

    let layoutView=document.getElementById('layoutView');
    if(!layoutView){
      layoutView=document.createElement('section');layoutView.className='view hidden';layoutView.id='layoutView';
      layoutView.innerHTML='<div class="layout-module"><div class="layout-tabs"><button class="layout-tab active" data-layout-tab="picking">Picking</button></div><section class="layout-section" data-layout-panel="picking"></section></div>';
      abcView.insertAdjacentElement('afterend',layoutView);
    }

    const activate=(target)=>{document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b===target));document.getElementById('sidebar')?.classList.remove('open');};
    abcNav.addEventListener('click',()=>{layoutView.classList.add('hidden');abcView.classList.remove('hidden');activate(abcNav);const t=document.getElementById('pageTitle'),s=document.getElementById('pageSubtitle');if(t)t.textContent='Curva ABC';if(s)s.textContent='Análise mensal por área operacional.';});
    layoutNav.addEventListener('click',async()=>{
      document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));
      layoutView.classList.remove('hidden');activate(layoutNav);
      const t=document.getElementById('pageTitle'),s=document.getElementById('pageSubtitle');if(t)t.textContent='Layout';if(s)s.textContent='Picking físico sincronizado com a Curva ABC.';
      try{const mod=await ensureLayoutScript();await mod?.open?.();}catch(e){showToast(e.message,true);}
    });
    ensurePuxadaMenu();
    setTimeout(ensurePuxadaMenu,400);setTimeout(ensurePuxadaMenu,1200);setTimeout(ensurePuxadaMenu,3000);
    ensureBlitz().catch(e=>showToast?.(e.message,true));

    document.documentElement.dataset.abcAreaRules='2026-09-16-picking-nao-v5';
    document.documentElement.dataset.layoutVersion='2026-09-16-layout-lite-v1';
    document.documentElement.dataset.blitzVersion='2026-10-01-planilha-3';
  },0);
})();