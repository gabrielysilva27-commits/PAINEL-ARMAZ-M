(() => {
  const originalFetch = window.fetch.bind(window);
  const mainApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
  const marketplaceApi = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/marketplace-api';
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
})();
