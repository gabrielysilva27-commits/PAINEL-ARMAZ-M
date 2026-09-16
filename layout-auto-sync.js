(() => {
  function decoratePickingSync(){
    const updateButton=document.getElementById('pickingUpdate');
    if(updateButton && !document.getElementById('pickingSyncStatus')){
      const badge=document.createElement('div');
      badge.id='pickingSyncStatus';
      badge.setAttribute('role','status');
      badge.title='O Layout usa automaticamente a Curva ABC do Picking gerada pelo OCP 03.02.36.01 do mesmo mês.';
      badge.innerHTML='<span aria-hidden="true">●</span><strong>Sincronizado com Curva ABC</strong><small>OCP reaproveitado automaticamente</small>';
      badge.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #cfe8dc;border-radius:12px;background:#f4fbf7;color:#1e6548;font-size:12px;line-height:1.15;white-space:nowrap';
      const dot=badge.querySelector('span');if(dot)dot.style.cssText='font-size:10px;color:#2f9d68';
      const small=badge.querySelector('small');if(small)small.style.cssText='color:#6d8177;font-weight:500';
      updateButton.replaceWith(badge);
    }

    const modal=document.getElementById('pickingImportModal');
    if(modal)modal.remove();

    const note=document.querySelector('.picking-map-note');
    if(note && !note.dataset.autoSync){
      note.dataset.autoSync='1';
      note.textContent='207 vagas físicas • Flow Rack complementar • fonte automática: Curva ABC / OCP 03.02.36.01 • Marketplace, barris, BAGs e ativos de giro fora do Picking';
    }

    const audit=document.querySelector('.picking-audit');
    if(audit && !audit.dataset.autoSync){
      audit.dataset.autoSync='1';
      audit.innerHTML='<strong>Atualização automática:</strong> ao atualizar a Curva ABC do mês, o Layout reutiliza o Picking já calculado pelo OCP 03.02.36.01. Não é necessário subir o OCP novamente. A alocação física continua garantindo 1 posição por SKU elegível antes de multiplicar os itens de maior giro; o Flow Rack recebe somente a cauda extrema da Curva C.';
    }
  }

  const observer=new MutationObserver(decoratePickingSync);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decoratePickingSync);
  else decoratePickingSync();
})();
