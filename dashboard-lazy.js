(() => {
  let navigation=0;
  document.addEventListener('click',event=>{if(event.target.closest?.('.nav-link'))navigation++;},true);
  const entries=[
    {id:'efc',label:'Carregamento / EFC',js:'./efc.js?v=20261110-mixed-pallets-1',css:'efc.css?v=20261006-boxes-average'},
    {id:'productivity',label:'Produtividade / WLP',js:'./productivity.js?v=20261007-audit-1',css:'productivity.css?v=20261006-team-1'}
  ];
  function mount(){
    const nav=document.querySelector('.sidebar nav');if(!nav)return;
    for(const entry of entries){
      if(nav.querySelector('[data-view="'+entry.id+'"]'))continue;
      const button=document.createElement('button');button.className='nav-link';button.dataset.view=entry.id;button.textContent=entry.label;
      let pending=null;
      button.onclick=async()=>{
        if(pending)return;
        const turn=navigation;
        button.disabled=true;button.textContent='Carregando '+entry.label+'…';
        if(!document.querySelector('link[data-lazy-style="'+entry.id+'"]')){
          const link=document.createElement('link');link.rel='stylesheet';link.href=entry.css;link.dataset.lazyStyle=entry.id;document.head.appendChild(link);
        }
        // Let the existing module install its own navigation and all its handlers.
        button.removeAttribute('data-view');
        pending=import(entry.js);
        try{
          await pending;
          const actual=nav.querySelector('[data-view="'+entry.id+'"]');
          if(!actual)throw new Error('Não foi possível iniciar o módulo.');
          button.remove();
          if(turn===navigation)actual.click();
        }catch(error){
          button.dataset.view=entry.id;button.disabled=false;button.textContent=entry.label;pending=null;
          window.showToast?.('Não foi possível abrir '+entry.label+'. Tente novamente.',true);
        }
      };
      nav.appendChild(button);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
