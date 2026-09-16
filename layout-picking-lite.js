(() => {
  if(window.__pickingLayout)return;
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/layout-api';
  const L={months:[],month:state.currentMonth||'2026-06',items:[],plan:null,family:'',curve:'',cache:new Map(),mounted:false,loading:null};
  const fmt=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function addStyle(href){if(document.querySelector(`link[href^="${href}"]`))return;const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);}
  addStyle('layout-picking.css?v=20260916-6');addStyle('layout-picking-v5.css?v=20260916-2');
  if(!document.getElementById('layoutLiteBase')){const s=document.createElement('style');s.id='layoutLiteBase';s.textContent='.layout-module{display:grid;gap:10px}.layout-tabs{display:flex;gap:5px;padding:5px;background:#fff;border:1px solid var(--line);border-radius:10px}.layout-tab{border:0;background:var(--orange-soft);color:#b95612;border-radius:7px;padding:7px 10px;font-size:10px;font-weight:700}.layout-section{display:grid;gap:10px}.sync-badge{display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid #cfe8dc;border-radius:10px;background:#f4fbf7;color:#1e6548;font-size:10px;white-space:nowrap}.sync-badge i{width:7px;height:7px;border-radius:50%;background:#2f9d68}.sync-badge small{color:#6d8177}@media(max-width:900px){.sync-badge{width:100%;justify-content:center}}';document.head.appendChild(s);}

  async function lapi(action,payload={}){const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':state.token},body:JSON.stringify({action,...payload})});const data=await res.json().catch(()=>({error:'Resposta inválida'}));if(!res.ok)throw new Error(data.error||'Erro no Layout');return data;}
  const monthInfo=m=>L.months.find(x=>String(x.reference_month||'').startsWith(m));
  const familyName=x=>x.family_label||String(x.packaging||'').replace(/^\d+\s*-\s*/,'').trim()||'Outros';
  const slotMatches=s=>!s||((!L.family||s.family_label===L.family)&&(!L.curve||s.curve_class===L.curve));

  function mount(){
    if(L.mounted)return true;
    const panel=document.querySelector('[data-layout-panel="picking"]');if(!panel)return false;
    L.mounted=true;
    panel.innerHTML=`<div class="picking-layout"><div class="picking-toolbar"><div class="filter-group"><label>Mês</label><select id="pickingMonth"></select></div><div class="filter-group"><label>Família</label><select id="pickingFamily"><option value="">Todas</option></select></div><div class="filter-group"><label>Curva</label><select id="pickingCurve"><option value="">Todas</option><option>A</option><option>B</option><option>C</option></select></div><div class="toolbar-spacer"></div><div class="sync-badge" title="O Layout reutiliza a Curva ABC do Picking do mesmo mês"><i></i><strong>Sincronizado com Curva ABC</strong><small>OCP reaproveitado</small></div></div><div class="picking-months" id="pickingMonths"></div><div class="picking-kpis"><div class="picking-kpi"><span>Ruas físicas</span><strong>18</strong></div><div class="picking-kpi"><span>Vagas de rua</span><strong>207</strong><small id="pickUsed"></small></div><div class="picking-kpi"><span>SKUs no layout</span><strong id="pickSkus">—</strong></div><div class="picking-kpi"><span>Múltiplas vagas</span><strong id="pickMulti">—</strong></div></div><div class="panel picking-map-panel"><div class="panel-heading"><div><h2>Mapa do Picking</h2><small class="picking-map-note">207 vagas físicas • Flow Rack complementar • fonte automática: Curva ABC / OCP 03.02.36.01</small></div><div class="picking-legend"><span><i class="a"></i>A</span><span><i class="b"></i>B</span><span><i class="c"></i>C</span></div></div><div class="picking-plan" id="pickingPlan"></div></div><div class="picking-audit"><strong>Base única:</strong> o Layout reutiliza o Picking calculado na Curva ABC. Marketplace, barris, BAGs e ativos de giro ficam fora; cada SKU elegível recebe posição antes da duplicação de alto giro e o Flow Rack recebe a cauda extrema da Curva C.</div></div>`;
    $('pickingMonth').onchange=e=>{L.month=e.target.value;loadMonth().catch(er=>showToast(er.message,true));};
    $('pickingFamily').onchange=e=>{L.family=e.target.value;renderPlan();};
    $('pickingCurve').onchange=e=>{L.curve=e.target.value;renderPlan();};
    return true;
  }

  function renderMonths(){const sel=$('pickingMonth'),wrap=$('pickingMonths');if(!sel||!wrap)return;sel.innerHTML='';wrap.innerHTML='';for(const [key,label] of MONTHS){const ok=!!monthInfo(key);sel.add(new Option(`${label}/2026`,key));const b=document.createElement('button');b.className=`picking-month ${ok?'imported':''} ${key===L.month?'active':''}`;b.innerHTML=`<strong>${label}</strong><small>${ok?'Atualizado':'Pendente'}</small>`;b.onclick=()=>{L.month=key;sel.value=key;renderMonths();loadMonth().catch(e=>showToast(e.message,true));};wrap.appendChild(b);}sel.value=L.month;}
  function renderFilters(){const sel=$('pickingFamily');if(!sel)return;const fams=[...new Set(L.items.map(familyName))].sort((a,b)=>a.localeCompare(b,'pt-BR'));const cur=L.family;sel.innerHTML='<option value="">Todas</option>'+fams.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');L.family=fams.includes(cur)?cur:'';sel.value=L.family;}

  async function loadMonth(){
    renderMonths();
    if(!monthInfo(L.month)){L.items=[];L.plan=null;renderFilters();renderPlan();return;}
    let d=L.cache.get(L.month);
    if(!d){d=await lapi('get',{month:L.month});L.cache.set(L.month,d);}
    L.items=d.items||[];L.plan=d.plan||null;renderFilters();renderPlan();
  }

  function renderSlot(slot,label){const cell=document.createElement('div');if(!slot){cell.className='picking-slot empty';cell.title='Vaga livre';return cell;}cell.className=`picking-slot ${String(slot.curve_class).toLowerCase()} ${slotMatches(slot)?'':'filtered-out'}`;cell.innerHTML=`<span>${esc(slot.sku_code)}</span>`;cell.title=`${label} • posição ${slot.position}\n${slot.sku_code} • ${slot.sku_name}\n${slot.family_label} • Curva ${slot.curve_class}\n${fmt.format(Number(slot.volume_hl||0))} HL`;return cell;}
  function lane(street,front=false){const a=document.createElement('article');a.className='croqui-lane';const slots=street.slots||Array(street.capacity||12).fill(null),desc=street.description||street.label||'',label=desc?`${street.id} · ${desc}`:street.id;a.innerHTML=`<div class="croqui-lane-id"><strong>${esc(street.id)}</strong><span>${esc(desc)}</span></div>`;const ordered=front?[...slots]:[...slots].reverse();ordered.forEach((slot,i)=>{const cell=renderSlot(slot,label),pos=front?i+1:slots.length-i;cell.dataset.position=pos;cell.dataset.street=street.id;cell.tabIndex=0;if(!slot)cell.title=`${label} • posição ${pos} • Vaga livre`;cell.setAttribute('aria-label',cell.title);a.appendChild(cell);});return a;}
  function emptyPlan(){const st=(id,capacity)=>({id,capacity,used:0,slots:Array(capacity).fill(null)});return{caixaria:Array.from({length:7},(_,i)=>st('CX'+(i+1),12)),main:[st('R1',13),...Array.from({length:6},(_,i)=>st('R'+(i+2),12)),st('R8',13),st('R9',13)],front:[st('PF1',6),st('PF2',6)],flow:{items:[]},overflow:[],used_slots:0};}
  function block(title,subtitle,streets,front=false){const el=document.createElement('section');el.className='croqui-block';el.innerHTML=`<header><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></header>`;const lanes=document.createElement('div');lanes.className='croqui-lanes';streets.forEach(s=>lanes.appendChild(lane(s,front)));el.appendChild(lanes);return el;}

  function renderPlan(){
    const plan=L.plan||emptyPlan(),items=L.items||[];$('pickUsed').textContent=items.length?`${plan.used_slots||0} ocupadas`:'Sem dados neste mês';$('pickSkus').textContent=items.length||'—';$('pickMulti').textContent=items.length?items.filter(x=>Number(x.assigned_slots||0)>1).length:'—';
    const root=$('pickingPlan');if(!root)return;root.innerHTML='';root.className='picking-plan croqui-scroll';
    const canvas=document.createElement('div');canvas.className='croqui-canvas';root.appendChild(canvas);
    const top=document.createElement('div');top.className='croqui-top';top.appendChild(block('Caixaria','7 × 12 · 84 vagas',plan.caixaria||[]));top.appendChild(block('Rua dupla 4','2 × 13 vagas',(plan.main||[]).slice(7,9)));top.appendChild(block('Rua dupla 3','2 × 12 vagas',(plan.main||[]).slice(5,7)));top.appendChild(block('Rua dupla 2','2 × 12 vagas',(plan.main||[]).slice(3,5)));top.appendChild(block('Rua dupla 1','2 × 12 vagas',(plan.main||[]).slice(1,3)));top.appendChild(block('Rua simples','13 vagas',(plan.main||[]).slice(0,1)));canvas.appendChild(top);
    const gap=document.createElement('div');gap.className='croqui-corridor croqui-corridor-empty';gap.setAttribute('aria-hidden','true');canvas.appendChild(gap);
    const bottom=document.createElement('div');bottom.className='croqui-bottom';bottom.appendChild(block('Dupla frontal','2 × 6 · 12 vagas',plan.front||[],true));const flow=plan.flow?.items||[];const flowStreets=[0,1].map(col=>({id:'FR'+(col+1),description:'C extremo',capacity:12,slots:Array.from({length:12},(_,row)=>{const item=flow[row*2+col];return item?{...item,position:row+1}:null;})}));const rack=block('Flow Rack','12 paletes · até 24 SKUs C extremo',flowStreets,true);rack.classList.add('croqui-flow');bottom.appendChild(rack);canvas.appendChild(bottom);
    const note=document.createElement('p');note.className='croqui-caption';note.textContent='Marketplace, barris de chopp, BAGs e ativos de giro não entram no layout. O Flow Rack recebe somente os SKUs C de menor giro.';canvas.appendChild(note);
    const extras=plan.overflow||[];if(extras.length){const d=document.createElement('details');d.className='croqui-extras';d.innerHTML=`<summary>${extras.length} SKUs exigem revisão de capacidade/família</summary>`;const list=document.createElement('div');list.className='croqui-extra-list';for(const x of extras){const row=document.createElement('div');row.className=`croqui-extra ${slotMatches(x)?'':'filtered-out'}`;row.textContent=`${x.sku_code} · ${x.sku_name} · ${x.family_label} · Curva ${x.curve_class}`;list.appendChild(row);}d.appendChild(list);root.appendChild(d);}
  }

  async function refreshAll(){
    if(!mount())return;
    if(L.loading)return L.loading;
    L.loading=(async()=>{const m=await lapi('months');L.months=m.months||[];if(!monthInfo(L.month)){const avail=MONTHS.map(x=>x[0]).filter(monthInfo);if(avail.length)L.month=avail[avail.length-1];}renderMonths();await loadMonth();})().finally(()=>{L.loading=null;});
    return L.loading;
  }

  window.__pickingLayout={open:refreshAll,invalidate:(month)=>{if(month)L.cache.delete(month);else L.cache.clear();}};
  mount();
})();