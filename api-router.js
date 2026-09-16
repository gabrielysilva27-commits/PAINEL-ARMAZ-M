(() => {
  const originalFetch = window.fetch.bind(window);
  const mainApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
  const marketplaceApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/marketplace-api';

  window.__ABC_AREA_RULE_VERSION = '2026-09-16-area-v3';

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

  // app.js é carregado depois deste arquivo. O timeout aplica as regras operacionais
  // definitivas após o carregamento do módulo, sem duplicar a lógica de autenticação/importação.
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

      // Câmara Fria: somente barris de chopp, identificados pelo cadastro 01.11.
      const coldRoomSet = new Set();
      for (const code of master.keys()) {
        if (isColdRoomSku(code, master)) coldRoomSet.add(code);
      }

      // Regulador: toda venda do 03.05.19, exceto Marketplace e Câmara Fria.
      const regulator = makeAreaRows(
        sales,
        master,
        code => !marketplaceSet.has(code) && !coldRoomSet.has(code),
        true
      );
      const regulatorSet = new Set(regulator.map(item => normCode(item.sku_code)));

      // Picking: somente SKUs pertencentes ao Regulador e somente registros
      // do 03.02.36.01 já filtrados por "Pallet Fechado = NÃO" em parsePicking().
      const picking = makeAreaRows(
        pickingSource,
        master,
        code => regulatorSet.has(code),
        false
      );

      // Câmara Fria e Marketplace usam venda do 03.05.19, mas cada área
      // recebe seu próprio universo e, portanto, seu próprio Pareto.
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

    const memory = document.querySelector('.calc-memory');
    if (memory) {
      memory.innerHTML = '<strong>Memória do cálculo:</strong> cada área possui sua própria Curva ABC e seu próprio Pareto. <strong>Regulador</strong>: toda a venda do 03.05.19, excluindo os SKUs da Câmara Fria e da Base Marketplace. <strong>Picking</strong>: somente SKUs do Regulador encontrados no 03.02.36.01 com <strong>Pallet Fechado = NÃO</strong>. <strong>Câmara Fria</strong>: somente barris de chopp, identificados pelo cadastro 01.11, usando a venda do 03.05.19. <strong>Marketplace</strong>: somente os códigos da Base Marketplace, usando a venda do 03.05.19. O 01.11 fornece descrição, fator Hecto Comercial e caixas por pallet. Após separar o universo de cada área, o painel converte para HL, ordena os SKUs e calcula Peso e Pareto exclusivamente dentro daquela área. Curva A até 70%, B até 90% e C acima de 90%; o SKU líder da área permanece A quando sozinho ultrapassa o corte de 70%.';
    }

    const aNote = document.querySelector('.metric-card.curve-a small');
    const bNote = document.querySelector('.metric-card.curve-b small');
    const cNote = document.querySelector('.metric-card.curve-c small');
    if (aNote) aNote.textContent = 'Faixa prioritária da própria área';
    if (bNote) bNote.textContent = 'Faixa intermediária até 90%';
    if (cNote) cNote.textContent = 'Itens após 90% do Pareto da área';

    document.documentElement.dataset.abcAreaRules = '2026-09-16-area-v3';
  }, 0);
})();
