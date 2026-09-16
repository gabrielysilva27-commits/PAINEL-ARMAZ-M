(() => {
  const originalFetch = window.fetch.bind(window);
  const mainApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
  const marketplaceApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/marketplace-api';

  window.__ABC_AREA_RULE_VERSION = '2026-09-16-picking-nao-v4';

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
        null, // parsePicking already selects only rows with Pallet Fechado = NÃO.
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

    document.getElementById('importButton')?.addEventListener('click', () => setTimeout(compactModalLabels, 0));
    document.querySelectorAll('.nav-link').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.view === 'abc') setTimeout(() => {
          const subtitle = document.getElementById('pageSubtitle');
          if (subtitle) subtitle.textContent = 'Análise mensal por área operacional.';
        }, 0);
      });
    });

    document.documentElement.dataset.abcAreaRules = '2026-09-16-picking-nao-v4';
    document.documentElement.dataset.uiVersion = '2026-09-16-aesthetic-v1';
  }, 0);
})();
