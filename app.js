const API_URL = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
const MONTHS = [
  ['2026-01','Jan'],['2026-02','Fev'],['2026-03','Mar'],['2026-04','Abr'],['2026-05','Mai'],['2026-06','Jun'],['2026-07','Jul'],['2026-08','Ago'],['2026-09','Set']
];
const AREAS = ['Regulador','Picking','Câmara Fria','Marketplace'];
const COLD_ROOM_SKUS = new Set(['827','828','838']);

const state = {
  token: localStorage.getItem('pa_session') || '',
  user: null,
  months: [],
  currentMonth: '2026-06',
  currentArea: 'Regulador',
  currentItems: [],
  reports: { sales:null, picking:null, catalog:null, marketplace:null },
  marketplaceItems: []
};
const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});

async function api(action, payload = {}, auth = true) {
  const headers = {'Content-Type':'application/json'};
  if (auth && state.token) headers['x-session-token'] = state.token;
  const res = await fetch(API_URL, { method:'POST', headers, body: JSON.stringify({action, ...payload}) });
  const data = await res.json().catch(()=>({error:'Resposta inválida'}));
  if (!res.ok) throw new Error(data.error || data.detail || 'Erro na requisição');
  return data;
}

function showToast(message, error=false) {
  const el=$('toast'); el.textContent=message; el.classList.toggle('error',error); el.classList.remove('hidden');
  clearTimeout(showToast.t); showToast.t=setTimeout(()=>el.classList.add('hidden'),3500);
}

function setLoggedIn(user) {
  state.user=user;
  $('loginScreen').classList.add('hidden'); $('appShell').classList.remove('hidden');
  $('userName').textContent=user.display_name || user.username; $('userRole').textContent=user.role==='admin'?'ADM':'VISUALIZAÇÃO';
  $('userInitials').textContent=(user.display_name||user.username).split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',user.role!=='admin'));
}

function logoutLocal(){ state.token='';state.user=null;localStorage.removeItem('pa_session');$('appShell').classList.add('hidden');$('loginScreen').classList.remove('hidden');$('loginPassword').value=''; }

async function refreshMonths() {
  const data=await api('months'); state.months=data.months||[];
  renderMonths();
}

async function refreshMarketplaceBase() {
  try {
    const data=await api('marketplace_base');
    state.marketplaceItems=data.items||[];
    if ($('marketplaceStatus')) {
      const strong=$('marketplaceStatus').querySelector('strong');
      strong.textContent=state.marketplaceItems.length ? `${state.marketplaceItems.length} SKUs salvos` : 'Nenhuma base salva';
    }
  } catch(e) {
    if ($('marketplaceStatus')) $('marketplaceStatus').querySelector('strong').textContent='Não foi possível consultar';
  }
}

function monthInfo(month){ return state.months.find(m=>m.reference_month?.startsWith(month)); }
function renderMonths(){
  const strip=$('monthStrip'), select=$('monthFilter'), imp=$('importMonth'); strip.innerHTML=''; select.innerHTML=''; imp.innerHTML='';
  for(const [key,label] of MONTHS){ const info=monthInfo(key); const imported=info?.status==='imported';
    const btn=document.createElement('button'); btn.className=`month-pill ${imported?'imported':'pending'} ${key===state.currentMonth?'active':''}`; btn.innerHTML=`<strong>${label}</strong><small>${imported?'Atualizado':'Pendente'}</small>`; btn.onclick=()=>{state.currentMonth=key; select.value=key; renderMonths();loadCurve();}; strip.appendChild(btn);
    const op=new Option(`${label}/2026${imported?' •':''}`,key); select.add(op); imp.add(new Option(`${label}/2026`,key));
  }
  select.value=state.currentMonth; imp.value=state.currentMonth;
}

async function loadCurve(){
  const info=monthInfo(state.currentMonth); $('kpiSource').textContent=info?.source_file || (info?'Sem arquivo identificado':'Aguardando importação');
  if(!info || info.status!=='imported'){ state.currentItems=[]; renderCurve(); renderAreaCards(); return; }
  try{ const data=await api('curve',{month:state.currentMonth,area:state.currentArea});state.currentItems=data.items||[]; renderCurve(); await renderAreaCards(true); }
  catch(e){ showToast(e.message,true); }
}

function renderCurve(){
  const items=state.currentItems; const counts={A:0,B:0,C:0}; let total=0;
  items.forEach(x=>{counts[x.curve_class]=(counts[x.curve_class]||0)+1;total+=Number(x.volume_hl||0)});
  $('kpiSkus').textContent=items.length||'—'; $('kpiVolume').textContent=items.length?fmt.format(total)+' HL':'—'; $('kpiA').textContent=items.length?counts.A:'—'; $('kpiB').textContent=items.length?counts.B:'—'; $('kpiC').textContent=items.length?counts.C:'—';
  const p=$('paretoSummary');
  if(!items.length) p.innerHTML='<div class="pareto-empty">Nenhum dado carregado para este mês.</div>';
  else { const vol={A:0,B:0,C:0};items.forEach(x=>vol[x.curve_class]+=Number(x.volume_hl||0)); const pa=100*vol.A/total,pb=100*vol.B/total,pc=100*vol.C/total; p.innerHTML=`<div class="pareto-bar"><span class="pareto-segment a" style="width:${pa}%"></span><span class="pareto-segment b" style="width:${pb}%"></span><span class="pareto-segment c" style="width:${pc}%"></span></div><div class="pareto-stats"><div class="pareto-stat"><strong>${fmt.format(pa)}%</strong><span>volume em A</span></div><div class="pareto-stat"><strong>${fmt.format(pb)}%</strong><span>volume em B</span></div><div class="pareto-stat"><strong>${fmt.format(pc)}%</strong><span>volume em C</span></div></div>`; }
  renderTable();
}

async function renderAreaCards(fetchAll=false){
  const wrap=$('areaCards');wrap.innerHTML='';
  for(const area of AREAS){ let count='—',volume='';
    if(area===state.currentArea){count=state.currentItems.length;volume=state.currentItems.reduce((s,x)=>s+Number(x.volume_hl||0),0)}
    else if(fetchAll && monthInfo(state.currentMonth)?.status==='imported'){try{const d=await api('curve',{month:state.currentMonth,area});count=d.items.length;volume=d.items.reduce((s,x)=>s+Number(x.volume_hl||0),0)}catch{}}
    const b=document.createElement('button');b.className=`area-card ${area===state.currentArea?'active':''}`;b.innerHTML=`<strong>${area}</strong><span>${count==='—'?'Sem dados':`${count} SKUs • ${fmt.format(volume)} HL`}</span>`;b.onclick=()=>{state.currentArea=area;$('areaFilter').value=area;loadCurve();};wrap.appendChild(b);
  }
}

function renderTable(){
  const q=$('skuSearch').value.trim().toLowerCase(), cls=$('classFilter').value; const body=$('abcTableBody');body.innerHTML='';
  const rows=state.currentItems.filter(x=>(!cls||x.curve_class===cls)&&(!q||x.sku_code.toLowerCase().includes(q)||(x.sku_name||'').toLowerCase().includes(q)));
  $('abcEmpty').classList.toggle('hidden',rows.length>0); $('tableTitle').textContent=`SKUs • ${state.currentArea}`;
  for(const x of rows){const tr=document.createElement('tr');tr.innerHTML=`<td>${x.rank}</td><td><strong>${x.sku_code}</strong></td><td>${x.sku_name||'—'}</td><td>${fmt.format(Number(x.volume_hl||0))}</td><td>${fmt.format(Number(x.avg_hl||0))}</td><td>${fmt.format(Number(x.weight_pct||0))}%</td><td>${fmt.format(Number(x.pareto_pct||0))}%</td><td><span class="curve-badge ${x.curve_class.toLowerCase()}">${x.curve_class}</span></td>`;body.appendChild(tr)}
}

function normText(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function normCode(v){let s=String(v??'').trim().replace(/^'+/,'').replace(/\.0+$/,'');if(/^\d+$/.test(s))s=String(Number(s));return s;}
function num(v){if(typeof v==='number')return v;let s=String(v??'').trim().replace(/\s/g,'');if(!s)return NaN;if(s.includes(',')&&s.includes('.')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}else if(s.includes(','))s=s.replace(',','.');return Number(s);}

async function readRows(file){
  const buf=await file.arrayBuffer();
  let wb;
  if(file.name.toLowerCase().endsWith('.csv')){
    let text;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{text=new TextDecoder('windows-1252').decode(buf);}
    wb=XLSX.read(text,{type:'string'});
  }else wb=XLSX.read(buf,{type:'array'});
  const sh=wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sh,{header:1,raw:false,defval:''});
}

function locateHeader(rows, required){
  let best={row:-1,score:0,headers:[]};
  for(let r=0;r<Math.min(rows.length,15);r++){
    const headers=(rows[r]||[]).map(normText);let score=0;
    for(const group of required) if(group.some(x=>headers.includes(x))) score++;
    if(score>best.score)best={row:r,score,headers};
  }
  return best;
}
function col(headers, aliases){for(const a of aliases){const i=headers.indexOf(a);if(i>=0)return i;}return -1;}

function parseSales(rows){
  const h=locateHeader(rows,[['produto','cod produto','codigo produto'],['total']]);
  if(h.score<2)throw new Error('03.05.19: cabeçalho Produto/Total não encontrado.');
  const codeI=col(h.headers,['produto','cod produto','codigo produto']);
  const nameI=col(h.headers,['nome produto','descricao produto','desc produto']);
  const totals=h.headers.map((x,i)=>x==='total'?i:-1).filter(i=>i>=0); const totalI=totals[totals.length-1];
  const values=new Map();
  for(let r=h.row+1;r<rows.length;r++){const row=rows[r]||[];const code=normCode(row[codeI]);const q=num(row[totalI]);if(!code||!Number.isFinite(q))continue;const p=values.get(code)||{boxes:0,name:''};p.boxes+=q;if(!p.name&&nameI>=0)p.name=String(row[nameI]||'').trim();values.set(code,p);}
  return {values,count:values.size};
}

function parseCatalog(rows){
  const h=locateHeader(rows,[['codigo'],['descricao'],['fator hecto comercial'],['caixas pallet']]);
  if(h.score<4)throw new Error('01.11: colunas Código, Descrição, Fator Hecto Comercial e Caixas Pallet não encontradas.');
  const codeI=col(h.headers,['codigo']),nameI=col(h.headers,['descricao']),factorI=col(h.headers,['fator hecto comercial']),palletI=col(h.headers,['caixas pallet']);
  const values=new Map();
  for(let r=h.row+1;r<rows.length;r++){const row=rows[r]||[];const code=normCode(row[codeI]);if(!code)continue;const factor=num(row[factorI]),pallet=num(row[palletI]);values.set(code,{name:String(row[nameI]||'').trim(),factor:Number.isFinite(factor)?factor:0,boxesPerPallet:Number.isFinite(pallet)?pallet:0});}
  return {values,count:values.size};
}

function parsePicking(rows){
  const h=locateHeader(rows,[['cod produto','codigo produto'],['qt caixas pallet'],['pallet fechado'],['data emisssao mapa','data emissao mapa']]);
  if(h.score<4)throw new Error('03.02.36.01: colunas de produto, caixas/pallet, Pallet Fechado e Data Emissão não encontradas.');
  const codeI=col(h.headers,['cod produto','codigo produto']),qtyI=col(h.headers,['qt caixas pallet']),closedI=col(h.headers,['pallet fechado']),dateI=col(h.headers,['data emisssao mapa','data emissao mapa']),nameI=col(h.headers,['desc produto','descricao produto']);
  const values=new Map(),dates=new Set();
  for(let r=h.row+1;r<rows.length;r++){const row=rows[r]||[];const date=String(row[dateI]||'').trim();if(date)dates.add(date);const code=normCode(row[codeI]);if(!code||normText(row[closedI])!=='nao')continue;const q=num(row[qtyI]);if(!Number.isFinite(q))continue;const p=values.get(code)||{boxes:0,name:''};p.boxes+=q;if(!p.name&&nameI>=0)p.name=String(row[nameI]||'').trim();values.set(code,p);}
  return {values,count:values.size,days:dates.size};
}

function parseMarketplace(rows){
  let header=-1,codeI=-1,nameI=-1;
  const codeAliases=['codigo','cod','sku','codigo sku','cod sku','cod produto','codigo produto','produto','material'];
  const nameAliases=['descricao','nome','nome sku','descricao sku','nome produto','desc produto','produto descricao'];
  for(let r=0;r<Math.min(rows.length,15);r++){const headers=(rows[r]||[]).map(normText);const i=col(headers,codeAliases);if(i>=0){header=r;codeI=i;nameI=col(headers,nameAliases);break;}}
  if(header<0){header=-1;codeI=0;nameI=1;}
  const items=[],seen=new Set();
  for(let r=header+1;r<rows.length;r++){const row=rows[r]||[];const code=normCode(row[codeI]);if(!code||seen.has(code)||!/^\d+$/.test(code))continue;seen.add(code);items.push({sku_code:code,sku_name:nameI>=0?String(row[nameI]||'').trim():''});}
  if(!items.length)throw new Error('Base Marketplace: nenhum código de SKU foi identificado.');
  return {items,count:items.length};
}

function makeAreaRows(source,master,filter,withPallets=false){
  const out=[];
  for(const [code,v] of source.entries()){
    if(filter && !filter(code))continue;
    const m=master.get(code); if(!m||!Number.isFinite(m.factor)||m.factor<=0||!Number.isFinite(v.boxes)||v.boxes<=0)continue;
    const hl=v.boxes*m.factor;
    if(!Number.isFinite(hl)||hl<=0)continue;
    out.push({sku_code:code,sku_name:m.name||v.name||'',volume_caixas:v.boxes,volume_hl:hl,volume_pallets:withPallets&&m.boxesPerPallet>0?v.boxes/m.boxesPerPallet:null});
  }
  return out;
}

function buildAreas(){
  const sales=state.reports.sales.data.values, pick=state.reports.picking.data.values, master=state.reports.catalog.data.values;
  const marketplaceSet=new Set((state.reports.marketplace?.data?.items||state.marketplaceItems).map(x=>normCode(x.sku_code)));
  const regulator=makeAreaRows(sales,master,code=>!marketplaceSet.has(code)&&!COLD_ROOM_SKUS.has(code),true);
  const picking=makeAreaRows(pick,master,null,false);
  const cold=makeAreaRows(sales,master,code=>COLD_ROOM_SKUS.has(code),false);
  const marketplace=makeAreaRows(sales,master,code=>marketplaceSet.has(code),false);
  return {Regulador:regulator,Picking:picking,'Câmara Fria':cold,Marketplace:marketplace};
}

function reportUi(kind){
  return {
    sales:{slot:'slotSales',name:'nameSales',label:'03.05.19'},
    picking:{slot:'slotPicking',name:'namePicking',label:'03.02.36.01'},
    catalog:{slot:'slotCatalog',name:'nameCatalog',label:'01.11'},
    marketplace:{slot:'slotMarketplace',name:'nameMarketplace',label:'Base Marketplace'}
  }[kind];
}

function updateImportReady(){
  const checks=[];
  for(const kind of ['sales','picking','catalog']){const r=state.reports[kind];if(r)checks.push(`<div class="check-item">✓ ${reportUi(kind).label}: ${r.data.count} SKUs identificados</div>`);}
  if(state.reports.marketplace)checks.push(`<div class="check-item">✓ Base Marketplace: ${state.reports.marketplace.data.count} SKUs</div>`);
  $('importChecks').innerHTML=checks.join('');
  const reportsOk=['sales','picking','catalog'].every(k=>state.reports[k]);
  const baseOk=!!state.reports.marketplace || state.marketplaceItems.length>0;
  const days=state.reports.picking?.data?.days||0;
  $('importDays').value=days?`${days} dias identificados automaticamente`:'Automático pelo 03.02.36.01';
  const ready=reportsOk&&baseOk&&days>0;
  $('confirmImport').disabled=!ready;
  $('importReady').classList.toggle('bad',!ready);
  $('importReady').textContent=!reportsOk?'Selecione os três relatórios mensais.':!baseOk?'Inclua uma Base Marketplace para a primeira atualização.':!days?'Não foi possível identificar os dias do período.':`Pronto para calcular • ${days} dias no período.`;
}

async function handleReport(kind,file){
  const ui=reportUi(kind),slot=$(ui.slot),name=$(ui.name);slot.classList.remove('loaded','invalid');name.textContent='Lendo arquivo...';$('importError').textContent='';
  try{
    const rows=await readRows(file);let data;
    if(kind==='sales')data=parseSales(rows);else if(kind==='picking')data=parsePicking(rows);else if(kind==='catalog')data=parseCatalog(rows);else data=parseMarketplace(rows);
    state.reports[kind]={file,data};slot.classList.add('loaded');name.textContent=file.name;updateImportReady();
  }catch(e){state.reports[kind]=null;slot.classList.add('invalid');name.textContent='Arquivo não reconhecido';$('importError').textContent=e.message;updateImportReady();}
}

async function openImport(){
  $('importModal').classList.remove('hidden');$('importMonth').value=state.currentMonth;$('importError').textContent='';$('importChecks').innerHTML='';state.reports={sales:null,picking:null,catalog:null,marketplace:null};
  for(const id of ['reportSales','reportPicking','reportCatalog','reportMarketplace'])$(id).value='';
  for(const kind of ['sales','picking','catalog','marketplace']){$(reportUi(kind).slot).classList.remove('loaded','invalid');}
  $('nameSales').textContent='Volume de venda por produto';$('namePicking').textContent='Movimentação / separação';$('nameCatalog').textContent='Cadastro e fatores dos SKUs';$('nameMarketplace').textContent='Opcional se a base já estiver salva';
  await refreshMarketplaceBase();updateImportReady();
}
function closeImport(){ $('importModal').classList.add('hidden'); }

async function submitImport(){
  const btn=$('confirmImport');btn.disabled=true;btn.textContent='Calculando...';$('importError').textContent='';
  try{
    if(state.reports.marketplace){await api('marketplace_import',{source_file:state.reports.marketplace.file.name,items:state.reports.marketplace.data.items});await refreshMarketplaceBase();}
    const days=state.reports.picking.data.days;if(!days)throw new Error('Dias do período não identificados no 03.02.36.01.');
    const areas=buildAreas();
    const empty=AREAS.filter(a=>!areas[a].length);if(empty.length)throw new Error(`Sem dados calculáveis para: ${empty.join(', ')}.`);
    const month=$('importMonth').value;const source=[state.reports.sales.file.name,state.reports.picking.file.name,state.reports.catalog.file.name].join(' | ');
    await api('import',{month,days_worked:days,source_file:source,areas});state.currentMonth=month;closeImport();await refreshMonths();$('monthFilter').value=month;await loadCurve();showToast('Curva ABC calculada e atualizada com sucesso.');
  }catch(e){$('importError').textContent=e.message;}finally{btn.textContent='Gerar e atualizar';updateImportReady();}
}

function setView(view){
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='abc'){$('abcView').classList.remove('hidden');$('placeholderView').classList.add('hidden');$('pageTitle').textContent='Curva ABC';$('pageSubtitle').textContent='Classificação mensal dos SKUs por participação de volume em Hectos.';}
  else {$('abcView').classList.add('hidden');$('placeholderView').classList.remove('hidden');const names={overview:'Visão geral',operation:'Operação',indicators:'Indicadores',routines:'Rotinas',people:'Pessoas',reports:'Relatórios'};$('pageTitle').textContent=names[view]||'Módulo';$('placeholderTitle').textContent=names[view]||'Módulo';$('pageSubtitle').textContent='Módulo em preparação.';}
  $('sidebar').classList.remove('open');
}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('loginButton');$('loginError').textContent='';btn.disabled=true;btn.textContent='Entrando...';try{const d=await api('login',{username:$('loginUser').value,password:$('loginPassword').value},false);state.token=d.token;localStorage.setItem('pa_session',state.token);setLoggedIn(d.user);await refreshMonths();await loadCurve();}catch(err){$('loginError').textContent=err.message;}finally{btn.disabled=false;btn.textContent='Entrar';}});
$('togglePassword').onclick=()=>{$('loginPassword').type=$('loginPassword').type==='password'?'text':'password'};
$('logoutButton').onclick=async()=>{try{await api('logout')}catch{}logoutLocal()};
$('monthFilter').onchange=e=>{state.currentMonth=e.target.value;renderMonths();loadCurve()};$('areaFilter').onchange=e=>{state.currentArea=e.target.value;loadCurve()};
$('skuSearch').oninput=renderTable;$('classFilter').onchange=renderTable;$('importButton').onclick=openImport;$('closeImport').onclick=closeImport;$('cancelImport').onclick=closeImport;$('confirmImport').onclick=submitImport;$('menuButton').onclick=()=>$('sidebar').classList.toggle('open');document.querySelectorAll('.nav-link').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('reportSales').onchange=e=>{if(e.target.files[0])handleReport('sales',e.target.files[0])};
$('reportPicking').onchange=e=>{if(e.target.files[0])handleReport('picking',e.target.files[0])};
$('reportCatalog').onchange=e=>{if(e.target.files[0])handleReport('catalog',e.target.files[0])};
$('reportMarketplace').onchange=e=>{if(e.target.files[0])handleReport('marketplace',e.target.files[0])};

(async function init(){
  renderMonths();renderAreaCards();
  if(!state.token)return;
  try{const d=await api('session');setLoggedIn(d.user);await refreshMonths();await loadCurve();}catch{logoutLocal();}
})();
