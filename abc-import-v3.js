(() => {
  const CATALOG_API_URL='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/abc-catalog-api';
  const fmtInt=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Number(n||0));
  const KNOWN_GIRO_ASSET_CODES=new Set(['24090','24274','24275','25299','25300','25303','25546','25936','25937','29635','31917']);
  state.catalogStatus={count:0,validFactorCount:0,noFactorCount:0};

  async function catalogApi(action,payload={}){
    const res=await fetch(CATALOG_API_URL,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':state.token},body:JSON.stringify({action,...payload})});
    const data=await res.json().catch(()=>({error:'Resposta inválida'}));
    if(!res.ok)throw new Error(data.error||'Erro na base 01.11');
    return data;
  }

  function isGiroAsset(code,...descriptions){
    const c=normCode(code);if(KNOWN_GIRO_ASSET_CODES.has(c))return true;
    for(const raw of descriptions){const s=normText(raw);if(!s)continue;if(/^(garrafeira|vasilhame|engradado|engrad|casco)\b/.test(s))return true;if(/^(garrafa|gfa)\s+vazi[ao]\b/.test(s))return true;if(/^caixa\s+plast(?:ica)?\s+(vazia|retornavel)\b/.test(s))return true;if(/^embalagem\s+(vazia|retornavel)\b/.test(s))return true;if(/^ativo\s+de\s+giro\b/.test(s))return true;}
    return false;
  }

  function catalogDataFromItems(items){
    const values=new Map();let valid=0;
    for(const x of items||[]){const code=normCode(x.sku_code);if(!code)continue;const factor=Number(x.factor_hecto_commercial),bpp=Number(x.boxes_per_pallet),ok=Number.isFinite(factor)&&factor>0;if(ok)valid++;values.set(code,{name:String(x.sku_name||''),factor:ok?factor:0,boxesPerPallet:Number.isFinite(bpp)?bpp:0});}
    return{values,count:values.size,validFactorCount:valid,noFactorCount:Math.max(0,values.size-valid)};
  }

  function setCatalogStatus(data){state.catalogStatus={count:Number(data?.count||0),validFactorCount:Number(data?.valid_factor_count||0),noFactorCount:Number(data?.no_factor_count||0)};}
  function statusText(){const s=state.catalogStatus;return s.count?`${fmtInt(s.count)} códigos • ${fmtInt(s.validFactorCount)} com fator${s.noFactorCount?` • ${fmtInt(s.noFactorCount)} sem fator`:''}`:'Sem base salva';}

  function removeGiroAssets(data){
    if(!data?.values)return data;const master=state.reports.catalog?.data?.values,kept=new Map(),excluded=[];
    for(const [code,v] of data.values.entries()){const m=master?.get(code);if(isGiroAsset(code,v?.name,m?.name)){excluded.push(code);continue;}kept.set(code,v);}
    return{...data,values:kept,count:kept.size,rawCount:data.values.size,excludedAssets:excluded.length,excludedAssetCodes:excluded};
  }
  function refilterMonthlyReports(){for(const kind of ['sales','picking']){const r=state.reports[kind];if(!r?._rawData)continue;r.data=removeGiroAssets({...r._rawData,values:new Map(r._rawData.values)});}}
  function reportCodes(){const codes=new Set();for(const kind of ['sales','picking']){const data=state.reports[kind]?._rawData||state.reports[kind]?.data;for(const code of data?.values?.keys?.()||[])codes.add(normCode(code));}return[...codes].filter(Boolean);}

  async function hydrateCatalogForReports(){
    if(state.reports.catalog&&!state.reports.catalog.saved)return state.reports.catalog;
    const codes=reportCodes();if(!codes.length)return null;
    const data=await catalogApi('get_codes',{codes});
    state.reports.catalog={file:null,data:catalogDataFromItems(data.items||[]),saved:true,partial:true};
    refilterMonthlyReports();return state.reports.catalog;
  }

  function assetCodesStatus(){const s=new Set();for(const kind of ['sales','picking'])for(const c of state.reports[kind]?.data?.excludedAssetCodes||[])s.add(c);return[...s];}
  function coverageStatus(){const master=state.reports.catalog?.data?.values;if(!master)return{absent:[],noFactor:[]};const absent=new Set(),noFactor=new Set();for(const kind of ['sales','picking']){const source=state.reports[kind]?.data?.values;if(!source)continue;for(const [code,v] of source.entries()){if(!Number.isFinite(Number(v.boxes))||Number(v.boxes)<=0)continue;const m=master.get(code);if(isGiroAsset(code,v?.name,m?.name))continue;if(!m)absent.add(code);else if(!Number.isFinite(Number(m.factor))||Number(m.factor)<=0)noFactor.add(code);}}return{absent:[...absent],noFactor:[...noFactor]};}

  updateImportReady=function(){
    const checks=[];
    for(const kind of ['sales','picking']){const r=state.reports[kind];if(r){const ex=Number(r.data.excludedAssets||0);checks.push(`<div class="check-item">✓ ${reportUi(kind).label}: ${r.data.count} produtos${ex?` • ${ex} ativo(s) de giro ignorado(s)`:''}</div>`);}}
    if(state.catalogStatus.count)checks.push(`<div class="check-item">✓ 01.11 salvo: ${statusText()}</div>`);
    if(state.reports.catalog?.partial)checks.push(`<div class="check-item">✓ Cadastro correlato carregado: ${state.reports.catalog.data.count} códigos necessários neste período</div>`);
    if(state.reports.marketplace)checks.push(`<div class="check-item">✓ Base Marketplace: ${state.reports.marketplace.data.count} SKUs</div>`);
    $('importChecks').innerHTML=checks.join('');
    const reportsOk=['sales','picking'].every(k=>state.reports[k]);
    const catalogReady=!!state.reports.catalog?.data?.values&&state.reports.catalog.data.values.size>0;
    const catalogExists=state.catalogStatus.validFactorCount>0||!!state.reports.catalog&&!state.reports.catalog.saved;
    const baseOk=!!state.reports.marketplace||state.marketplaceItems.length>0;
    const days=state.reports.picking?.data?.days||0;
    $('importDays').value=days?`${days} dias identificados automaticamente`:'Automático pelo 03.02.36.01';
    const ready=reportsOk&&catalogExists&&catalogReady&&baseOk&&days>0;$('confirmImport').disabled=!ready;$('importReady').classList.toggle('bad',!ready);
    if(!reportsOk)$('importReady').textContent='Selecione 03.05.19 e 03.02.36.01.';
    else if(!catalogExists)$('importReady').textContent='Base 01.11 ainda não cadastrada. Envie uma vez para salvar os fatores.';
    else if(!catalogReady)$('importReady').textContent='Consultando apenas os SKUs necessários na base 01.11...';
    else if(!baseOk)$('importReady').textContent='Inclua uma Base Marketplace para a primeira atualização.';
    else if(!days)$('importReady').textContent='Não foi possível identificar os dias do período.';
    else{const cov=coverageStatus(),warn=cov.absent.length+cov.noFactor.length,assets=assetCodesStatus().length,assetText=assets?` • ${assets} ativo(s) de giro fora da curva`:'';$('importReady').textContent=warn?`Pronto para calcular • ${days} dias${assetText} • ${warn} código(s) sem conversão em HL serão desconsiderados.`:`Pronto para calcular • ${days} dias${assetText} • base 01.11 consultada sob demanda.`;}
  };

  const originalHandleReport=handleReport;
  handleReport=async function(kind,file){
    await originalHandleReport(kind,file);const r=state.reports[kind];if(!r)return;
    if(kind==='catalog'){
      r.saved=false;r.partial=false;let valid=0;for(const x of r.data.values.values())if(Number(x.factor)>0)valid++;state.catalogStatus={count:r.data.values.size,validFactorCount:valid,noFactorCount:r.data.values.size-valid};refilterMonthlyReports();updateImportReady();return;
    }
    if(kind==='sales'||kind==='picking'){
      r._rawData={...r.data,values:new Map(r.data.values)};
      if(state.catalogStatus.validFactorCount>0||state.reports.catalog&&!state.reports.catalog.saved){
        $('importReady').textContent='Consultando apenas os SKUs necessários na base 01.11...';
        try{if(!(state.reports.catalog&&!state.reports.catalog.saved))await hydrateCatalogForReports();else refilterMonthlyReports();}catch(e){$('importError').textContent=e.message;}
      }
      updateImportReady();
    }
  };

  openImport=async function(){
    $('importModal').classList.remove('hidden');$('importMonth').value=state.currentMonth;$('importError').textContent='';$('importChecks').innerHTML='';state.reports={sales:null,picking:null,catalog:null,marketplace:null};
    for(const id of ['reportSales','reportPicking','reportCatalog','reportMarketplace'])$(id).value='';for(const kind of ['sales','picking','catalog','marketplace'])$(reportUi(kind).slot).classList.remove('loaded','invalid');
    $('nameSales').textContent='Volume de venda por produto';$('namePicking').textContent='Movimentação / separação';$('nameCatalog').textContent='Consultando status da base...';$('nameMarketplace').textContent='Opcional se a base já estiver salva';
    await refreshMarketplaceBase();
    try{const status=await catalogApi('status');setCatalogStatus(status);if(state.catalogStatus.count){$('slotCatalog').classList.add('loaded');$('nameCatalog').textContent=`Base salva • ${statusText()} • carregamento sob demanda`;}else{$('slotCatalog').classList.add('invalid');$('nameCatalog').textContent='Sem base salva • envie 01.11 uma vez';}}catch(e){state.catalogStatus={count:0,validFactorCount:0,noFactorCount:0};$('slotCatalog').classList.add('invalid');$('nameCatalog').textContent='Não foi possível consultar a base 01.11';}
    updateImportReady();
  };

  submitImport=async function(){
    const btn=$('confirmImport');btn.disabled=true;btn.textContent='Calculando...';$('importError').textContent='';
    try{
      if(state.reports.marketplace){await api('marketplace_import',{source_file:state.reports.marketplace.file.name,items:state.reports.marketplace.data.items});await refreshMarketplaceBase();}
      if(state.reports.catalog&&!state.reports.catalog.saved){const items=[...state.reports.catalog.data.values.entries()].map(([sku_code,x])=>({sku_code,sku_name:x.name||'',factor_hecto_commercial:x.factor||0,boxes_per_pallet:x.boxesPerPallet||null}));const imported=await catalogApi('import',{source_file:state.reports.catalog.file?.name||'01.11',items});setCatalogStatus({count:imported.count,valid_factor_count:imported.valid_factor_count,no_factor_count:imported.no_factor_count});state.reports.catalog.saved=true;state.reports.catalog.partial=false;refilterMonthlyReports();}
      else await hydrateCatalogForReports();
      const days=state.reports.picking.data.days;if(!days)throw new Error('Dias do período não identificados no 03.02.36.01.');
      const coverage=coverageStatus(),skipped=[...new Set([...coverage.absent,...coverage.noFactor])],assets=assetCodesStatus(),areas=buildAreas(),empty=AREAS.filter(a=>!areas[a].length);if(empty.length)throw new Error(`Sem dados calculáveis para: ${empty.join(', ')}.`);
      const month=$('importMonth').value,sources=[state.reports.sales.file.name,state.reports.picking.file.name];if(state.reports.catalog.file)sources.push(`01.11: ${state.reports.catalog.file.name}`);
      await api('import',{month,days_worked:days,source_file:sources.join(' | '),areas});state.currentMonth=month;closeImport();await refreshMonths();$('monthFilter').value=month;await loadCurve();const notes=[];if(assets.length)notes.push(`${assets.length} ativo(s) de giro ignorado(s)`);if(skipped.length)notes.push(`${skipped.length} código(s) sem fator comercial fora do cálculo`);showToast(notes.length?`Curva atualizada. ${notes.join(' • ')}.`:'Curva ABC calculada com 03.05.19 e 03.02.36.01.');
    }catch(e){$('importError').textContent=e.message;}finally{btn.textContent='Gerar e atualizar';updateImportReady();}
  };

  const intro=document.querySelector('#importModal .modal-intro');if(intro)intro.textContent='Envie 03.05.19 e 03.02.36.01 do período. O sistema consulta no 01.11 apenas os códigos presentes nesses relatórios; a base completa fica no servidor e só é reenviada quando houver alteração ou produto novo.';
  const catalogLabel=$('slotCatalog')?.querySelector('small');if(catalogLabel)catalogLabel.textContent='Base estática • consultada sob demanda';
  const memory=document.querySelector('.calc-memory-body');if(memory)memory.textContent='Cada área possui sua própria Curva ABC e seu próprio Pareto. Regulador usa a venda do 03.05.19, excluindo Câmara Fria e Marketplace. Picking considera somente Pallet Fechado = NÃO no 03.02.36.01. Ativos de giro são excluídos antes do cálculo. O 01.11 fica armazenado no servidor e, na rotina mensal, o navegador baixa somente os cadastros correspondentes aos SKUs presentes em 03.05.19 e 03.02.36.01.';
  $('importButton').onclick=openImport;$('confirmImport').onclick=submitImport;$('reportCatalog').onchange=e=>{if(e.target.files[0])handleReport('catalog',e.target.files[0]);};
})();