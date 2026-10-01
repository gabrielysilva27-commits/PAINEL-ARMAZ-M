(()=>{
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const critical=['curva abc','eficiencia de descarga','produtividade wlp','carregamento efc','layout','estoque x estoque','reabastecimento','ronda de qualidade','qualidade do recebimento','repack'];
  const aliases={
    'produtividade wlp':['produtividade wlp','produtividade wlp individual'],
    'carregamento efc':['carregamento efc','carregamento e operacao efc','efc'],
    'qualidade do recebimento':['qualidade do recebimento','recebimento qualidade'],
    'eficiencia de descarga':['eficiencia de descarga','efd'],
    'curva abc':['curva abc'],layout:['layout'],
    'estoque x estoque':['estoque x estoque','fisico x sistema'],
    reabastecimento:['reabastecimento'],
    'ronda de qualidade':['ronda de qualidade'],
    repack:['repack']
  };
  const textOf=el=>norm(el?.textContent||'');
  function linkFor(key,links){const a=aliases[key]||[key];return links.find(l=>a.some(x=>textOf(l).includes(norm(x))));}
  function audit(){
    const nav=document.querySelector('.sidebar nav');
    if(!nav)return;
    const links=[...nav.querySelectorAll('.nav-link[data-view]')];
    const seen=new Set();
    for(const l of links){const id=l.dataset.view||textOf(l);if(seen.has(id))l.remove();else seen.add(id);}
    const fresh=[...nav.querySelectorAll('.nav-link[data-view]')];
    const ordered=[];
    for(const key of critical){const l=linkFor(key,fresh);if(l&&!ordered.includes(l)){l.dataset.panelCritical='true';ordered.push(l);}}
    for(let i=ordered.length-1;i>=0;i--)nav.insertBefore(ordered[i],nav.firstElementChild);
    const current=[...nav.querySelectorAll('.nav-link[data-view]')];
    const missing=critical.filter(k=>!linkFor(k,current));
    nav.dataset.audited='true';
    window.__panelModuleHealth={checked_at:new Date().toISOString(),loaded:current.map(x=>({view:x.dataset.view,label:x.textContent.trim()})),missing};
    if(missing.length)console.warn('[Painel Armazem] Modulos nao registrados no menu:',missing);
  }
  [300,1200,3000,6500].forEach(ms=>setTimeout(audit,ms));
  window.__auditPanelModules=audit;
})();
