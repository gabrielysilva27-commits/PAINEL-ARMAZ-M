(() => {
  'use strict';
  const networkFetch=window.fetch.bind(window),pending=new Map(),scripts=new Map();
  const apiPrefix='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/';
  const readActions=new Set(['dashboard','get','historical','month_bundle','months','marketplace_base','permissions','admin_workers']);
  async function readRequest(input,init){
    for(let attempt=0;attempt<2;attempt++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      try{
        const response=await networkFetch(input,{...init,signal:controller.signal});
        if(attempt===0&&[502,503,504].includes(response.status)){await response.body?.cancel();continue;}
        return response;
      }catch(error){
        if(controller.signal.aborted)throw new Error('A consulta demorou mais que o esperado. Tente atualizar novamente.');
        if(attempt===0&&error instanceof TypeError)continue;
        throw error;
      }finally{clearTimeout(timer);}
    }
  }
  window.fetch=function(input,init={}){
    const url=typeof input==='string'?input:input?.url;
    let action;try{action=typeof init.body==='string'?JSON.parse(init.body).action:null}catch{}
    // Never repeat writes, login attempts or requests controlled by the caller.
    if(!url?.startsWith(apiPrefix)||init.method!=='POST'||init.signal||!readActions.has(action))return networkFetch(input,init);
    const headers=new Headers(init.headers),key=JSON.stringify([url,[...headers.entries()].sort((a,b)=>a[0].localeCompare(b[0])),init.body]);
    let promise=pending.get(key);
    if(!promise){promise=readRequest(input,init);pending.set(key,promise);promise.then(()=>{if(pending.get(key)===promise)pending.delete(key)},()=>{if(pending.get(key)===promise)pending.delete(key)});}
    return promise.then(response=>response.clone());
  };
  function loadScript(src){
    const key=new URL(src,document.baseURI).href.split('?')[0];
    if(scripts.has(key))return scripts.get(key);
    const existing=[...document.scripts].find(s=>s.src.split('?')[0]===key);
    if(existing&&document.readyState!=='loading')return Promise.resolve();
    const script=existing||document.createElement('script');
    const promise=new Promise((resolve,reject)=>{
      const timer=setTimeout(failed,30000);
      function done(){clearTimeout(timer);script.removeEventListener('load',done);script.removeEventListener('error',failed);resolve();}
      function failed(){clearTimeout(timer);script.removeEventListener('load',done);script.removeEventListener('error',failed);if(!existing)script.remove();scripts.delete(key);reject(new Error('Não foi possível carregar o módulo. Tente abri-lo novamente.'));}
      script.addEventListener('load',done,{once:true});script.addEventListener('error',failed,{once:true});
      if(!existing){script.src=src;script.async=true;document.body.appendChild(script);}
    });
    scripts.set(key,promise);return promise;
  }
  window.__panelRuntime={loadScript};
})();
