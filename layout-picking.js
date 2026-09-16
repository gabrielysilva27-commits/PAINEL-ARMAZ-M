(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/layout-api';
  const L={months:[],month:'2026-06',items:[],plan:null,totalSlots:207,streetCount:18,slotsPerStreet:12,catalogCount:0,family:'',curve:'',mounted:false};
  const fmtL=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
  const css=document.createElement('link');css.rel='stylesheet';css.href='layout-picking.css?v=20260916-5';document.head.appendChild(css);
  const cssV5=document.createElement('link');cssV5.rel='stylesheet';cssV5.href='layout-picking-v5.css?v=20260916-1';document.head.appendChild(cssV5);

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
        <div class="picking-kpi"><span>Vagas de rua</span><strong id="pickSlots">207</strong><small id="pickUsed"></small></div>
        <div class="picking-kpi"><span>SKUs no layout</span><strong id="pickSkus">—</strong></div>
        <div class="picking-kpi"><span>Múltiplas vagas</span><strong id="pickMulti">—</strong></div>
      </div>
      <div class="panel picking-map-panel">
        <div class="panel-heading"><div><h2>Mapa do Picking</h2><small class="picking-map-note">207 vagas físicas • Flow Rack complementar • Marketplace, barris e BAGs fora do Picking</small></div><div class="picking-legend"><span><i class="a"></i>A</span><span><i class="b"></i>B</span><span><i class="c"></i>C</span></div></div>
        <div class="picking-plan" id="pickingPlan"></div>
      </div>
      <div class="picking-audit">Primeiro o sistema garante <strong>1 posição para cada SKU elegível</strong>. Só depois usa as vagas restantes para multiplicar os itens de maior giro. O Flow Rack recebe somente a cauda extrema da Curva C.</div>
    </div>`;
    btn.addEventListener('click',()=>{view.querySelectorAll('[data-layout-panel]').forEach(x=>x.classList.add('hidden'));view.querySelectorAll('[data-layout-tab]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');panel.classList.remove('hidden');refreshAll().catch(e=>showToast(e.message,true));});
    $('pickingMonth').addEventListener('change',e=>{L.month=e.target.value;loadMonth().catch(er=>showToast(er.message,true));});
    $('pickingFamily').addEventListener('change',e=>{L.family=e.target.value;renderPlan();});
    $('pickingCurve').addEventListener('change',e=>{L.curve=e.target.value;renderPlan();});
    $('pickingUpdate').addEventListener('click',openImport);
    buildImportModal();
  }

  async function refreshAll(){const [m,c]=await Promise.all([lapi('months'),lapi('catalog_status')]);L.months=m.months||[];L.totalSlots=m.total_slots||207;L.streetCount=m.street_count||18;L.slotsPerStreet=m.slots_per_street||12;L.catalogCount=c.count||0;const avail=(MONTHS||[]).map(x=>x[0]).filter(x=>monthInfoL(x));if(!monthInfoL(L.month)&&avail.length)L.month=avail[avail.length-1];renderMonths();await loadMonth();}
  function renderMonths(){const sel=$('pickingMonth'),wrap=$('pickingMonths');sel.innerHTML='';wrap.innerHTML='';for(const [key,label] of MONTHS){const imp=!!monthInfoL(key);sel.add(new Option(`${label}/2026`,key));const b=document.createElement('button');b.className=`picking-month ${imp?'imported':''} ${key===L.month?'active':''}`;b.innerHTML=`<strong>${label}</strong><small>${imp?'Atualizado':'Pendente'}</small>`;b.onclick=()=>{L.month=key;sel.value=key;renderMonths();loadMonth().catch(e=>showToast(e.message,true));};wrap.appendChild(b);}sel.value=L.month;}
  async function loadMonth(){if(!monthInfoL(L.month)){L.items=[];L.plan=null;renderFilters();renderPlan();return;}const d=await lapi('get',{month:L.month});L.items=d.items||[];L.plan=d.plan||null;L.totalSlots=d.total_slots||207;L.streetCount=d.street_count||18;L.slotsPerStreet=d.slots_per_street||12;renderFilters();renderPlan();}
  function renderFilters(){const sel=$('pickingFamily');const cur=L.family||sel.value;const fams=[...new Set(L.items.map(familyName))].sort((a,b)=>a.localeCompare(b,'pt-BR'));sel.innerHTML='<option value="">Todas</option>'+fams.map(f=>`<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');if(fams.includes(cur)){sel.value=cur;L.family=cur}else{sel.value='';L.family='';}}

  function renderSlot(slot,streetLabel){const cell=document.createElement('div');if(!slot){cell.className='picking-slot empty';cell.title='Vaga livre';return cell;}const match=slotMatches(slot);cell.className=`picking-slot ${String(slot.curve_class).toLowerCase()} ${match?'':'filtered-out'}`;cell.innerHTML=`<span>${escapeHtml(slot.sku_code)}</span>`;cell.title=`${streetLabel} • posição ${slot.position}\n${slot.sku_code} • ${slot.sku_name}\n${slot.family_label} • Curva ${slot.curve_class}\n${fmtL.format(Number(slot.volume_hl||0))} HL`;return cell;}
  function lane(street,front=false){
    const a=document.createElement('article');a.className='croqui-lane';
    const slots=street.slots||Array(street.capacity||12).fill(null);
    const desc=street.description||street.label||'';
    const label=desc?`${street.id} · ${desc}`:street.id;
    a.title=label;a.innerHTML=`<div class="croqui-lane-id"><strong>${escapeHtml(street.id)}</strong><span>${escapeHtml(desc)}</span></div>`;
    const ordered=front?[...slots]:[...slots].reverse();
    ordered.forEach((slot,i)=>{const cell=renderSlot(slot,label);const pos=front?i+1:slots.length-i;cell.dataset.position=pos;cell.dataset.street=street.id;cell.tabIndex=0;if(!slot)cell.title=`${label} • posição ${pos} • Vaga livre`;cell.setAttribute('aria-label',cell.title);a.appendChild(cell);});
    return a;
  }
  function emptyPlan(){const street=(id,capacity,description='')=>({id,description,capacity,used:0,slots:Array(capacity).fill(null)});return {caixaria:Array.from({length:7},(_,i)=>street('CX'+(i+1),12)),main:[street('R1',13),...Array.from({length:6},(_,i)=>street('R'+(i+2),12)),street('R8',13),street('R9',13)],front:[street('PF1',6),street('PF2',6)],flow:{items:[],sku_capacity:24,pallets:12},overflow:[],used_slots:0};}
  function block(title,subtitle,streets,front=false){const el=document.createElement('section');el.className='croqui-block';const head=document.createElement('header');head.innerHTML=`<strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small>`;el.appendChild(head);const lanes=document.createElement('div');lanes.className='croqui-lanes';streets.forEach(st=>lanes.appendChild(lane(st,front)));el.appendChild(lanes);return el;}

  function renderPlan(){
    const items=L.items||[],plan=L.plan||emptyPlan();
    $('pickStreets').textContent=18;$('pickSlots').textContent=207;$('pickUsed').textContent=items.length?`${plan.used_slots||0} ocupadas`:'Sem dados neste mês';$('pickSkus').textContent=items.length||'—';$('pickMulti').textContent=items.length?items.filter(x=>Number(x.assigned_slots||0)>1).length:'—';
    const root=$('pickingPlan');root.innerHTML='';root.className='picking-plan croqui-scroll';root.tabIndex=0;root.setAttribute('aria-label','Croqui do Picking. Role horizontalmente para ver todas as ruas.');
    const canvas=document.createElement('div');canvas.className='croqui-canvas';root.appendChild(canvas);
    const top=document.createElement('div');top.className='croqui-top';
    top.appendChild(block('Caixaria','7 × 12 · 84 vagas',plan.caixaria||[]));
    top.appendChild(block('Rua dupla 4','2 × 13 vagas',(plan.main||[]).slice(7,9)));
    top.appendChild(block('Rua dupla 3','2 × 12 vagas',(plan.main||[]).slice(5,7)));
    top.appendChild(block('Rua dupla 2','2 × 12 vagas',(plan.main||[]).slice(3,5)));
    top.appendChild(block('Rua dupla 1','2 × 12 vagas',(plan.main||[]).slice(1,3)));
    top.appendChild(block('Rua simples','13 vagas',(plan.main||[]).slice(0,1)));
    canvas.appendChild(top);
    const gap=document.createElement('div');gap.className='croqui-corridor croqui-corridor-empty';gap.setAttribute('aria-hidden','true');canvas.appendChild(gap);
    const bottom=document.createElement('div');bottom.className='croqui-bottom';bottom.appendChild(block('Dupla frontal','2 × 6 · 12 vagas',plan.front||[],true));
    const flowItems=plan.flow?.items||[];const flowStreets=[0,1].map(col=>({id:'FR'+(col+1),description:'C extremo',capacity:12,slots:Array.from({length:12},(_,row)=>{const item=flowItems[row*2+col];return item?{...item,position:row+1}:null;})}));
    const rack=block('Flow Rack','12 paletes · até 24 SKUs C extremo',flowStreets,true);rack.classList.add('croqui-flow');bottom.appendChild(rack);canvas.appendChild(bottom);
    const note=document.createElement('p');note.className='croqui-caption';note.textContent='Marketplace, barris de chopp e BAGs são excluídos deste layout. Flow Rack: somente os SKUs C de menor giro. Nas ruas, cada SKU elegível recebe ao menos 1 vaga antes da duplicação dos maiores giros.';canvas.appendChild(note);
    const extras=plan.overflow||[];
    if(extras.length){const detail=document.createElement('details');detail.className='croqui-extras';const summary=document.createElement('summary');summary.textContent=`${extras.length} SKUs excedem a capacidade física disponível neste mês`;detail.appendChild(summary);const list=document.createElement('div');list.className='croqui-extra-list';for(const x of extras){const row=document.createElement('div');row.className=`croqui-extra ${slotMatches(x)?'':'filtered-out'}`;row.textContent=`${x.sku_code} · ${x.sku_name} · ${x.family_label} · Curva ${x.curve_class}`;list.appendChild(row);}detail.appendChild(list);root.appendChild(detail);}
  }

  function parseCatalogLayout(rows){const h=locateHeader(rows,[['codigo'],['descricao'],['fator hecto comercial'],['embalagem'],['fam embalagem siv']]);if(h.score<5)throw new Error('01.11: não encontrei Código, Descrição, Fator Hecto Comercial, Embalagem e Fam. Embalagem SIV.');const codeI=col(h.headers,['codigo']),nameI=col(h.headers,['descricao']),factorI=col(h.headers,['fator hecto comercial']),packI=col(h.headers,['embalagem']),famI=col(h.headers,['fam embalagem siv']),palletI=col(h.headers,['caixas pallet']),subI=col(h.headers,['subtipo']);const items=[];for(let r=h.row+1;r<rows.length;r++){const row=rows[r]||[];const code=normCode(row[codeI]);if(!code)continue;const factor=num(row[factorI]);items.push({sku_code:code,sku_name:String(row[nameI]||'').trim(),packaging:String(row[packI]||'').trim(),family_siv:String(row[famI]||'').trim(),factor_hecto_commercial:Number.isFinite(factor)?factor:0,boxes_per_pallet:palletI>=0&&Number.isFinite(num(row[palletI]))?num(row[palletI]):null,subtype:subI>=0?String(row[subI]||'').trim():''});}return items;}
  function buildImportModal(){if($('pickingImportModal'))return;const m=document.createElement('div');m.id='pickingImportModal';m.className='picking-import-backdrop hidden';m.innerHTML=`<div class="picking-import-card"><div class="picking-import-head"><div><p class="eyebrow">LAYOUT • PICKING</p><h2>Atualizar mês</h2></div><button class="close-button" id="pickClose">×</button></div><p class="picking-import-copy">Envie o OCP 03.02.36.01. O 01.11 só precisa ser reenviado quando houver alteração cadastral ou produto novo.</p><div class="import-grid"><label>Mês de referência<select id="pickImportMonth"></select></label><label>Cadastro 01.11<input id="pickCatalogStatus" value="Verificando..." disabled /></label></div><div class="picking-import-grid"><label class="picking-file" id="pickOcpSlot"><input type="file" id="pickOcpFile" accept=".csv"/><strong>03.02.36.01 • OCP</strong><small id="pickOcpName">Obrigatório</small></label><label class="picking-file" id="pickCatSlot"><input type="file" id="pickCatFile" accept=".csv"/><strong>01.11 • famílias</strong><small id="pickCatName">Opcional se já cadastrado</small></label></div><details class="picking-method"><summary>Memória do cálculo e layout</summary><div>O cálculo usa somente <strong>Pallet Fechado = NÃO</strong>. Antes da alocação, o sistema exclui <strong>Marketplace, barris de chopp e BAGs</strong>. O Flow Rack recebe até 24 SKUs da <strong>cauda extrema da Curva C</strong>. Nas demais ruas, a organização considera família de embalagem e curva. <strong>Todos os SKUs elegíveis recebem uma vaga antes de qualquer SKU ganhar a segunda.</strong></div></details><p class="picking-error" id="pickError"></p><div class="picking-import-actions"><button class="outline-button" id="pickCancel">Cancelar</button><button class="primary-button" id="pickConfirm" disabled>Gerar layout</button></div></div>`;document.body.appendChild(m);for(const [k,l] of MONTHS)$('pickImportMonth').add(new Option(`${l}/2026`,k));$('pickClose').onclick=closeImport;$('pickCancel').onclick=closeImport;$('pickOcpFile').onchange=validateImport;$('pickCatFile').onchange=validateImport;$('pickConfirm').onclick=confirmImport;}
  function openImport(){$('pickImportMonth').value=L.month;$('pickCatalogStatus').value=L.catalogCount?`${L.catalogCount} produtos cadastrados`:'Nenhum cadastro salvo';$('pickOcpFile').value='';$('pickCatFile').value='';$('pickOcpName').textContent='Obrigatório';$('pickCatName').textContent=L.catalogCount?'Opcional • base já cadastrada':'Necessário no primeiro uso';$('pickOcpSlot').classList.remove('loaded');$('pickCatSlot').classList.remove('loaded');$('pickError').textContent='';validateImport();$('pickingImportModal').classList.remove('hidden');}
  function closeImport(){$('pickingImportModal').classList.add('hidden');}
  function validateImport(){const o=$('pickOcpFile').files[0],c=$('pickCatFile').files[0];$('pickOcpName').textContent=o?o.name:'Obrigatório';$('pickCatName').textContent=c?c.name:(L.catalogCount?'Opcional • base já cadastrada':'Necessário no primeiro uso');$('pickOcpSlot').classList.toggle('loaded',!!o);$('pickCatSlot').classList.toggle('loaded',!!c);$('pickConfirm').disabled=!o||(!L.catalogCount&&!c);}
  async function confirmImport(){const btn=$('pickConfirm'),ocp=$('pickOcpFile').files[0],cat=$('pickCatFile').files[0];if(!ocp)return;btn.disabled=true;btn.textContent='Processando...';$('pickError').textContent='';try{const parsed=parsePicking(await readRows(ocp));const ocpItems=[...parsed.values.entries()].map(([sku_code,v])=>({sku_code,sku_name:v.name||'',volume_boxes:v.boxes}));let catalogItems=[];if(cat)catalogItems=parseCatalogLayout(await readRows(cat));const month=$('pickImportMonth').value;await lapi('import',{month,source_file:ocp.name,ocp_items:ocpItems,catalog_items:catalogItems,catalog_file:cat?.name||''});L.month=month;closeImport();showToast('Layout do Picking atualizado.');await refreshAll();}catch(e){$('pickError').textContent=e.message;}finally{btn.textContent='Gerar layout';validateImport();}}

  window.__PICKING_LAYOUT_VERSION='2026-09-16-physical-v5';
  setTimeout(mount,80);
})();