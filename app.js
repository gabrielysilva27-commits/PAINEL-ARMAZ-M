const API_URL = 'https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/painel-api';
const MONTHS = [
  ['2026-01','Jan'],['2026-02','Fev'],['2026-03','Mar'],['2026-04','Abr'],['2026-05','Mai'],['2026-06','Jun'],['2026-07','Jul'],['2026-08','Ago'],['2026-09','Set']
];
const AREAS = ['Regulador','Picking','Câmara Fria','Marketplace'];

const state = { token: localStorage.getItem('pa_session') || '', user: null, months: [], currentMonth: '2026-06', currentArea: 'Regulador', currentItems: [], parsedImport: null };
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

function openImport(){ $('importModal').classList.remove('hidden');$('importMonth').value=state.currentMonth;const info=monthInfo(state.currentMonth);$('importDays').value=info?.days_worked||'';$('abcFile').value='';$('fileName').textContent='Arquivo .xlsx com as abas Regulador, Picking, Câmara Fria e Marketplace';$('importChecks').innerHTML='';$('importError').textContent='';$('confirmImport').disabled=true;state.parsedImport=null; }
function closeImport(){ $('importModal').classList.add('hidden'); }

function sheetRows(sheet, area){
  const raw=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null}); const rows=[];
  for(let i=1;i<raw.length;i++){const r=raw[i]; const code=r[0]; const hl=Number(r[3]); if(code==null||!Number.isFinite(hl)||hl<=0)continue;
    rows.push({sku_code:String(code).replace(/\.0$/,''),sku_name:String(r[1]??''),volume_caixas:Number(r[2])||0,volume_hl:hl,volume_pallets:area==='Regulador'&&r[4]!=null?Number(r[4]):null,source_row:i+1}); }
  return rows;
}

async function parseWorkbook(file){
  const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const areas={}; const checks=[];
  for(const area of AREAS){const sh=wb.Sheets[area]; if(!sh){checks.push({area,ok:false,count:0});areas[area]=[];continue;} const rows=sheetRows(sh,area);areas[area]=rows;checks.push({area,ok:rows.length>0,count:rows.length});}
  let days=null; const reg=wb.Sheets['Regulador']; if(reg){const cell=reg['M2']; if(cell&&Number(cell.v)>0)days=Math.round(Number(cell.v));}
  return {areas,checks,days};
}

async function handleFile(file){
  $('importError').textContent=''; try{const parsed=await parseWorkbook(file);state.parsedImport=parsed;$('fileName').textContent=file.name;if(parsed.days&&!$('importDays').value)$('importDays').value=parsed.days;
    $('importChecks').innerHTML=parsed.checks.map(c=>`<div class="check-item ${c.ok?'':'bad'}">${c.ok?'✓':'!'} ${c.area}: ${c.ok?c.count+' SKUs':'aba/dados não encontrados'}</div>`).join('');$('confirmImport').disabled=!parsed.checks.every(c=>c.ok);
  }catch(e){state.parsedImport=null;$('importError').textContent='Não foi possível ler a planilha: '+e.message;$('confirmImport').disabled=true;}
}

async function submitImport(){
  if(!state.parsedImport)return; const days=Number($('importDays').value),month=$('importMonth').value,file=$('abcFile').files[0]; if(!Number.isInteger(days)||days<=0){$('importError').textContent='Informe a quantidade de dias trabalhados.';return;}
  const btn=$('confirmImport');btn.disabled=true;btn.textContent='Importando...'; try{await api('import',{month,days_worked:days,source_file:file?.name||'',areas:state.parsedImport.areas});state.currentMonth=month;closeImport();await refreshMonths();$('monthFilter').value=month;await loadCurve();showToast('Curva ABC atualizada com sucesso.');}catch(e){$('importError').textContent=e.message;}finally{btn.textContent='Importar e recalcular';btn.disabled=false;}
}

function setView(view){
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='abc'){$('abcView').classList.remove('hidden');$('placeholderView').classList.add('hidden');$('pageTitle').textContent='Curva ABC';$('pageSubtitle').textContent='Classificação mensal dos SKUs por participação de volume em Hectos.';}
  else {$('abcView').classList.add('hidden');$('placeholderView').classList.remove('hidden');const names={overview:'Visão geral',operation:'Operação',indicators:'Indicadores',routines:'Rotinas',people:'Pessoas',reports:'Relatórios'};$('pageTitle').textContent=names[view]||'Módulo';$('placeholderTitle').textContent=names[view]||'Módulo';$('pageSubtitle').textContent='Módulo em preparação.';}
  $('sidebar').classList.remove('open');
}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('loginButton');$('loginError').textContent='';btn.disabled=true;btn.textContent='Entrando...';try{const d=await api('login',{username:$('loginUser').value,password:$('loginPassword').value},false);state.token=d.token;localStorage.setItem('pa_session',state.token);setLoggedIn(d.user);await refreshMonths();renderMonths();await loadCurve();}catch(err){$('loginError').textContent=err.message;}finally{btn.disabled=false;btn.textContent='Entrar';}});
$('togglePassword').onclick=()=>{$('loginPassword').type=$('loginPassword').type==='password'?'text':'password'};
$('logoutButton').onclick=async()=>{try{await api('logout')}catch{}logoutLocal()};
$('monthFilter').onchange=e=>{state.currentMonth=e.target.value;renderMonths();loadCurve()};$('areaFilter').onchange=e=>{state.currentArea=e.target.value;loadCurve()};
$('skuSearch').oninput=renderTable;$('classFilter').onchange=renderTable;$('importButton').onclick=openImport;$('closeImport').onclick=closeImport;$('cancelImport').onclick=closeImport;$('abcFile').onchange=e=>{if(e.target.files[0])handleFile(e.target.files[0])};$('confirmImport').onclick=submitImport;$('menuButton').onclick=()=>$('sidebar').classList.toggle('open');document.querySelectorAll('.nav-link').forEach(b=>b.onclick=()=>setView(b.dataset.view));

(async function init(){
  renderMonths();renderAreaCards();
  if(!state.token)return;
  try{const d=await api('session');setLoggedIn(d.user);await refreshMonths();await loadCurve();}catch{logoutLocal();}
})();
