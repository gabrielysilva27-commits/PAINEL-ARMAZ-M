(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/layout-api';
  const L={months:[],month:'2026-06',items:[],plan:null,totalSlots:216,streetCount:18,slotsPerStreet:12,catalogCount:0,family:'',curve:'',mounted:false};
  const fmtL=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});

  const css=document.createElement('link');css.rel='stylesheet';css.href='layout-picking.css?v=20260916-3';document.head.appendChild(css);
  async function lapi(action,payload={}){const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':state.token},body:JSON.stringify({action,...payload})});const data=await res.json().catch(()=>({error:'Resposta inválida'}));if(!res.ok)throw new Error(data.error||'Erro no Layout');return data;}
  const monthInfoL=m=>L.months.find(x=>String(x.reference_month||'').startsWith(m));
  const familyName=x=>x.family_label||String(x.packaging||'').replace(/^\d+\s*-\s*/,'').trim()||'Outros';
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const slotMatches=slot=>!slot||((!L.family||slot.family_label===L.family)&&(!L.curve||slot.curve_class===L.curve));

  function mount(){
    if(L.mounted)return;
    const view=document.getElementById('layoutView'),tabs=view?.querySelector('.layout-tabs'),module=view?.querySelector('.layout-module');
    if(!view||!tabs||!module)return setTimeout(mount,100);
    L.mounted=true;
    let btn=tabs.querySelector('[data-layout-tab="picking"]');
    if(!btn){btn=document.createElement('button');btn.className='layout-tab';btn.dataset.layoutTab='picking';btn.textContent='Picking';tabs.querySelector('[data-layout-tab="operational"]')?.insertAdjacentElement('afterend',btn);}
    let panel=module.querySelector('[data-layout-panel="picking"]');
    if(!panel){panel=document.createElement('section');panel.className='layout-section hidden';panel.dataset.layoutPanel='picking';module.appendChild(panel);}
    panel.innerHTML=`<div class="picking-layout">
      <div class="picking-toolbar">
        <div class="filter-group"><label>Mês</label><select id="pickingMonth"></select></div>
        <div class="filter-group"><label>Família</label><select id="pickingFamily"><option value="">Todas</option></select></div>
        <div class="filter-group"><label>Curva</label><select id="pickingCurve"><option value="">Todas</option><option>A</option><option>B</option><option>C</option></select></div>
        <div class="toolbar-spacer"></div><button class="primary-button admin-only" id="pickingUpdate">＋ Atualizar Picking</button>
      </div>
      <div class="picking-months" id="pickingMonths"></div>
      <div class="picking-kpis">
        <div class="picking-kpi"><span>Ruas físicas</span><strong id="pickStreets">18</strong></div>
        <div class="picking-kpi"><span>Vagas de rua</span><strong id="pickSlots">216</strong><small id="pickUsed"></small></div>
        <div class="picking-kpi"><span>SKUs</span><strong id="pickSkus">—</strong></div>
        <div class="picking-kpi"><span>Múltiplas vagas</span><strong id="pickMulti">—</strong></div>
      </div>
      <div class="panel picking-map-panel">
        <div class="panel-heading"><div><h2>Mapa do Picking</h2><small class="picking-map-note">Croqui físico da operação • cada coluna é uma rua • frente embaixo</small></div><div class="picking-legend"><span><i class="a"></i>A</span><span><i class="b"></i>B</span><span><i class="c"></i>C</span></div></div>
        <div class="picking-plan" id="pickingPlan"></div>
      </div>
      <div class="picking-audit">O desenho físico é preservado. Curva ABC orienta a posição <strong>dentro</strong> da rua; família, embalagem, lastro e complexidade de montagem determinam em qual rua o produto pode ficar.</div>
    </div>`;

    btn.addEventListener('click',()=>{view.querySelectorAll('[data-layout-panel]').forEach(x=>x.classList.add('hidden'));view.querySelectorAll('[data-layout-tab]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');panel.classList.remove('hidden');refreshAll().catch(e=>showToast(e.message,true));});
    $('pickingMonth').addEventListener('change',e=>{L.month=e.target.value;loadMonth().catch(er=>showToast(er.message,true));});
    $('pickingFamily').addEventListener('change',e=>{L.family=e.target.value;renderPlan();});
    $('pickingCurve').addEventListener('change',e=>{L.curve=e.target.value;renderPlan();});
    $('pickingUpdate').addEventListener('click',openImport);
    buildImportModal();
  }

  async function refreshAll(){
    const [m,c]=await Promise.all([lapi('months'),lapi('catalog_status')]);
    L.months=m.months||[];L.totalSlots=m.total_slots||216;L.streetCount=m.street_count||18;L.slotsPerStreet=m.slots_per_street||12;L.catalogCount=c.count||0;
    const avail=(MONTHS||[]).map(x=>x[0]).filter(x=>monthInfoL(x));if(!monthInfoL(L.month)&&avail.length)L.month=avail[avail.length-1];renderMonths();await loadMonth();
  }
  function renderMonths(){const sel=$('pickingMonth'),wrap=$('pickingMonths');sel.innerHTML='';wrap.innerHTML='';for(const [key,label] of MONTHS){const imp=!!monthInfoL(key);sel.add(new Option(`${label}/2026`,key));const b=document.createElement('button');b.className=`picking-month ${imp?'imported':''} ${key===L.month?'active':''}`;b.innerHTML=`<strong>${label}</strong><small>${imp?'Atualizado':'Pendente'}</small>`;b.onclick=()=>{L.month=key;sel.value=key;renderMonths();loadMonth().catch(e=>showToast(e.message,true));};wrap.appendChild(b);}sel.value=L.month;}
  async function loadMonth(){if(!monthInfoL(L.month)){L.items=[];L.plan=null;renderFilters();renderPlan();return;}const d=await lapi('get',{month:L.month});L.items=d.items||[];L.plan=d.plan||null;L.totalSlots=d.total_slots||216;L.streetCount=d.street_count||18;L.slotsPerStreet=d.slots_per_street||12;renderFilters();renderPlan();}
  function renderFilters(){const sel=$('pickingFamily');const cur=L.family||sel.value;const fams=[...new Set(L.items.map(familyName))].sort((a,b)=>a.localeCompare(b,'pt-BR'));sel.innerHTML='<option value="">Todas</option>'+fams.map(f=>`<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');if(fams.includes(cur)){sel.value=cur;L.family=cur}else{sel.value='';L.family='';}}

  function renderSlot(slot,streetLabel){const cell=document.createElement('div');if(!slot){cell.className='picking-slot empty';cell.title='Vaga livre';return cell;}const match=slotMatches(slot);cell.className=`picking-slot ${String(slot.curve_class).toLowerCase()} ${match?'':'filtered-out'}`;cell.innerHTML=`<span>${escapeHtml(slot.sku_code)}</span>`;cell.title=`${streetLabel} • posição ${slot.position}\n${slot.sku_code} • ${slot.sku_name}\n${slot.family_label} • Curva ${slot.curve_class}\n${fmtL.format(Number(slot.volume_hl||0))} HL`;return cell;}
  function lane(street,opts={}){const a=document.createElement('article');a.className=`picking-lane ${opts.className||''}`;a.innerHTML=`<div class="picking-lane-head"><strong>${escapeHtml(street.label||street.id)}</strong><span>${street.used||0}/12</span></div><div class="picking-lane-slots"></div><div class="picking-lane-front">FRENTE</div>`;const wrap=a.querySelector('.picking-lane-slots');for(const slot of [...(street.slots||[])].reverse())wrap.appendChild(renderSlot(slot,street.label||street.id));return a;}
  function sectionTitle(title,subtitle=''){const h=document.createElement('div');h.className='picking-section-title';h.innerHTML=`<div><strong>${title}</strong>${subtitle?`<span>${subtitle}</span>`:''}</div>`;return h;}

  function renderPlan(){
    const items=L.items||[],plan=L.plan;
    const used=plan?.used_slots||items.reduce((s,x)=>s+Number(x.assigned_slots||0),0);
    $('pickStreets').textContent=L.streetCount;$('pickSlots').textContent=L.totalSlots;$('pickUsed').textContent=items.length?`${used} ocupadas`:'';$('pickSkus').textContent=items.length||'—';$('pickMulti').textContent=items.length?items.filter(x=>Number(x.assigned_slots||0)>1).length:'—';
    const root=$('pickingPlan');if(!items.length||!plan){root.innerHTML='<div class="picking-empty">Sem layout calculado para este mês.</div>';return;}
    root.innerHTML='';

    const orientation=document.createElement('div');orientation.className='picking-orientation';orientation.innerHTML='<span>FUNDO</span><i></i><span>FRENTE / EXPEDIÇÃO</span>';root.appendChild(orientation);

    root.appendChild(sectionTitle('Caixaria','bloco contínuo • sem corredor interno'));
    const crate=document.createElement('div');crate.className='picking-crate-wall';for(const st of plan.caixaria||[])crate.appendChild(lane(st,{className:'crate'}));root.appendChild(crate);

    root.appendChild(sectionTitle('Frente do Picking','alto giro • acesso imediato'));
    const front=document.createElement('div');front.className='picking-front-lanes';for(const st of plan.front||[])front.appendChild(lane(st,{className:'priority'}));root.appendChild(front);

    root.appendChild(sectionTitle('Ruas de separação','família/embalagem fixa • curva organizada na profundidade'));
    const blocks=document.createElement('div');blocks.className='picking-main-blocks';
    for(const block of plan.blocks||[]){const b=document.createElement('section');b.className=`picking-street-block ${block.type}`;b.innerHTML=`<div class="picking-block-label">${block.type==='double'?'RUA DUPLA':'RUA SIMPLES'}</div><div class="picking-block-lanes"></div>`;const lanes=b.querySelector('.picking-block-lanes');for(const st of block.streets||[])if(st)lanes.appendChild(lane(st));blocks.appendChild(b);}root.appendChild(blocks);

    const flow=plan.flow||{};const groups=[['Flow Rack • Retornável',flow.returnable],['Flow Rack • Corote',flow.corote],['Flow Rack • Bags',flow.bags],['Flow Rack • Descartáveis',flow.disposables],['Apoio / excedentes',flow.support]].filter(([,arr])=>arr?.length);
    if(groups.length){root.appendChild(sectionTitle('Áreas complementares','itens fora das 12 posições das ruas principais'));const support=document.createElement('div');support.className='picking-support-grid';for(const [title,arr] of groups){const card=document.createElement('div');card.className='picking-support-card';card.innerHTML=`<div class="picking-support-head"><strong>${title}</strong><span>${arr.length} SKUs</span></div><div class="picking-support-items"></div>`;const list=card.querySelector('.picking-support-items');for(const x of arr.slice(0,18)){const chip=document.createElement('span');chip.className=`support-chip ${String(x.curve_class).toLowerCase()} ${slotMatches(x)?'':'filtered-out'}`;chip.textContent=x.sku_code;chip.title=`${x.sku_code} • ${x.sku_name}\n${x.family_label} • Curva ${x.curve_class}`;list.appendChild(chip);}if(arr.length>18){const more=document.createElement('span');more.className='support-more';more.textContent=`+${arr.length-18}`;list.appendChild(more);}support.appendChild(card);}root.appendChild(support);}
  }

  function parseCatalogLayout(rows){const h=locateHeader(rows,[['codigo'],['descricao'],['fator hecto comercial'],['embalagem'],['fam embalagem siv']]);if(h.score<5)throw new Error('01.11: não encontrei Código, Descrição, Fator Hecto Comercial, Embalagem e Fam. Embalagem SIV.');const codeI=col(h.headers,['codigo']),nameI=col(h.headers,['descricao']),factorI=col(h.headers,['fator hecto comercial']),packI=col(h.headers,['embalagem']),famI=col(h.headers,['fam embalagem siv']),palletI=col(h.headers,['caixas pallet']),subI=col(h.headers,['subtipo']);const items=[];for(let r=h.row+1;r<rows.length;r++){const row=rows[r]||[];const code=normCode(row[codeI]);if(!code)continue;const factor=num(row[factorI]);items.push({sku_code:code,sku_name:String(row[nameI]||'').trim(),packaging:String(row[packI]||'').trim(),family_siv:String(row[famI]||'').trim(),factor_hecto_commercial:Number.isFinite(factor)?factor:0,boxes_per_pallet:palletI>=0&&Number.isFinite(num(row[palletI]))?num(row[palletI]):null,subtype:subI>=0?String(row[subI]||'').trim():''});}return items;}
  function buildImportModal(){if($('pickingImportModal'))return;const m=document.createElement('div');m.id='pickingImportModal';m.className='picking-import-backdrop hidden';m.innerHTML=`<div class="picking-import-card"><div class="picking-import-head"><div><p class="eyebrow">LAYOUT • PICKING</p><h2>Atualizar mês</h2></div><button class="close-button" id="pickClose">×</button></div><p class="picking-import-copy">Envie o OCP 03.02.36.01. O 01.11 só precisa ser reenviado quando houver alteração cadastral ou produto novo.</p><div class="import-grid"><label>Mês de referência<select id="pickImportMonth"></select></label><label>Cadastro 01.11<input id="pickCatalogStatus" value="Verificando..." disabled /></label></div><div class="picking-import-grid"><label class="picking-file" id="pickOcpSlot"><input type="file" id="pickOcpFile" accept=".csv"/><strong>03.02.36.01 • OCP</strong><small id="pickOcpName">Obrigatório</small></label><label class="picking-file" id="pickCatSlot"><input type="file" id="pickCatFile" accept=".csv"/><strong>01.11 • famílias</strong><small id="pickCatName">Opcional se já cadastrado</small></label></div><details class="picking-method"><summary>Memória do cálculo e layout</summary><div>O sistema usa somente <strong>Pallet Fechado = NÃO</strong>, converte o volume para HL pelo 01.11 e calcula a Curva ABC própria do Picking. O desenho físico não é refeito a cada mês: <strong>caixaria permanece no bloco contínuo</strong>, Brahma Latão 473 e Guaravita ocupam as duas ruas frontais de alto giro e as demais ruas preservam suas famílias de embalagem. Dentro de cada rua, <strong>A fica na frente, B no meio e C no fundo</strong>. Vagas adicionais são dadas aos maiores giros apenas quando há espaço compatível na própria rua.</div></details><p class="picking-error" id="pickError"></p><div class="picking-import-actions"><button class="outline-button" id="pickCancel">Cancelar</button><button class="primary-button" id="pickConfirm" disabled>Gerar layout</button></div></div>`;document.body.appendChild(m);for(const [k,l] of MONTHS)$('pickImportMonth').add(new Option(`${l}/2026`,k));$('pickClose').onclick=closeImport;$('pickCancel').onclick=closeImport;$('pickOcpFile').onchange=validateImport;$('pickCatFile').onchange=validateImport;$('pickConfirm').onclick=confirmImport;}
  function openImport(){$('pickImportMonth').value=L.month;$('pickCatalogStatus').value=L.catalogCount?`${L.catalogCount} produtos cadastrados`:'Nenhum cadastro salvo';$('pickOcpFile').value='';$('pickCatFile').value='';$('pickOcpName').textContent='Obrigatório';$('pickCatName').textContent=L.catalogCount?'Opcional • base já cadastrada':'Necessário no primeiro uso';$('pickOcpSlot').classList.remove('loaded');$('pickCatSlot').classList.remove('loaded');$('pickError').textContent='';validateImport();$('pickingImportModal').classList.remove('hidden');}
  function closeImport(){$('pickingImportModal').classList.add('hidden');}
  function validateImport(){const o=$('pickOcpFile').files[0],c=$('pickCatFile').files[0];$('pickOcpName').textContent=o?o.name:'Obrigatório';$('pickCatName').textContent=c?c.name:(L.catalogCount?'Opcional • base já cadastrada':'Necessário no primeiro uso');$('pickOcpSlot').classList.toggle('loaded',!!o);$('pickCatSlot').classList.toggle('loaded',!!c);$('pickConfirm').disabled=!o||(!L.catalogCount&&!c);}
  async function confirmImport(){const btn=$('pickConfirm'),ocp=$('pickOcpFile').files[0],cat=$('pickCatFile').files[0];if(!ocp)return;btn.disabled=true;btn.textContent='Processando...';$('pickError').textContent='';try{const parsed=parsePicking(await readRows(ocp));const ocpItems=[...parsed.values.entries()].map(([sku_code,v])=>({sku_code,sku_name:v.name||'',volume_boxes:v.boxes}));let catalogItems=[];if(cat)catalogItems=parseCatalogLayout(await readRows(cat));const month=$('pickImportMonth').value;await lapi('import',{month,source_file:ocp.name,ocp_items:ocpItems,catalog_items:catalogItems,catalog_file:cat?.name||''});L.month=month;closeImport();showToast('Layout do Picking atualizado.');await refreshAll();}catch(e){$('pickError').textContent=e.message;}finally{btn.textContent='Gerar layout';validateImport();}}

  window.__PICKING_LAYOUT_VERSION='2026-09-16-physical-v3';
  setTimeout(mount,80);
})();