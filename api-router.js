(() => {
  const originalFetch = window.fetch.bind(window);
  const mainApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
  const marketplaceApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/marketplace-api';
  let layoutScriptPromise = null;
  let blitzScriptPromise = null;

  window.fetch = (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url;
      if (url === mainApi && typeof init.body === 'string') {
        const payload = JSON.parse(init.body);
        if (payload?.action === 'marketplace_base' || payload?.action === 'marketplace_import') {
          return originalFetch(marketplaceApi, init);
        }
      }
    } catch {}
    return originalFetch(input, init);
  };

  function loadCss(href) {
    const base = href.split('?')[0];
    if (document.querySelector(`link[href^="${base}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const base = src.split('?')[0];
      if (document.querySelector(`script[src^="${base}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar ' + src));
      document.body.appendChild(script);
    });
  }

  function activateNav(button) {
    document.querySelectorAll('.nav-link').forEach(item => item.classList.toggle('active', item === button));
    document.getElementById('sidebar')?.classList.remove('open');
  }

  function ensureView(id) {
    let view = document.getElementById(id);
    if (!view) {
      view = document.createElement('section');
      view.id = id;
      view.className = 'view hidden';
      document.querySelector('main')?.appendChild(view);
    }
    return view;
  }

  function showOnly(view) {
    document.querySelectorAll('main > .view').forEach(item => item.classList.add('hidden'));
    view.classList.remove('hidden');
  }

  function ensureLayoutScript() {
    if (window.__pickingLayout) return Promise.resolve(window.__pickingLayout);
    if (layoutScriptPromise) return layoutScriptPromise;
    layoutScriptPromise = loadScript('layout-picking-lite.js?v=20260916-1').then(() => window.__pickingLayout);
    return layoutScriptPromise;
  }

  function ensureBlitz() {
    loadCss('blitz.css?v=20261001-dia-2');
    if (!blitzScriptPromise) blitzScriptPromise = loadScript('blitz.js?v=20261001-dia-2');
    return blitzScriptPromise;
  }

  function installAreaRules() {
    try {
      if (typeof state === 'undefined' || typeof makeAreaRows !== 'function') return;
      window.buildAreas = function () {
        const sales = state.reports.sales.data.values;
        const picking = state.reports.picking.data.values;
        const master = state.reports.catalog.data.values;
        const marketplaceSet = new Set((state.reports.marketplace?.data?.items || state.marketplaceItems || []).map(x => normCode(x.sku_code)).filter(Boolean));
        const cold = new Set();
        for (const code of master.keys()) {
          const product = master.get(code);
          const name = normText(product?.name || '');
          if (name.includes('chopp') && (name.includes('barril') || name.includes('keg'))) cold.add(code);
        }
        return {
          Regulador: makeAreaRows(sales, master, code => !marketplaceSet.has(code) && !cold.has(code), true),
          Picking: makeAreaRows(picking, master, null, false),
          'Câmara Fria': makeAreaRows(sales, master, code => cold.has(code), false),
          Marketplace: makeAreaRows(sales, master, code => marketplaceSet.has(code), false)
        };
      };
    } catch (error) {
      console.warn('Regras ABC não aplicadas:', error);
    }
  }

  function addNavButton(view, icon, label, afterSelector, handler) {
    const existing = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (existing) {
      existing.onclick = handler;
      return existing;
    }
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return null;
    const button = document.createElement('button');
    button.className = 'nav-link';
    button.dataset.view = view;
    button.innerHTML = `<span>${icon}</span> ${label}`;
    button.onclick = handler;
    const anchor = afterSelector ? document.querySelector(afterSelector) : null;
    if (anchor?.parentElement === nav) anchor.insertAdjacentElement('afterend', button);
    else nav.appendChild(button);
    return button;
  }

  function installLayout() {
    const abcView = document.getElementById('abcView');
    if (!abcView) return;
    const layoutView = ensureView('layoutView');
    if (!layoutView.dataset.ready) {
      layoutView.innerHTML = '<div class="layout-module"><div class="layout-tabs"><button class="layout-tab active" data-layout-tab="picking">Picking</button></div><section class="layout-section" data-layout-panel="picking"></section></div>';
      layoutView.dataset.ready = '1';
    }
    addNavButton('layout', '⌗', 'Layout', '.nav-link[data-view="abc"]', async event => {
      const button = event.currentTarget;
      showOnly(layoutView);
      activateNav(button);
      const title = document.getElementById('pageTitle');
      const subtitle = document.getElementById('pageSubtitle');
      if (title) title.textContent = 'Layout';
      if (subtitle) subtitle.textContent = 'Picking físico sincronizado com a Curva ABC.';
      try {
        const module = await ensureLayoutScript();
        await module?.open?.();
      } catch (error) {
        window.showToast?.(error.message, true);
      }
    });
  }

  function installBlitz() {
    addNavButton('blitz', '✦', 'Blitz', null, async event => {
      const button = event.currentTarget;
      const view = ensureView('blitzView');
      showOnly(view);
      activateNav(button);
      const title = document.getElementById('pageTitle');
      const subtitle = document.getElementById('pageSubtitle');
      if (title) title.textContent = 'Blitz de Puxada';
      if (subtitle) subtitle.textContent = 'Lançamento Perda no padrão da planilha.';
      view.innerHTML = '<section class="blitz-panel">Carregando Blitz…</section>';
      try {
        await ensureBlitz();
        if (typeof window.openBlitz === 'function') window.openBlitz();
      } catch (error) {
        view.innerHTML = '<section class="blitz-panel"><h2>Erro ao carregar</h2><p>' + String(error.message || error) + '</p></section>';
      }
    });
  }

  function boot() {
    const source = document.getElementById('kpiSource');
    if (source) {
      source.textContent = '';
      source.style.display = 'none';
    }
    document.getElementById('placeholderView')?.remove();
    installAreaRules();
    installLayout();
    installBlitz();
    document.documentElement.dataset.abcAreaRules = '2026-10-01-clean-router';
    document.documentElement.dataset.blitzVersion = '2026-10-01-dia-2';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else setTimeout(boot, 0);
})();