(() => {
  const bundleCache=new Map();
  const bundleInFlight=new Map();
  let activeBundle=null;
  let xlsxPromise=null;

  function ensureXlsx(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    if(xlsxPromise)return xlsxPromise;
    xlsxPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.async=true;
      s.onload=()=>resolve(window.XLSX);
      s.onerror=()=>{xlsxPromise=null;reject(new Error('Não foi possível carregar o leitor de arquivos.'));};
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  const baseReadRows=readRows;
  readRows=async function(file){await ensureXlsx();return baseReadRows(file);};

  async function getBundle(month){
    if(bundleCache.has(month))return bundleCache.get(month);
    if(bundleInFlight.has(month))return bundleInFlight.get(month);
    const p=api('month_bundle',{month}).then(data=>{bundleCache.set(month,data);bundleInFlight.delete(month);return data;}).catch(err=>{bundleInFlight.delete(month);throw err;});
    bundleInFlight.set(month,p);return p;
  }

  const baseApi=api;
  api=async function(action,payload={},auth=true){
    const result=await baseApi(action,payload,auth);
    if(action==='import'){
      const month=String(payload?.month||'');
      if(month)bundleCache.delete(month);else bundleCache.clear();
    }
    if(action==='marketplace_import')bundleCache.clear();
    return result;
  };

  function useBundle(bundle){
    activeBundle=bundle;
    state.currentItems=bundle?.areas?.[state.currentArea]||[];
    renderCurve();
    renderAreaCards();
  }

  loadCurve=async function(){
    const info=monthInfo(state.currentMonth);
    const src=$('kpiSource');
    if(src)src.textContent='';
    if(!info||info.status!=='imported'){
      activeBundle=null;state.currentItems=[];renderCurve();renderAreaCards();return;
    }
    try{useBundle(await getBundle(state.currentMonth));}
    catch(e){showToast(e.message,true);}
  };

  renderAreaCards=function(){
    const wrap=$('areaCards');if(!wrap)return;wrap.innerHTML='';
    const summary=activeBundle?.month?.startsWith?.(state.currentMonth)?activeBundle.summary:null;
    for(const area of AREAS){
      const s=summary?.[area];
      const b=document.createElement('button');
      b.className=`area-card ${area===state.currentArea?'active':''}`;
      b.innerHTML=`<strong>${area}</strong><span>${s?`${s.skus} SKUs • ${fmt.format(Number(s.volume_hl||0))} HL`:'Sem dados'}</span>`;
      b.onclick=()=>{
        state.currentArea=area;$('areaFilter').value=area;
        if(activeBundle&&activeBundle.month?.startsWith?.(state.currentMonth))useBundle(activeBundle);else loadCurve();
      };
      wrap.appendChild(b);
    }
  };

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  renderTable=function(){
    const q=$('skuSearch').value.trim().toLowerCase(),cls=$('classFilter').value,body=$('abcTableBody');
    const rows=state.currentItems.filter(x=>(!cls||x.curve_class===cls)&&(!q||String(x.sku_code).toLowerCase().includes(q)||String(x.sku_name||'').toLowerCase().includes(q)));
    $('abcEmpty').classList.toggle('hidden',rows.length>0);$('tableTitle').textContent=`SKUs • ${state.currentArea}`;
    body.innerHTML=rows.map(x=>`<tr><td>${x.rank}</td><td><strong>${esc(x.sku_code)}</strong></td><td>${esc(x.sku_name||'—')}</td><td>${fmt.format(Number(x.volume_hl||0))}</td><td>${fmt.format(Number(x.avg_hl||0))}</td><td>${fmt.format(Number(x.weight_pct||0))}%</td><td>${fmt.format(Number(x.pareto_pct||0))}%</td><td><span class="curve-badge ${String(x.curve_class).toLowerCase()}">${esc(x.curve_class)}</span></td></tr>`).join('');
  };

  let searchFrame=0;
  if($('skuSearch'))$('skuSearch').oninput=()=>{cancelAnimationFrame(searchFrame);searchFrame=requestAnimationFrame(renderTable);};
  if($('classFilter'))$('classFilter').onchange=renderTable;

  window.__abcPerformance={invalidate:(month)=>month?bundleCache.delete(month):bundleCache.clear(),cache:bundleCache};
})();