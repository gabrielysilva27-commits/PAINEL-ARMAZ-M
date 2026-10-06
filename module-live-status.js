(() => {
  // Visual indication of the existing automatic feeds. No new fetching,
  // timers or changes to module navigation / calculation are introduced.
  const feeds = {
    efd: ['Agente · PCD e 031120', false],
    efc: ['Bases automáticas · MAPAS, 031120, 03023601 e segmentações. Outras informações ainda dependem de planilhas. Rotinas noturnas a partir das 21h.', true],
    'pull-oor': ['Base automática · 020502. Malha semanal e parâmetros continuam manuais.', true],
    productivity: ['Produção integrada aos módulos. Fontes manuais continuam dependendo de atualização.', true],
    repack: ['Lançamentos atuais dos cronômetros dos ajudantes.', false],
    blitz: ['Carretas do 031120 e lançamentos dos conferentes.', false],
    'receiving-nri': ['Registros operacionais de recebimento e integração com o agente.', false],
    'receiving-putaway': ['Registros de descarga e guarda feitos na operação.', false],
    'pull-compare': ['Cruzamento com o 020501 coletado pelo agente.', false],
    'receiving-quality': ['Conferências recebidas pelo formulário e base 031120 do agente.', false],
    'quality-rounds': ['Registros recebidos pelo formulário de ronda.', false],
    temperature: ['Medições registradas pela operação.', false],
  };
  function install() {
    const heading = document.getElementById('pageTitle');
    const nav = document.querySelector('.sidebar nav');
    const shell = document.getElementById('appShell');
    if (!heading || !nav || !shell || document.getElementById('moduleLiveStatus')) return;
    const badge = document.createElement('span');
    badge.id = 'moduleLiveStatus'; badge.className = 'module-live-status'; badge.hidden = true;
    const dot = document.createElement('i'); dot.className = 'module-live-dot'; dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    const scope = document.createElement('small');
    badge.append(dot, label, scope); heading.after(badge);
    let last = '';
    function update() {
      const id = nav.querySelector('.nav-link.active[data-view]')?.dataset.view;
      const feed = feeds[id]; const online = navigator.onLine !== false;
      const visible = !!feed && !shell.classList.contains('hidden');
      const key = [id, online, visible].join('|'); if (key === last) return; last = key;
      badge.hidden = !visible; heading.classList.toggle('module-live-title', visible);
      if (!visible) return;
      badge.classList.toggle('is-offline', !online);
      label.textContent = online ? 'TEMPO REAL' : 'SEM CONEXÃO';
      scope.textContent = online && feed[1] ? 'BASES AUTOMÁTICAS' : '';
      scope.hidden = !scope.textContent;
      badge.title = feed[0] + ' O indicador identifica a alimentação automática; não confirma que o agente esteja conectado nem a conclusão da última coleta.';
      badge.setAttribute('aria-label', label.textContent + (scope.textContent ? ' · ' + scope.textContent : '') + '. ' + feed[0]);
    }
    // Observe only menu selection/mount and login visibility. Never the data
    // tables, charts or form trees, so their rendering creates no extra work.
    const observer = new MutationObserver(update);
    observer.observe(nav, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
    observer.observe(shell, {attributes:true, attributeFilter:['class']});
    window.addEventListener('online', update); window.addEventListener('offline', update);
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})();
