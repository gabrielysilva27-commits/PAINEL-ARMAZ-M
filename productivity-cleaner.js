(() => {
  const ROOT_ID = 'productivityView';
  const hiddenTexts = [
    'ignorado no WLP histórico',
    'Richard ainda não fazia parte da equipe',
    'Everton ainda não estava na função',
    'Férias confirmadas; ignorado'
  ];
  const boringPanels = [
    'Bases e memória de cálculo',
    'Funções confirmadas',
    'Manobras e descargas',
    'Pendências para fechar os indicadores'
  ];
  const simplify = (text) => {
    if (!text) return text;
    if (text.includes('Conferência C rateada')) return 'Rateio C: sem apontamento nominal no mês';
    if (text.includes('Código de presença validado')) return 'Presença validada';
    if (text.includes('Produção nominal da EFC')) return 'Base EFC nominal';
    if (text.includes('Função confirmada: Alex')) return 'Conferente cheio confirmado';
    if (text.includes('Função confirmada: Tiago')) return 'Conferente vazio confirmado';
    if (text.includes('Estimativa de retorno esperado')) return 'Refugo estimado por SAROBA';
    if (text.includes('Jornada pela presença')) return 'Presença + produção histórica';
    if (text.includes('Parcial até 18/09')) return 'Setembro parcial até 18/09';
    return text.length > 120 ? text.slice(0, 117) + '…' : text;
  };
  function cleanWlp() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.cleanApplied === 'running') return;
    root.dataset.cleanApplied = 'running';
    root.classList.add('wlp-clean-v2');

    const toolbarText = root.querySelector('.wlp-toolbar span');
    if (toolbarText) toolbarText.textContent = 'Histórico WLP individual • bases corrigidas';

    root.querySelectorAll('.wlp-panel').forEach(panel => {
      const h2 = panel.querySelector('h2')?.textContent?.trim() || '';
      if (boringPanels.some(x => h2.includes(x))) panel.classList.add('wlp-technical-hidden');
      if (h2.includes('Produção e produtividade')) panel.classList.add('wlp-main-productivity');
      if (h2.includes('Volumes conferidos')) panel.classList.add('wlp-month-summary');
    });

    root.querySelectorAll('.wlp-notice, .wlp-panel p').forEach(p => {
      const text = p.textContent || '';
      if (text.includes('Histórico mensal de 2026')) {
        p.textContent = 'Visão mensal da produtividade individual. O WLP oficial continua global; aqui aparece o desdobramento por pessoa/função.';
      }
      if (text.length > 350 && !p.closest('.wlp-technical-hidden')) {
        p.textContent = 'Produção atribuída dividida por HH calculada. Bases estimadas ou rateadas ficam sinalizadas.';
      }
    });

    root.querySelectorAll('tr').forEach(tr => {
      const txt = tr.textContent || '';
      if (hiddenTexts.some(x => txt.includes(x))) tr.remove();
    });

    root.querySelectorAll('.wlp-warning').forEach(el => {
      el.textContent = simplify(el.textContent || '');
      el.classList.add('wlp-tag');
    });

    root.querySelectorAll('.wlp-table td').forEach(td => {
      if ((td.textContent || '').trim() === '— null') td.textContent = '—';
    });

    delete root.dataset.cleanApplied;
  }
  const obs = new MutationObserver(() => cleanWlp());
  function start() {
    const root = document.getElementById(ROOT_ID);
    if (root) obs.observe(root, { childList: true, subtree: true });
    cleanWlp();
  }
  document.addEventListener('DOMContentLoaded', start);
  setInterval(cleanWlp, 1200);
})();
