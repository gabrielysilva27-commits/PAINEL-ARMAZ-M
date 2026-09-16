(() => {
  const CATALOG_API_URL='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/abc-catalog-api';

  async function catalogApi(action,payload={}){
    const res=await fetch(CATALOG_API_URL,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':state.token},body:JSON.stringify({action,...payload})});
    const data=await res.json().catch(()=>({error:'Resposta inválida'}));
    if(!res.ok)throw new Error(data.error||'Erro na base 01.11');
    return data;
  }

  function catalogDataFromItems(items){
    const values=new Map();
    for(const x of items||[]){
      const code=normCode(x.sku_code);if(!code)continue;
      const factor=Number(x.factor_hecto_commercial),bpp=Number(x.boxes_per_pallet);
      values.set(code,{name:String(x.sku_name||''),factor:Number.isFinite(factor)?factor:0,boxesPerPallet:Number.isFinite(bpp)?bpp:0});
    }
    return {values,count:values.size};
  }

  async function loadSavedCatalog(){
    const data=await catalogApi('get');
    const report={file:null,data:catalogDataFromItems(data.items||[]),saved:true};
    state.catalogBase=report;
    return report;
  }

  const originalHandleReport=handleReport;
  handleReport=async function(kind,file){
    await originalHandleReport(kind,file);
    if(kind==='catalog'&&state.reports.catalog)state.reports.catalog.saved=false;
  };

  updateImportReady=function(){
    const checks=[];
    for(const kind of ['sales','picking']){
      const r=state.reports[kind];
      if(r)checks.push(`<div class="check-item">✓ ${reportUi(kind).label}: ${r.data.count} SKUs identificados</div>`);
    }
    if(state.reports.catalog){
      const label=state.reports.catalog.saved?'01.11 salvo':'01.11 atualizado nesta importação';
      checks.push(`<div class="check-item">✓ ${label}: ${state.reports.catalog.data.count} SKUs com fator</div>`);
    }
    if(state.reports.marketplace)checks.push(`<div class="check-item">✓ Base Marketplace: ${state.reports.marketplace.data.count} SKUs</div>`);
    $('importChecks').innerHTML=checks.join('');

    const reportsOk=['sales','picking'].every(k=>state.reports[k]);
    const catalogOk=!!state.reports.catalog&&state.reports.catalog.data?.count>0;
    const baseOk=!!state.reports.marketplace||state.marketplaceItems.length>0;
    const days=state.reports.picking?.data?.days||0;
    $('importDays').value=days?`${days} dias identificados automaticamente`:'Automático pelo 03.02.36.01';
    const ready=reportsOk&&catalogOk&&baseOk&&days>0;
    $('confirmImport').disabled=!ready;
    $('importReady').classList.toggle('bad',!ready);
    $('importReady').textContent=!reportsOk?'Selecione 03.05.19 e 03.02.36.01.':!catalogOk?'Base 01.11 ainda não cadastrada. Envie uma vez para salvar os fatores.':!baseOk?'Inclua uma Base Marketplace para a primeira atualização.':!days?'Não foi possível identificar os dias do período.':`Pronto para calcular • ${days} dias • 01.11 reaproveitado.`;
  };

  openImport=async function(){
    $('importModal').classList.remove('hidden');
    $('importMonth').value=state.currentMonth;
    $('importError').textContent='';
    $('importChecks').innerHTML='';
    state.reports={sales:null,picking:null,catalog:null,marketplace:null};
    for(const id of ['reportSales','reportPicking','reportCatalog','reportMarketplace'])$(id).value='';
    for(const kind of ['sales','picking','catalog','marketplace'])$(reportUi(kind).slot).classList.remove('loaded','invalid');
    $('nameSales').textContent='Volume de venda por produto';
    $('namePicking').textContent='Movimentação / separação';
    $('nameCatalog').textContent='Consultando base salva...';
    $('nameMarketplace').textContent='Opcional se a base já estiver salva';

    await refreshMarketplaceBase();
    try{
      state.reports.catalog=await loadSavedCatalog();
      $('slotCatalog').classList.add('loaded');
      $('nameCatalog').textContent=`Base salva • ${state.reports.catalog.data.count} SKUs • envie só se houver alteração`;
    }catch(e){
      state.reports.catalog=null;
      $('slotCatalog').classList.add('invalid');
      $('nameCatalog').textContent='Sem base salva • envie 01.11 uma vez';
    }
    updateImportReady();
  };

  function validateCatalogCoverage(){
    const master=state.reports.catalog?.data?.values;
    if(!master)return [];
    const missing=new Set();
    for(const source of [state.reports.sales?.data?.values,state.reports.picking?.data?.values]){
      if(!source)continue;
      for(const [code,v] of source.entries()){
        if(!Number.isFinite(Number(v.boxes))||Number(v.boxes)<=0)continue;
        const m=master.get(code);
        if(!m||!Number.isFinite(Number(m.factor))||Number(m.factor)<=0)missing.add(code);
      }
    }
    return [...missing];
  }

  submitImport=async function(){
    const btn=$('confirmImport');btn.disabled=true;btn.textContent='Calculando...';$('importError').textContent='';
    try{
      if(state.reports.marketplace){
        await api('marketplace_import',{source_file:state.reports.marketplace.file.name,items:state.reports.marketplace.data.items});
        await refreshMarketplaceBase();
      }

      if(state.reports.catalog&&!state.reports.catalog.saved){
        const items=[...state.reports.catalog.data.values.entries()].map(([sku_code,x])=>({sku_code,sku_name:x.name||'',factor_hecto_commercial:x.factor||0,boxes_per_pallet:x.boxesPerPallet||null}));
        await catalogApi('import',{source_file:state.reports.catalog.file?.name||'01.11',items});
        state.reports.catalog.saved=true;
      }

      const days=state.reports.picking.data.days;
      if(!days)throw new Error('Dias do período não identificados no 03.02.36.01.');

      const missing=validateCatalogCoverage();
      if(missing.length)throw new Error(`Há ${missing.length} SKU(s) sem fator na base 01.11 (${missing.slice(0,12).join(', ')}${missing.length>12?'…':''}). Atualize o 01.11 somente quando houver produto novo ou alteração cadastral.`);

      const areas=buildAreas();
      const empty=AREAS.filter(a=>!areas[a].length);
      if(empty.length)throw new Error(`Sem dados calculáveis para: ${empty.join(', ')}.`);

      const month=$('importMonth').value;
      const sources=[state.reports.sales.file.name,state.reports.picking.file.name];
      if(state.reports.catalog.file)sources.push(`01.11: ${state.reports.catalog.file.name}`);
      await api('import',{month,days_worked:days,source_file:sources.join(' | '),areas});
      state.currentMonth=month;
      closeImport();
      await refreshMonths();
      $('monthFilter').value=month;
      await loadCurve();
      showToast('Curva ABC calculada com 03.05.19 e 03.02.36.01.');
    }catch(e){$('importError').textContent=e.message;}
    finally{btn.textContent='Gerar e atualizar';updateImportReady();}
  };

  const intro=document.querySelector('#importModal .modal-intro');
  if(intro)intro.textContent='Envie 03.05.19 e 03.02.36.01 do período. O 01.11 fica salvo como base de cadastro e só precisa ser reenviado quando houver alteração ou produto novo.';
  const catalogLabel=$('slotCatalog')?.querySelector('small');if(catalogLabel)catalogLabel.textContent='Base estática • atualizar somente quando necessário';
  const memory=document.querySelector('.calc-memory-body');
  if(memory)memory.textContent='Cada área possui sua própria Curva ABC e seu próprio Pareto. Regulador usa a venda do 03.05.19, excluindo Câmara Fria e Marketplace. Picking considera somente as linhas com Pallet Fechado = NÃO no 03.02.36.01. Câmara Fria considera barris de chopp. Marketplace usa a base de SKUs salva. O 01.11 é uma base cadastral de descrição e fatores de conversão: fica armazenado no sistema e não é uma entrada mensal.';
  if($('importReady'))$('importReady').textContent='Selecione 03.05.19 e 03.02.36.01.';

  $('importButton').onclick=openImport;
  $('confirmImport').onclick=submitImport;
  $('reportCatalog').onchange=e=>{if(e.target.files[0])handleReport('catalog',e.target.files[0]);};
})();
