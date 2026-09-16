(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/layout-api';
  const L={months:[],month:'2026-06',items:[],totalSlots:237,catalogCount:0,family:'',curve:'',mounted:false};
  const fmtL=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});

  const css=document.createElement('link');css.rel='stylesheet';css.href='layout-picking.css?v=20260916-1';document.head.appendChild(css);

  async function lapi(action,payload={}){
    const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':state.token},body:JSON.stringify({action,...payload})});
    const data=await res.json().catch(()=>({error:'Resposta inválida'}));if(!res.ok)throw new Error(data.error||'Erro no Layout');return data;
  }
  const monthInfoL=m=>L.months.find(x=>String(x.reference_month||'').startsWith(m));
  const familyName=x=>x.family_label||String(x.packaging||'').replace(/^\d+\s*-\s*/,'').trim()||'Sem família';

  function mount(){
    if(L.mounted)return;
    const view=document.getElementById('layoutView'),tabs=view?.querySelector('.layout-tabs'),module=view?.querySelector('.layout-module');
    if(!view||!tabs||!module)return setTimeout(mount,100);
    L.mounted=true;
    const btn=document.createElement('button');btn.className='layout-tab';btn.dataset.layoutTab='picking';btn.textContent='Picking';
    const operational=tabs.querySelector('[data-layout-tab="operational"]');operational?.insertAdjacentElement('afterend',btn);
    const panel=document.createElement('section');panel.className='layout-section hidden';panel.dataset.layoutPanel='picking';
    panel.innerHTML=`<div class="picking-layout">
      <div class="picking-toolbar">
        <div class="filter-group"><label>Mês</label><select id="pickingMonth"></select></div>
        <div class="filter-group"><label>Família</label><select id="pickingFamily"><option value="">Todas</option></select></div>
        <div class="filter-group"><label>Curva</label><select id="pickingCurve"><option value="">Todas</option><option>A</option><option>B</option><option>C</option></select></div>
        <div class="toolbar-spacer"></div><button class="primary-button admin-only" id="pickingUpdate">＋ Atualizar Picking</button>
      </div>
      <div class="picking-months" id="pickingMonths"></div>
      <div class="picking-kpis"><div class="picking-kpi"><span>Vagas físicas</span><strong id="pickSlots">237</strong></div><div class="picking-kpi"><span>Vagas ocupadas</span><strong id="pickUsed">—</strong></div><div class="picking-kpi"><span>SKUs</span><strong id="pickSkus">—</strong></div><div class="picking-kpi"><span>SKUs com múltiplas vagas</span><strong id="pickMulti">—</strong></div></div>
      <div class="panel" style="padding:11px"><div class="panel-heading"><h2>Mapa do Picking</h2><div class="picking-legend"><span><i class="a"></i>A • frente</span><span><i class="b"></i>B • meio</span><span><i class="c"></i>C • fundo</span></div></div><div class="picking-plan" id="pickingPlan" style="margin-top:9px"></div></div>
      <div class="picking-audit">Critério: OCP 03.02.36.01 • Pallet Fechado = NÃO • famílias pelo 01.11 • 237 vagas modeladas a partir do croqui histórico.</div>
    </div>`;
    module.appendChild(panel);

    btn.addEventListener('click',()=>{view.querySelectorAll('[data-layout-panel]').forEach(x=>x.classList.add('hidden'));view.querySelectorAll('[data-layout-tab]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');panel.classList.remove('hidden');refreshAll().catch(e=>showToast(e.message,true));});
    $('pickingMonth').addEventListener('change',e=>{L.month=e.target.value;loadMonth().catch(er=>showToast(er.message,true));});
    $('pickingFamily').addEventListener('change',e=>{L.family=e.target.value;renderPlan();});
    $('pickingCurve').addEventListener('change',e=>{L.curve=e.target.value;renderPlan();});
    $('pickingUpdate').addEventListener('click',openImport);
    document.querySelectorAll('.nav-link[data-view="layout"]').forEach(n=>n.addEventListener('click',()=>setTimeout(()=>{},0)));
    buildImportModal();
  }

  async function refreshAll(){
    const [m,c]=await Promise.all([lapi('months'),lapi('catalog_status')]);L.months=m.months||[];L.totalSlots=m.total_slots||237;L.catalogCount=c.count||0;
    const avail=(MONTHS||[]).map(x=>x[0]).filter(x=>monthInfoL(x));if(!monthInfoL(L.month)&&avail.length)L.month=avail[avail.length-1];renderMonths();await loadMonth();
  }
  function renderMonths(){
    const sel=$('pickingMonth'),wrap=$('pickingMonths');sel.innerHTML='';wrap.innerHTML='';
    for(const [key,label] of MONTHS){const imp=!!monthInfoL(key);sel.add(new Option(`${label}/2026`,key));const b=document.createElement('button');b.className=`picking-month ${imp?'imported':''} ${key===L.month?'active':''}`;b.innerHTML=`<strong>${label}</strong><small>${imp?'Atualizado':'Pendente'}</small>`;b.onclick=()=>{L.month=key;sel.value=key;renderMonths();loadMonth().catch(e=>showToast(e.message,true));};wrap.appendChild(b);}sel.value=L.month;
  }
  async function loadMonth(){
    if(!monthInfoL(L.month)){L.items=[];renderFilters();renderPlan();return;}
    const d=await lapi('get',{month:L.month});L.items=d.items||[];L.totalSlots=d.total_slots||237;renderFilters();renderPlan();
  }
  function renderFilters(){
    const sel=$('pickingFamily');const cur=sel.value;const fams=[...new Set(L.items.map(familyName))].sort((a,b)=>a.localeCompare(b,'pt-BR'));sel.innerHTML='<option value="">Todas</option>'+fams.map(f=>`<option>${escapeHtml(f)}</option>`).join('');if(fams.includes(cur))sel.value=cur;else L.family='';
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function renderPlan(){
    const items=L.items;const used=items.reduce((s,x)=>s+Number(x.assigned_slots||1),0);$('pickSlots').textContent=L.totalSlots;$('pickUsed').textContent=items.length?`${used} / ${L.totalSlots}`:'—';$('pickSkus').textContent=items.length||'—';$('pickMulti').textContent=items.length?items.filter(x=>Number(x.assigned_slots||1)>1).length:'—';
    const root=$('pickingPlan');if(!items.length){root.innerHTML='<div class="picking-empty">Sem layout calculado para este mês.</div>';return;}
    const zones=[['A','Frente'],['B','Meio'],['C','Fundo']];root.innerHTML='';
    for(const [cls,zone] of zones){let rows=items.filter(x=>x.curve_class===cls);if(L.family)rows=rows.filter(x=>familyName(x)===L.family);if(L.curve)rows=rows.filter(x=>x.curve_class===L.curve);const z=document.createElement('section');z.className='picking-zone';const slots=rows.reduce((s,x)=>s+Number(x.assigned_slots||1),0);z.innerHTML=`<div class="picking-zone-head"><strong>${zone.toUpperCase()} • CURVA ${cls}</strong><span>${rows.length} SKUs • ${slots} vagas</span></div><div class="picking-streets"></div>`;const streets=z.querySelector('.picking-streets');
      if(!rows.length){streets.innerHTML='<div class="picking-empty" style="grid-column:1/-1;padding:14px">Nenhum item neste filtro.</div>';} else {const groups=new Map();for(const x of rows){const f=familyName(x);if(!groups.has(f))groups.set(f,[]);groups.get(f).push(x);}const sorted=[...groups.entries()].sort((a,b)=>b[1].reduce((s,x)=>s+Number(x.volume_hl||0),0)-a[1].reduce((s,x)=>s+Number(x.volume_hl||0),0));for(const [fam,arr] of sorted){const box=document.createElement('div');box.className='picking-street';const nslots=arr.reduce((s,x)=>s+Number(x.assigned_slots||1),0);box.innerHTML=`<div class="picking-street-head"><strong title="${escapeHtml(fam)}">${escapeHtml(fam)}</strong><span>${nslots} vagas</span></div><div class="picking-slots"></div>`;const slotWrap=box.querySelector('.picking-slots');for(const x of arr.sort((a,b)=>a.rank-b.rank)){for(let i=0;i<Number(x.assigned_slots||1);i++){const t=document.createElement('div');t.className=`picking-slot ${cls.toLowerCase()}`;t.textContent=x.sku_code;t.title=`${x.sku_code} • ${x.sku_name}\n${fam} • Curva ${cls}\n${fmtL.format(Number(x.volume_hl||0))} HL${Number(x.assigned_slots||1)>1?` • ${x.assigned_slots} vagas`:''}`;slotWrap.appendChild(t);}}streets.appendChild(box);}}
      root.appendChild(z);
    }
  }

  function parseCatalogLayout(rows){
    const h=locateHeader(rows,[['codigo'],['descricao'],['fator hecto comercial'],['embalagem'],['fam embalagem siv']]);if(h.score<5)throw new Error('01.11: não encontrei Código, Descrição, Fator Hecto Comercial, Embalagem e Fam. Embalagem SIV.');
    const codeI=col(h.headers,['codigo']),nameI=col(h.headers,['descricao']),factorI=col(h.headers,['fator hecto comercial']),packI=col(h.headers,['embalagem']),famI=col(h.headers,['fam embalagem siv']),palletI=col(h.headers,['caixas pallet']),subI=col(h.headers,['subtipo']);const items=[];
    for(let r=h.row+1;r<rows.length;r++){const row=rows[r]||[];const code=normCode(row[codeI]);if(!code)continue;const factor=num(row[factorI]);items.push({sku_code:code,sku_name:String(row[nameI]||'').trim(),packaging:String(row[packI]||'').trim(),family_siv:String(row[famI]||'').trim(),factor_hecto_commercial:Number.isFinite(factor)?factor:0,boxes_per_pallet:palletI>=0&&Number.isFinite(num(row[palletI]))?num(row[palletI]):null,subtype:subI>=0?String(row[subI]||'').trim():''});}return items;
  }
  function buildImportModal(){
    if($('pickingImportModal'))return;const m=document.createElement('div');m.id='pickingImportModal';m.className='picking-import-backdrop hidden';m.innerHTML=`<div class="picking-import-card"><div class="picking-import-head"><div><p class="eyebrow">LAYOUT • PICKING</p><h2>Atualizar mês</h2></div><button class="close-button" id="pickClose">×</button></div><p class="picking-import-copy">Envie o OCP 03.02.36.01. O 01.11 é necessário apenas para cadastrar ou atualizar as famílias dos produtos.</p><div class="import-grid"><label>Mês de referência<select id="pickImportMonth"></select></label><label>Cadastro 01.11<input id="pickCatalogStatus" value="Verificando..." disabled /></label></div><div class="picking-import-grid"><label class="picking-file" id="pickOcpSlot"><input type="file" id="pickOcpFile" accept=".csv"/><strong>03.02.36.01 • OCP</strong><small id="pickOcpName">Obrigatório</small></label><label class="picking-file" id="pickCatSlot"><input type="file" id="pickCatFile" accept=".csv"/><strong>01.11 • famílias</strong><small id="pickCatName">Opcional se já cadastrado</small></label></div><details class="picking-method"><summary>Memória do cálculo</summary><div>O sistema considera somente linhas com <strong>Pallet Fechado = NÃO</strong>, soma as caixas por SKU, converte para HL pelo Fator Hecto Comercial do 01.11, calcula a Curva ABC própria do Picking e posiciona A na frente, B no meio e C no fundo. Produtos da mesma Fam. Embalagem SIV são agrupados na mesma rua; os itens de maior giro recebem vagas adicionais, respeitando o total de 237 vagas físicas modeladas.</div></details><p class="picking-error" id="pickError"></p><div class="picking-import-actions"><button class="outline-button" id="pickCancel">Cancelar</button><button class="primary-button" id="pickConfirm" disabled>Gerar layout</button></div></div>`;document.body.appendChild(m);
    for(const [k,l] of MONTHS)$('pickImportMonth').add(new Option(`${l}/2026`,k));
    $('pickClose').onclick=closeImport;$('pickCancel').onclick=closeImport;$('pickOcpFile').onchange=validateImport;$('pickCatFile').onchange=validateImport;$('pickConfirm').onclick=confirmImport;
  }
  function openImport(){ $('pickImportMonth').value=L.month;$('pickCatalogStatus').value=L.catalogCount?`${L.catalogCount} produtos cadastrados`:'Nenhum cadastro salvo';$('pickOcpFile').value='';$('pickCatFile').value='';$('pickOcpName').textContent='Obrigatório';$('pickCatName').textContent=L.catalogCount?'Opcional • base já cadastrada':'Necessário no primeiro uso';$('pickOcpSlot').classList.remove('loaded');$('pickCatSlot').classList.remove('loaded');$('pickError').textContent='';validateImport();$('pickingImportModal').classList.remove('hidden');}
  function closeImport(){$('pickingImportModal').classList.add('hidden');}
  function validateImport(){const o=$('pickOcpFile').files[0],c=$('pickCatFile').files[0];$('pickOcpName').textContent=o?o.name:'Obrigatório';$('pickCatName').textContent=c?c.name:(L.catalogCount?'Opcional • base já cadastrada':'Necessário no primeiro uso');$('pickOcpSlot').classList.toggle('loaded',!!o);$('pickCatSlot').classList.toggle('loaded',!!c);$('pickConfirm').disabled=!o||(!L.catalogCount&&!c);}
  async function confirmImport(){const btn=$('pickConfirm'),ocp=$('pickOcpFile').files[0],cat=$('pickCatFile').files[0];if(!ocp)return;btn.disabled=true;btn.textContent='Processando...';$('pickError').textContent='';try{const parsed=parsePicking(await readRows(ocp));const ocpItems=[...parsed.values.entries()].map(([sku_code,v])=>({sku_code,sku_name:v.name||'',volume_boxes:v.boxes}));let catalogItems=[];if(cat)catalogItems=parseCatalogLayout(await readRows(cat));const month=$('pickImportMonth').value;await lapi('import',{month,source_file:ocp.name,ocp_items:ocpItems,catalog_items:catalogItems,catalog_file:cat?.name||''});L.month=month;closeImport();showToast('Layout do Picking atualizado.');await refreshAll();}catch(e){$('pickError').textContent=e.message;}finally{btn.textContent='Gerar layout';validateImport();}}

  setTimeout(mount,80);
})();