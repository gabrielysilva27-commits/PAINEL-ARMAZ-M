(() => {
  const CATALOG_API_URL='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/abc-catalog-api';
  const fmtInt=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Number(n||0));

  async function catalogApi(action,payload={}){
    const res=await fetch(CATALOG_API_URL,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':state.token},body:JSON.stringify({action,...payload})});
    const data=await res.json().catch(()=>({error:'Resposta inválida'}));
    if(!res.ok)throw new Error(data.error||'Erro na base 01.11');
    return data;
  }

  function catalogDataFromItems(items){
    const values=new Map();let validFactorCount=0;
    for(const x of items||[]){
      const code=normCode(x.sku_code);if(!code)continue;
      const factor=Number(x.factor_hecto_commercial),bpp=Number(x.boxes_per_pallet);
      const valid=Number.isFinite(factor)&&factor>0;
      if(valid)validFactorCount++;
      values.set(code,{name:String(x.sku_name||''),factor:valid?factor:0,boxesPerPallet:Number.isFinite(bpp)?bpp:0});
    }
    return {values,count:values.size,validFactorCount,noFactorCount:Math.max(0,values.size-validFactorCount)};
  }

  function enrichCatalogStats(data){
    if(!data?.values)return data;
    let valid=0;
    for(const x of data.values.values())if(Number.isFinite(Number(x.factor))&&Number(x.factor)>0)valid++;
    data.validFactorCount=valid;
    data.noFactorCount=Math.max(0,data.values.size-valid);
    data.count=data.values.size;
    return data;
  }

  async function loadSavedCatalog(){
    const data=await catalogApi('get');
    const parsed=catalogDataFromItems(data.items||[]);
    const report={file:null,data:parsed,saved:true};
    state.catalogBase=report;
    return report;
  }

  const originalHandleReport=handleReport;
  handleReport=async function(kind,file){
    await originalHandleReport(kind,file);
    if(kind==='catalog'&&state.reports.catalog){
      state.reports.catalog.saved=false;
      enrichCatalogStats(state.reports.catalog.data);
    }
  };

  function catalogSummary(report){
    if(!report?.data)return '';
    enrichCatalogStats(report.data);
    const total=fmtInt(report.data.count),valid=fmtInt(report.data.validFactorCount),noFactor=fmtInt(report.data.noFactorCount);
    return report.data.noFactorCount>0?`${total} códigos • ${valid} com fator • ${noFactor} sem fator comercial`:`${valid} SKUs com fator`;
  }

  function coverageStatus(){
    const master=state.reports.catalog?.data?.values;
    if(!master)return {absent:[],noFactor:[]};
    const absent=new Set(),noFactor=new Set();
    for(const source of [state.reports.sales?.data?.values,state.reports.picking?.data?.values]){
      if(!source)continue;
      for(const [code,v] of source.entries()){
        if(!Number.isFinite(Number(v.boxes))||Number(v.boxes)<=0)continue;
        const m=master.get(code);
        if(!m)absent.add(code);
        else if(!Number.isFinite(Number(m.factor))||Number(m.factor)<=0)noFactor.add(code);
      }
    }
    return {absent:[...absent],noFactor:[...noFactor]};
  }

  updateImportReady=function(){
    const checks=[];
    for(const kind of ['sales','picking']){
      const r=state.reports[kind];
      if(r)checks.push(`<div class="check-item">✓ ${reportUi(kind).label}: ${r.data.count} SKUs identificados</div>`);
    }
    if(state.reports.catalog){
      const label=state.reports.catalog.saved?'01.11 salvo':'01.11 atualizado nesta importação';
      checks.push(`<div class="check-item">✓ ${label}: ${catalogSummary(state.reports.catalog)}</div>`);
    }
    if(state.reports.marketplace)checks.push(`<div class="check-item">✓ Base Marketplace: ${state.reports.marketplace.data.count} SKUs</div>`);
    $('importChecks').innerHTML=checks.join('');

    const reportsOk=['sales','picking'].every(k=>state.reports[k]);
    const catalogOk=!!state.reports.catalog&&Number(state.reports.catalog.data?.validFactorCount||0)>0;
    const baseOk=!!state.reports.marketplace||state.marketplaceItems.length>0;
    const days=state.reports.picking?.data?.days||0;
    $('importDays').value=days?`${days} dias identificados automaticamente`:'Automático pelo 03.02.36.01';
    const ready=reportsOk&&catalogOk&&baseOk&&days>0;
    $('confirmImport').disabled=!ready;
    $('importReady').classList.toggle('bad',!ready);
    if(!reportsOk)$('importReady').textContent='Selecione 03.05.19 e 03.02.36.01.';
    else if(!catalogOk)$('importReady').textContent='Base 01.11 ainda não cadastrada. Envie uma vez para salvar os fatores.';
    else if(!baseOk)$('importReady').textContent='Inclua uma Base Marketplace para a primeira atualização.';
    else if(!days)$('importReady').textContent='Não foi possível identificar os dias do período.';
    else {
      const cov=coverageStatus(),warn=cov.absent.length+cov.noFactor.length;
      $('importReady').textContent=warn?`Pronto para calcular • ${days} dias • ${warn} código(s) sem conversão em HL serão desconsiderados.`:`Pronto para calcular • ${days} dias • 01.11 reaproveitado.`;
    }
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
      $('nameCatalog').textContent=`Base salva • ${catalogSummary(state.reports.catalog)} • envie só se houver alteração`;
    }catch(e){
      state.reports.catalog=null;
      $('slotCatalog').classList.add('invalid');
      $('nameCatalog').textContent='Sem base salva • envie 01.11 uma vez';
    }
    updateImportReady();
  };

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

      const coverage=coverageStatus();
      const skipped=[...new Set([...coverage.absent,...coverage.noFactor])];
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
      if(skipped.length)showToast(`Curva atualizada. ${skipped.length} código(s) sem fator comercial ficaram fora do cálculo em HL.`);
      else showToast('Curva ABC calculada com 03.05.19 e 03.02.36.01.');
    }catch(e){$('importError').textContent=e.message;}
    finally{btn.textContent='Gerar e atualizar';updateImportReady();}
  };

  const intro=document.querySelector('#importModal .modal-intro');
  if(intro)intro.textContent='Envie 03.05.19 e 03.02.36.01 do período. O 01.11 fica salvo como base cadastral e só precisa ser reenviado quando houver alteração ou produto novo.';
  const catalogLabel=$('slotCatalog')?.querySelector('small');if(catalogLabel)catalogLabel.textContent='Base estática • atualizar somente quando necessário';
  const memory=document.querySelector('.calc-memory-body');
  if(memory)memory.textContent='Cada área possui sua própria Curva ABC e seu próprio Pareto. Regulador usa a venda do 03.05.19, excluindo Câmara Fria e Marketplace. Picking considera somente as linhas com Pallet Fechado = NÃO no 03.02.36.01. Câmara Fria considera barris de chopp. Marketplace usa a base de SKUs salva. O 01.11 é uma base cadastral de descrição e fatores de conversão: fica armazenado no sistema e não é uma entrada mensal. Códigos sem fator comercial não entram no cálculo em HL e são apenas sinalizados.';
  if($('importReady'))$('importReady').textContent='Selecione 03.05.19 e 03.02.36.01.';

  $('importButton').onclick=openImport;
  $('confirmImport').onclick=submitImport;
  $('reportCatalog').onchange=e=>{if(e.target.files[0])handleReport('catalog',e.target.files[0]);};
})();
