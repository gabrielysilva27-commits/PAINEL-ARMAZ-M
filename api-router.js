(() => {
  const originalFetch = window.fetch.bind(window);
  const mainApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
  const marketplaceApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/marketplace-api';

  window.__ABC_AREA_RULE_VERSION = '2026-09-16-picking-nao-v4';
  window.__ABC_UI_VERSION = '2026-09-16-aesthetic-v2';
  window.__LAYOUT_UI_VERSION = '2026-09-16-layout-v1';

  window.fetch = (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url;
      if (url === mainApi && typeof init.body === 'string') {
        const payload = JSON.parse(init.body);
        if (payload?.action === 'marketplace_base' || payload?.action === 'marketplace_import') {
          return originalFetch(marketplaceApi, init);
        }
      }
    } catch (_) {}
    return originalFetch(input, init);
  };

  const layoutCss = document.createElement('link');
  layoutCss.rel = 'stylesheet';
  layoutCss.href = 'layout.css?v=20260916-1';
  document.head.appendChild(layoutCss);

  setTimeout(() => {
    const isColdRoomSku = (code, master) => {
      const product = master.get(code);
      const name = normText(product?.name || '');
      return name.includes('chopp') && (name.includes('barril') || name.includes('keg'));
    };

    window.buildAreas = function buildAreasByOperation() {
      const sales = state.reports.sales.data.values;
      const pickingSource = state.reports.picking.data.values;
      const master = state.reports.catalog.data.values;
      const marketplaceSet = new Set(
        (state.reports.marketplace?.data?.items || state.marketplaceItems)
          .map(x => normCode(x.sku_code))
          .filter(Boolean)
      );

      const coldRoomSet = new Set();
      for (const code of master.keys()) {
        if (isColdRoomSku(code, master)) coldRoomSet.add(code);
      }

      const regulator = makeAreaRows(
        sales,
        master,
        code => !marketplaceSet.has(code) && !coldRoomSet.has(code),
        true
      );

      const picking = makeAreaRows(
        pickingSource,
        master,
        null,
        false
      );

      const coldRoom = makeAreaRows(
        sales,
        master,
        code => coldRoomSet.has(code),
        false
      );
      const marketplace = makeAreaRows(
        sales,
        master,
        code => marketplaceSet.has(code),
        false
      );

      return {
        Regulador: regulator,
        Picking: picking,
        'Câmara Fria': coldRoom,
        Marketplace: marketplace
      };
    };

    const memory = document.querySelector('.calc-memory-body');
    if (memory) {
      memory.innerHTML = 'Cada área possui seu próprio universo, peso e Pareto. <strong>Regulador:</strong> venda do 03.05.19, excluindo Câmara Fria e Marketplace. <strong>Picking:</strong> todos os SKUs das linhas com Pallet Fechado = NÃO no 03.02.36.01, somando somente essas linhas, independentemente do Regulador. Linhas com SIM não entram. <strong>Câmara Fria:</strong> barris de chopp identificados pelo 01.11, usando a venda do 03.05.19. <strong>Marketplace:</strong> códigos da base salva, usando a venda do 03.05.19. O 01.11 fornece descrição, fator Hecto Comercial e caixas por pallet. Após a separação por área, o painel converte para HL, ordena e calcula Peso e Pareto. A = até 70%, B = até 90%, C = acima de 90%; o SKU líder permanece A quando sozinho ultrapassa 70%.';
    }

    const compactModalLabels = () => {
      const sales = document.getElementById('nameSales');
      const picking = document.getElementById('namePicking');
      const catalog = document.getElementById('nameCatalog');
      const mkp = document.getElementById('nameMarketplace');
      if (sales && !document.getElementById('reportSales')?.files?.length) sales.textContent = 'Venda por produto';
      if (picking && !document.getElementById('reportPicking')?.files?.length) picking.textContent = 'Separação / pallet fechado';
      if (catalog && !document.getElementById('reportCatalog')?.files?.length) catalog.textContent = 'Cadastro e fatores';
      if (mkp && !document.getElementById('reportMarketplace')?.files?.length) mkp.textContent = 'Usar somente quando atualizar';
    };

    const cleanKpis = () => {
      const source = document.getElementById('kpiSource');
      if (source) {
        source.textContent = '';
        source.style.display = 'none';
        if (source.parentElement) source.parentElement.style.minWidth = '0';
      }
      document.querySelectorAll('.metric-card').forEach(card => {
        card.style.minWidth = '0';
      });
    };

    const mountLayoutModule = () => {
      if (document.getElementById('layoutView')) return;

      const abcNav = document.querySelector('.nav-link[data-view="abc"]');
      if (!abcNav) return;

      const layoutNav = document.createElement('button');
      layoutNav.className = 'nav-link';
      layoutNav.dataset.view = 'layout';
      layoutNav.innerHTML = '<span>⌗</span> Layout';
      abcNav.insertAdjacentElement('afterend', layoutNav);

      const layoutView = document.createElement('section');
      layoutView.className = 'view hidden';
      layoutView.id = 'layoutView';
      layoutView.innerHTML = `
        <div class="layout-module">
          <div class="layout-tabs" role="tablist" aria-label="Seções do módulo Layout">
            <button class="layout-tab active" data-layout-tab="overview">Visão geral</button>
            <button class="layout-tab" data-layout-tab="operational">Layout operacional</button>
            <button class="layout-tab" data-layout-tab="capacity">Capacidade</button>
            <button class="layout-tab" data-layout-tab="repack">Repack</button>
            <button class="layout-tab" data-layout-tab="returns">Retorno de rota</button>
            <button class="layout-tab" data-layout-tab="coldroom">Câmara fria</button>
          </div>

          <section class="layout-section" data-layout-panel="overview">
            <div class="layout-grid">
              <article class="layout-card">
                <div class="layout-card-header"><h2>Layout & Capacidade</h2><small>Estrutura do módulo</small></div>
                <div class="layout-scope-grid">
                  <div class="layout-scope-item"><span>1.1</span><strong>Otimização do Layout</strong><p>Organização física, endereçamento e posicionamento das áreas operacionais.</p></div>
                  <div class="layout-scope-item"><span>1.2</span><strong>Gestão da Capacidade</strong><p>Base preparada para controles de ocupação, limites e necessidade de expansão.</p></div>
                </div>
              </article>
              <article class="layout-card">
                <div class="layout-card-header"><h2>Critérios de avaliação</h2><small>DPO Layout</small></div>
                <div class="layout-criteria">
                  <span class="layout-criterion">Segurança</span><span class="layout-criterion">5S</span><span class="layout-criterion">Produtividade</span><span class="layout-criterion">FEFO</span><span class="layout-criterion">Qualidade</span>
                </div>
              </article>
            </div>

            <article class="layout-card">
              <div class="layout-card-header"><h2>Frentes do layout</h2><small>Preparadas para receber a base local</small></div>
              <div class="layout-workstreams">
                <div class="layout-workstream"><strong>Planta operacional</strong><span>Endereçamento e posicionamento por Curva ABC.</span><span class="layout-status">Aguardando conteúdo</span></div>
                <div class="layout-workstream"><strong>Capacidade</strong><span>Limites, ocupação e dimensionamento.</span><span class="layout-status">Aguardando conteúdo</span></div>
                <div class="layout-workstream"><strong>Repack</strong><span>Fluxo e organização da área de reprocesso.</span><span class="layout-status">Aguardando conteúdo</span></div>
                <div class="layout-workstream"><strong>Retorno de rota</strong><span>Segregação e organização do retorno.</span><span class="layout-status">Aguardando conteúdo</span></div>
                <div class="layout-workstream"><strong>Câmara fria</strong><span>Posicionamento, FEFO e endereçamento.</span><span class="layout-status">Aguardando conteúdo</span></div>
              </div>
            </article>

            <div class="layout-audit-strip"><div><strong>Estrutura pronta para conteúdo operacional</strong><span> • Nenhuma planta ou capacidade local foi assumida.</span></div><span class="layout-audit-state">Base local pendente</span></div>
          </section>

          <section class="layout-section hidden" data-layout-panel="operational">
            <article class="layout-card">
              <div class="layout-card-header"><h2>Layout operacional</h2><small>Planta geral + Curva ABC</small></div>
              <div class="layout-slot"><div class="layout-slot-inner"><div class="layout-slot-icon">⌗</div><strong>Área pronta para a planta do armazém</strong><p>Aqui vamos posicionar ruas, posições, áreas e o endereçamento por Curva ABC quando você fornecer a base atual.</p></div></div>
            </article>
          </section>

          <section class="layout-section hidden" data-layout-panel="capacity">
            <div class="layout-mini-grid">
              <article class="layout-mini-card"><strong>Gestão da capacidade</strong><p>Estrutura reservada para os indicadores e limites que definirmos com a base real da unidade.</p></article>
              <article class="layout-mini-card"><strong>Gatilhos de capacidade</strong><p>Espaço preparado para regras de ocupação e necessidade de ação, sem valores presumidos.</p></article>
            </div>
            <article class="layout-card"><div class="layout-slot"><div class="layout-slot-inner"><div class="layout-slot-icon">▦</div><strong>Capacidade ainda não configurada</strong><p>Vamos adicionar posições, capacidades, ocupação e critérios após receber os dados locais.</p></div></div></article>
          </section>

          <section class="layout-section hidden" data-layout-panel="repack">
            <article class="layout-card">
              <div class="layout-card-header"><h2>Repack</h2><small>Referência do padrão</small></div>
              <div class="layout-reference-list">
                <div class="layout-reference-row"><strong>Bancada de Repack</strong><span>Fluxo físico da atividade</span></div>
                <div class="layout-reference-row"><strong>Produtos para análise</strong><span>Área segregada</span></div>
                <div class="layout-reference-row"><strong>Produtos para Repack</strong><span>Área segregada</span></div>
                <div class="layout-reference-row"><strong>Descarte de embalagem</strong><span>Área definida</span></div>
                <div class="layout-reference-row"><strong>Prateleira / pia / shrink</strong><span>Elementos previstos no padrão</span></div>
              </div>
            </article>
            <article class="layout-card"><div class="layout-slot"><div class="layout-slot-inner"><div class="layout-slot-icon">□</div><strong>Layout local do Repack</strong><p>Pronto para receber a disposição real da unidade e seus controles.</p></div></div></article>
          </section>

          <section class="layout-section hidden" data-layout-panel="returns">
            <article class="layout-card"><div class="layout-card-header"><h2>Retorno de rota</h2><small>Organização e segregação</small></div><div class="layout-slot"><div class="layout-slot-inner"><div class="layout-slot-icon">↩</div><strong>Área pronta para o fluxo de retorno</strong><p>Vamos registrar a disposição real, segregações e fluxo operacional quando você enviar o layout atual.</p></div></div></article>
          </section>

          <section class="layout-section hidden" data-layout-panel="coldroom">
            <article class="layout-card"><div class="layout-card-header"><h2>Câmara fria</h2><small>Layout + FEFO</small></div><div class="layout-slot"><div class="layout-slot-inner"><div class="layout-slot-icon">❄</div><strong>Área pronta para o mapa da Câmara Fria</strong><p>Estrutura preparada para endereçamento dos barris, sequência FEFO e capacidade física.</p></div></div></article>
          </section>
        </div>`;

      const abcView = document.getElementById('abcView');
      abcView?.insertAdjacentElement('afterend', layoutView);

      const showLayoutPanel = (key) => {
        layoutView.querySelectorAll('[data-layout-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.layoutPanel !== key));
        layoutView.querySelectorAll('[data-layout-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.layoutTab === key));
      };
      layoutView.querySelectorAll('[data-layout-tab]').forEach(tab => tab.addEventListener('click', () => showLayoutPanel(tab.dataset.layoutTab)));

      layoutNav.addEventListener('click', () => {
        document.querySelectorAll('.nav-link').forEach(button => button.classList.toggle('active', button === layoutNav));
        document.getElementById('abcView')?.classList.add('hidden');
        document.getElementById('placeholderView')?.classList.add('hidden');
        layoutView.classList.remove('hidden');
        const title = document.getElementById('pageTitle');
        const subtitle = document.getElementById('pageSubtitle');
        if (title) title.textContent = 'Layout';
        if (subtitle) subtitle.textContent = 'Layout físico, capacidade e aderência operacional.';
        document.getElementById('sidebar')?.classList.remove('open');
      });

      document.querySelectorAll('.nav-link').forEach(button => {
        if (button !== layoutNav) button.addEventListener('click', () => layoutView.classList.add('hidden'));
      });
    };

    cleanKpis();
    const monthFilter = document.getElementById('monthFilter');
    const areaFilter = document.getElementById('areaFilter');
    monthFilter?.addEventListener('change', () => setTimeout(cleanKpis, 0));
    areaFilter?.addEventListener('change', () => setTimeout(cleanKpis, 0));

    document.getElementById('importButton')?.addEventListener('click', () => setTimeout(compactModalLabels, 0));
    document.querySelectorAll('.nav-link').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.view === 'abc') setTimeout(() => {
          const subtitle = document.getElementById('pageSubtitle');
          if (subtitle) subtitle.textContent = 'Análise mensal por área operacional.';
          cleanKpis();
        }, 0);
      });
    });

    mountLayoutModule();

    document.documentElement.dataset.abcAreaRules = '2026-09-16-picking-nao-v4';
    document.documentElement.dataset.uiVersion = '2026-09-16-aesthetic-v2';
    document.documentElement.dataset.layoutVersion = '2026-09-16-layout-v1';
  }, 0);
})();
