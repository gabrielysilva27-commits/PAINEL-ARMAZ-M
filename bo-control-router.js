(() => {
  let loading=null;const $=id=>document.getElementById(id);

  function ensureAssets(){
    if(window.__boControl)return Promise.resolve(window.__boControl);
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      if(!$('boControlCss')){const l=document.createElement('link');l.id='boControlCss';l.rel='stylesheet';l.href='bo-control.css?v=20260919-7';document.head.appendChild(l);}
      const s=document.createElement('script');s.src='bo-control.js?v=20260919-9';s.async=true;s.onload=()=>resolve(window.__boControl);s.onerror=()=>reject(new Error('Falha ao carregar Controle de B.O.'));document.body.appendChild(s);
    });return loading;
  }

  async function open(){
    document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
    $('boControlView')&&$('boControlView').classList.remove('hidden');
    const nav=document.querySelector('[data-view="bo-control"]');if(nav)nav.classList.add('active');
    const group=document.querySelector('.control-nav-group');if(group)group.classList.add('open');
    $('sidebar')&&$('sidebar').classList.remove('open');
    try{const mod=await ensureAssets();await mod.open();}catch(e){if($('boControlView'))$('boControlView').innerHTML='<p class="form-error">'+String(e.message||e)+'</p>';}
  }

  function mount(){
    if(document.querySelector('.control-nav-group'))return;
    const anchor=document.querySelector('[data-view="receiving-quality"]')||document.querySelector('[data-view="quality-rounds"]')||document.querySelector('[data-view="abc"]');
    const main=document.querySelector('main');
    if(!anchor||!main)return setTimeout(mount,160);

    const group=document.createElement('div');group.className='control-nav-group open';
    const parent=document.createElement('button');parent.type='button';parent.className='nav-link control-nav-parent';parent.innerHTML='<span>▣</span> Controle <span class="control-chevron">⌄</span>';
    const submenu=document.createElement('div');submenu.className='control-submenu';
    const bo=document.createElement('button');bo.className='nav-link control-sub-link';bo.dataset.view='bo-control';bo.innerHTML='<span>☑</span> B.O.';bo.onclick=open;
    submenu.appendChild(bo);group.appendChild(parent);group.appendChild(submenu);anchor.insertAdjacentElement('afterend',group);
    parent.onclick=()=>group.classList.toggle('open');

    const view=document.createElement('section');view.id='boControlView';view.className='view hidden';main.appendChild(view);
    for(const n of document.querySelectorAll('.nav-link:not([data-view="bo-control"])'))n.addEventListener('click',()=>view.classList.add('hidden'));
  }
  setTimeout(mount,300);
})();