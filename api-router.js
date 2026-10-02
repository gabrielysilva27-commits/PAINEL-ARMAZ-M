(() => {
  const originalFetch = window.fetch.bind(window);
  const mainApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
  const marketplaceApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/marketplace-api';
  let layoutScriptPromise = null;
  let blitzScriptPromise = null;
  let booted = false;

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

  function ensureLayoutScript() {
    if (window.__pickingLayout) return Promise.resolve(window.__pickingLayout);
    if (layoutScriptPromise) return layoutScriptPromise;
    layoutScriptPromise = loadScript('layout-picking-lite.js?v=20260916-1').then(() => window.__pickingLayout);
    return layoutScriptPromise;
  }

  function ensureBlitz() {
    loadCss('blitz.css?v=20261002-design-1');
    if (!blitzScriptPromise) blitzScriptPromise = loadScript('blitz.js?v=20261002-design-1');
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

  function ensurePuxadaStyle() {
    if (document.getElementById('puxadaMenuStyle')) return;
    const style = document.createElement('style');
    style.id = 'puxadaMenuStyle';
    style.textContent = `
      .module-nav-group{display:grid;gap:3px}
      .module-nav-group .module-toggle{position:relative}
      .module-nav-group .module-toggle:after{content:"⌄";position:absolute;right:10px;color:#9b9ca1}
      .module-nav-group.open .module-toggle:after{content:"⌃"}
      .module-nav-group:not(.open) .module-submenu{display:none}
      .module-submenu{display:grid;gap:2px;margin:0 0 2px 18px}
      .module-submenu .module-sub-link{font-size:12px;padding:9px 10px 9px 8px;border-radius:8px;color:#7b7c82}
      .module-submenu .module-sub-link>span{width:22px}
      .module-submenu .module-sub-link.active{background:var(--orange-soft,#fff1e6);color:#b95612}
      .module-nav-group.open>.module-toggle{font-weight:700;color:#5f6068}
    `;
    document.head.appendChild(style);
  }

  function ensurePuxadaGroup() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return null;
    ensurePuxadaStyle();
    let group = document.querySelector('.pull-nav-group');
    if (!group) {
      group = document.createElement('div');
      group.className = 'module-nav-group pull-nav-group open';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'nav-link module-toggle';
      toggle.innerHTML = '<span>→</span> Puxada';
      const submenu = document.createElement('div');
      submenu.className = 'module-submenu';
      group.append(toggle, submenu);
      toggle.onclick = () => group.classList.toggle('open');
      const anchor = document.querySelector('.control-nav-group') || document.querySelector('.nav-link[data-view="abc"]') || nav.firstElementChild;
      if (anchor?.parentElement === nav) anchor.insertAdjacentElement('afterend', group);
      else nav.appendChild(group);
    }
    return group;
  }

  function moveExistingToPuxada(view, icon, label) {
    const group = ensurePuxadaGroup();
    const submenu = group?.querySelector('.module-submenu');
    const button = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (!submenu || !button) return null;
    button.innerHTML = `<span>${icon}</span> ${label}`;
    button.classList.add('module-sub-link');
    if (button.parentElement !== submenu) submenu.appendChild(button);
    return button;
  }

  function createPuxadaButton(view, icon, label) {
    const group = ensurePuxadaGroup();
    const submenu = group?.querySelector('.module-submenu');
    if (!submenu) return null;
    let button = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-link';
      button.dataset.view = view;
    }
    button.innerHTML = `<span>${icon}</span> ${label}`;
    button.classList.add('module-sub-link');
    if (button.parentElement !== submenu) submenu.appendChild(button);
    return button;
  }

  function installPuxadaMenu() {
    ensurePuxadaGroup();
    moveExistingToPuxada('pull-compare', '≋', 'Físico × Sistema');

    const oor = createPuxadaButton('pull-oor', '⊙', 'OOR');
    if (oor) oor.onclick = async event => {
      activateNav(event.currentTarget);
      document.querySelector('.pull-nav-group')?.classList.add('open');
      try {
        if (!window.__stockOor) await loadScript('oor.js?v=20260928-1');
        window.__stockOor?.open?.();
      } catch (error) {
        window.showToast?.(error.message || String(error), true);
      }
    };

    const policy = createPuxadaButton('pull-policy', '▦', 'Política de Estoque');
    if (policy) policy.onclick = async event => {
      activateNav(event.currentTarget);
      document.querySelector('.pull-nav-group')?.classList.add('open');
      try {
        if (!window.__stockPolicy) await loadScript('stock-policy.js?v=20260924-3');
        window.__stockPolicy?.open?.();
      } catch (error) {
        window.showToast?.(error.message || String(error), true);
      }
    };
  }

  // Reconcile existing buttons without replacing their module click handlers.
  // Child-list changes also cover modules that mount after the initial page load.
  function reconcileMenu() {
    installPuxadaMenu();
    const nav = document.querySelector('.sidebar nav');
    const group = document.querySelector('.pull-nav-group');
    const submenu = group?.querySelector('.module-submenu');
    if (!nav || !submenu) return;

    for (const view of ['layout', 'replenishment', 'stock-base']) {
      const button = submenu.querySelector(`[data-view="${view}"]`);
      if (!button) continue;
      button.classList.remove('module-sub-link');
      if (view === 'stock-base') button.innerHTML = '<span>▦</span> Estoque x Estoque';
      nav.insertBefore(button, group);
    }

    for (const view of ['pull-compare', 'pull-oor', 'pull-policy', 'pull-pedforme']) {
      const button = document.querySelector(`.nav-link[data-view="${view}"]`);
      if (!button) continue;
      button.classList.add('module-sub-link');
      if (button.parentElement !== submenu) submenu.appendChild(button);
    }

    for (const view of ['temperature', 'productivity', 'repack', 'efc']) {
      const button = document.querySelector(`.nav-link[data-view="${view}"]`);
      if (!button) continue;
      button.classList.remove('module-sub-link');
      if (button.parentElement !== nav) nav.appendChild(button);
    }
    sortMenuAlphabetically(nav);
  }

  const menuCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
  function menuLabel(item) {
    const button = item.matches('.nav-link') ? item : item.querySelector('.nav-link');
    const copy = (button || item).cloneNode(true);
    copy.querySelectorAll('span').forEach(icon => icon.remove());
    return copy.textContent.trim();
  }
  function sortMenuAlphabetically(nav) {
    const sortChildren = container => {
      const sorted = [...container.children].sort((a, b) => menuCollator.compare(menuLabel(a), menuLabel(b)));
      sorted.forEach((item, index) => {
        if (container.children[index] !== item) container.insertBefore(item, container.children[index] || null);
      });
    };
    nav.querySelectorAll('.module-submenu, .control-submenu').forEach(sortChildren);
    sortChildren(nav);
  }

  let menuObserver = null;
  function watchMenu() {
    if (menuObserver) return;
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    menuObserver = new MutationObserver(records => {
      // Ignore text/icon changes: only module insertions/removals need reconciliation.
      if (records.some(record => [...record.addedNodes, ...record.removedNodes]
        .some(node => node.nodeType === 1 && node.matches?.('.nav-link, .module-nav-group, .control-nav-group')))) {
        reconcileMenu();
      }
    });
    menuObserver.observe(nav, { childList: true, subtree: true });
  }

  function boot() {
    const nav = document.querySelector('.sidebar nav');
    const main = document.querySelector('main');
    if (!nav || !main || !document.getElementById('abcView')) {
      setTimeout(boot, 30);
      return;
    }
    const source = document.getElementById('kpiSource');
    if (source) {
      source.textContent = '';
      source.style.display = 'none';
    }
    document.getElementById('placeholderView')?.remove();
    installLayout();
    installBlitz();
    reconcileMenu();
    watchMenu();
    installAreaRules();
    booted = true;
    document.documentElement.dataset.abcAreaRules = '2026-10-02-alphabetical-menu-1';
    document.documentElement.dataset.blitzVersion = '2026-10-01-dia-2';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  setTimeout(reconcileMenu, 250);
  setTimeout(reconcileMenu, 900);
  setTimeout(reconcileMenu, 2200);
  setTimeout(installAreaRules, 250);
  setTimeout(installAreaRules, 1200);
  setTimeout(() => { if (!booted) boot(); }, 1200);
})();