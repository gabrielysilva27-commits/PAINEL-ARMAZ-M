(() => {
  let loading=null;const $=id=>document.getElementById(id);
  function assets(){if(window.__receivingNri)return Promise.resolve(window.__receivingNri);if(loading)return loading;loading=new Promise((resolve,reject)=>{if(!$('receivingNriCss')){const l=document.createElement('link');l.id='receivingNriCss';l.rel='stylesheet';l.href='receiving-nri.css?v=20260920-5';document.head.appendChild(l)}const s=document.createElement('script');s.src='receiving-nri.js?v=20260920-5';s.async=true;s.onload=()=>resolve(window.__receivingNri);s.onerror=()=>reject(new Error('Falha ao carregar Recebimento / NRI'));document.body.appendChild(s)});return loading}
  async function openNri(){try{const m=await assets();await m.openNri()}catch(e){showToast(String(e.message||e),true)}}
  async function openPull(){try{const m=await assets();await m.openPull()}catch(e){showToast(String(e.message||e),true)}}
  function mount(){
    if(document.querySelector('.receiving-nav-group'))return;
    const quality=document.querySelector('[data-view="receiving-quality"]'),nav=document.querySelector('.sidebar nav'),main=document.querySelector('main');
    if(!quality||!nav||!main)return setTimeout(mount,160);
    const group=document.createElement('div');group.className='module-nav-group receiving-nav-group open';
    const parent=document.createElement('button');parent.className='nav-link module-nav-parent';parent.type='button';parent.innerHTML='<span>⇩</span> Recebimento <span class="module-chevron">⌄</span>';
    const submenu=document.createElement('div');submenu.className='module-submenu';
    nav.insertBefore(group,quality);group.appendChild(parent);group.appendChild(submenu);quality.classList.add('module-sub-link');quality.innerHTML='<span>✓</span> Qualidade';submenu.appendChild(quality);
    const nri=document.createElement('button');nri.className='nav-link module-sub-link';nri.dataset.view='receiving-nri';nri.innerHTML='<span>▤</span> NRI';nri.onclick=openNri;submenu.appendChild(nri);parent.onclick=()=>group.classList.toggle('open');
    const nriView=document.createElement('section');nriView.id='receivingNriView';nriView.className='view hidden';main.appendChild(nriView);
    const pullGroup=document.createElement('div');pullGroup.className='module-nav-group pull-nav-group open';const pullParent=document.createElement('button');pullParent.className='nav-link module-nav-parent';pullParent.type='button';pullParent.innerHTML='<span>↔</span> Puxada <span class="module-chevron">⌄</span>';const pullSub=document.createElement('div');pullSub.className='module-submenu';const pull=document.createElement('button');pull.className='nav-link module-sub-link';pull.dataset.view='pull-compare';pull.innerHTML='<span>≋</span> Físico × Sistema';pull.onclick=openPull;pullSub.appendChild(pull);pullGroup.appendChild(pullParent);pullGroup.appendChild(pullSub);pullParent.onclick=()=>pullGroup.classList.toggle('open');
    const control=document.querySelector('.control-nav-group');(control||group).insertAdjacentElement('afterend',pullGroup);
    const pullView=document.createElement('section');pullView.id='pullCompareView';pullView.className='view hidden';main.appendChild(pullView);
    for(const x of document.querySelectorAll('.nav-link:not([data-view="receiving-nri"]):not([data-view="pull-compare"])'))x.addEventListener('click',()=>{nriView.classList.add('hidden');pullView.classList.add('hidden')});
  }
  setTimeout(mount,440);
})();