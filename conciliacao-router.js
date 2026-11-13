(()=>{
 let modulePromise,mounted=false,root;
 async function open(){document.querySelectorAll('main>.view').forEach(v=>v.classList.add('hidden'));root.classList.remove('hidden');document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view==='conciliacao'));document.getElementById('pageTitle').textContent='Conciliação';document.getElementById('pageSubtitle').textContent='Recontagem de estoque · Controle e armazém';document.getElementById('sidebar')?.classList.remove('open');
  if(!document.querySelector('link[data-conciliacao]')){const css=document.createElement('link');css.rel='stylesheet';css.href='conciliacao.css?v=20261113-send-12';css.dataset.conciliacao='1';document.head.append(css);}
  root.innerHTML='<p>Carregando conciliação…</p>';try{if(!modulePromise)modulePromise=import('./conciliacao.mjs?v=20261113-send-12').catch(e=>{modulePromise=null;throw e;});await(await modulePromise).mountConciliacao(root);}catch(e){root.textContent=e.message;}
 }
 function mount(){if(mounted)return;const menu=document.querySelector('.control-submenu'),main=document.querySelector('main');if(!menu||!main)return setTimeout(mount,200);mounted=true;root=document.createElement('section');root.id='conciliacaoView';root.className='view hidden';main.append(root);const b=document.createElement('button');b.className='nav-link control-sub-link';b.dataset.view='conciliacao';b.innerHTML='<span>⇄</span> Conciliação';b.onclick=open;menu.append(b);document.addEventListener('click',e=>{const n=e.target.closest?.('.nav-link');if(n&&n.dataset.view!=='conciliacao'&&!n.classList.contains('control-nav-parent'))root.classList.add('hidden');},true);}
 mount();
})();
