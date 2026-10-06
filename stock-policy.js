(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const S={versions:[],versionId:'',data:null,query:'',screen:'policy'};
  const CAPACITY=[{"area":"300","family":"Retornável","pallets":957,"boxes":85860,"hl":5924.34},{"area":"600","family":"Retornável","pallets":200,"boxes":8400,"hl":604.8},{"area":"Litro","family":"Retornável","pallets":240,"boxes":12000,"hl":1440},{"area":"Palete de 1/2","family":"Retornável","pallets":6,"boxes":360,"hl":12.527999999999999},{"area":"PET 2L","family":"Descartável","pallets":516,"boxes":51600,"hl":6192},{"area":"473ml","family":"Descartável","pallets":252,"boxes":55440,"hl":3146.7744},{"area":"Long Neck","family":"Descartável","pallets":28,"boxes":2352,"hl":151.84512},{"area":"Prateleiras","family":"Descartável","pallets":228,"boxes":65208,"hl":2738.7360000000003},{"area":"Bloqueio","family":"Descartável","pallets":20,"boxes":5720,"hl":240.24},{"area":"Picking Retornável","family":"Retornável","pallets":91,"boxes":3822,"hl":275.18399999999997},{"area":"Picking Descartável","family":"Descartável","pallets":111,"boxes":31746,"hl":1333.332},{"area":"Stage (área curva C)","family":"Retornável","pallets":21,"boxes":1890,"hl":130.41000000000003},{"area":"Câmara Fria","family":"Retornável","pallets":13,"boxes":156,"hl":78},{"area":"Flow Rack","family":"Retornável","pallets":null,"boxes":432,"hl":27.889920000000004},{"area":"Marketplace prateleiras","family":"Descartável","pallets":null,"boxes":1152,"hl":103.67999999999999},{"area":"Marketplace chão","family":"Descartável","pallets":21,"boxes":18144,"hl":181.44}];
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const dt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const statusLabel=s=>({approved:'Vigente',draft:'Em preparação',superseded:'Encerrada'})[s]||s||'—';
  const versionLabel=v=>v.calculation_metadata?.cadence==='quarterly'?(v.calculation_metadata.readiness==='ready'?'Calculada':statusLabel(v.status)):v.status==='approved'?'Base do OOR':statusLabel(v.status);
  function view(){let v=$('stockPolicyView');if(v)return v;const main=document.querySelector('main');if(!main)return null;v=document.createElement('section');v.id='stockPolicyView';v.className='view hidden';main.appendChild(v);return v;}
  async function call(action,payload={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));if(!r.ok)throw new Error(d.error||'Falha na Política de Estoque');return d;
  }
  const q=(v,u)=>v==null?'—':nf.format(Number(v))+(u?' '+u:'');
  const hl=v=>v==null?'—':nf.format(Number(v))+' HL';
  function level(days,qty,hlv,unit,extra=''){
    return '<div class="policy-level"><strong>'+esc(days)+'</strong><span>'+esc(q(qty,unit))+'</span><small>'+esc(hl(hlv))+(extra?' · '+esc(extra):'')+'</small></div>';
  }
  async function load(){
    const root=view();if(!root)return;root.innerHTML='<div class="policy-loading">Carregando política…</div>';
    try{
      const list=await call('policy_list');S.versions=(list.versions||[]).filter(v=>v.calculation_metadata?.cadence==='quarterly');
      if(!S.versions.some(v=>v.id===S.versionId))S.versionId='';
      if(!S.versionId){
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        S.versionId=S.versions.find(x=>x.calculation_metadata?.cadence==='quarterly'&&x.effective_start<=today&&x.effective_end>=today)?.id||S.versions.find(x=>x.status==='approved'&&x.effective_start<=today&&x.effective_end>=today)?.id||S.versions.find(x=>x.status==='approved')?.id||S.versions[0]?.id||'';
      }
      S.data=S.versionId?await call('policy_get',{version_id:S.versionId}):null;render();
    }catch(e){root.innerHTML='<div class="policy-empty"><strong>Não foi possível carregar a Política de Estoque</strong><span>'+esc(e.message)+'</span></div>';}
  }
  function filtered(){
    const query=S.query.trim().toLowerCase();
    return (S.data?.items||[]).filter(x=>!query||String(x.sku_code).includes(query)||String(x.sku_name||'').toLowerCase().includes(query));
  }
  function maxCell(x){
    const unit=x.unit_code||'';
    if(x.avg_daily_qty==null)return level('Base pendente',null,null,unit);
    if(x.avg_daily_qty>0&&x.max_days!=null){
      return level(nf.format(x.max_days)+' dias',x.max_qty,x.max_hl,unit);
    }
    if(x.avg_daily_qty>0) return level('Pendente',null,null,unit);
    return level('Sem demanda',0,0,unit);
  }
  function quarterNavigation(v){
    const year=String(v.effective_start).slice(0,4);
    return '<section class="policy-quarters">'+S.versions.filter(x=>x.calculation_metadata?.cadence==='quarterly'&&String(x.effective_start).startsWith(year)).sort((a,b)=>a.code.localeCompare(b.code)).map(x=>'<button type="button" data-quarter="'+esc(x.id)+'" class="'+(x.id===v.id?'active':'')+'"><strong>'+esc(x.code)+'</strong><span>'+dt(x.effective_start)+' a '+dt(x.effective_end)+'</span><small>'+esc(versionLabel(x))+'</small></button>').join('')+'</section>';
  }
  function capacityTotals(){return CAPACITY.reduce((sum,row)=>({pallets:sum.pallets+(row.pallets||0),boxes:sum.boxes+row.boxes,hl:sum.hl+row.hl}),{pallets:0,boxes:0,hl:0});}
  function renderCapacity(root){
    const total=capacityTotals();
    root.innerHTML='<div class="policy-v4"><section class="policy-capacity-head"><button type="button" id="policyCapacityBack" class="policy-action">← Voltar à política</button><strong>Capacidade do estoque</strong></section>'+
      '<section class="policy-rules policy-capacity-totals"><div><small>Paletes</small><strong>'+nf.format(total.pallets)+'</strong></div><div><small>Caixas</small><strong>'+nf.format(total.boxes)+'</strong></div><div><small>HL</small><strong>'+nf.format(total.hl)+'</strong></div></section>'+
      '<section class="policy-table policy-capacity-table"><table><thead><tr><th>Área / tipo</th><th>Família</th><th>Paletes</th><th>Caixas</th><th>HL</th></tr></thead><tbody>'+CAPACITY.map(row=>'<tr><td>'+esc(row.area)+'</td><td>'+esc(row.family)+'</td><td>'+q(row.pallets)+'</td><td>'+q(row.boxes)+'</td><td>'+q(row.hl)+'</td></tr>').join('')+'</tbody></table></section></div>';
    $('policyCapacityBack').onclick=()=>{S.screen='policy';render();};
  }
  function render(){
    const root=view();if(!root)return;if(S.screen==='capacity'){renderCapacity(root);return;}const d=S.data;
    if(!d?.version){root.innerHTML='<div class="policy-empty"><strong>Nenhuma Política de Estoque cadastrada.</strong></div>';return;}
    const v=d.version,rows=filtered(),maxVals=d.items.filter(x=>x.max_days!=null&&x.max_days!=='').map(x=>Number(x.max_days)).filter(Number.isFinite),avgMax=maxVals.length?maxVals.reduce((a,b)=>a+b,0)/maxVals.length:null;
    const act=d.activity||null;
    const totalPolicySkus=act?.total_policy_count??d.items.length;
    root.innerHTML='<div class="policy-v4">'+quarterNavigation(v)+
      '<section class="policy-head"><div><div class="policy-titleline"><strong>'+esc(v.code)+'</strong><span class="policy-state '+esc(v.status)+'">'+esc(versionLabel(v))+'</span></div><small>Base '+dt(v.review_start)+' a '+dt(v.review_end)+' · Vigência '+dt(v.effective_start)+' a '+dt(v.effective_end)+'</small></div><label>Versão<select id="policyVersion">'+S.versions.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===v.id?'selected':'')+'>'+esc(x.code)+' · '+esc(versionLabel(x))+'</option>').join('')+'</select></label><button type="button" id="policyCapacityOpen" class="policy-action">Capacidade do estoque</button></section>'+
      '<section class="policy-rules"><div><small>Mínimo</small><strong>3 dias</strong></div><div><small>Objetivo</small><strong>5 dias</strong></div><div><small>Máximo médio</small><strong>'+esc(avgMax==null?'—':nf.format(avgMax)+' dias')+'</strong></div><div><small>SKUs na política</small><strong>'+nf.format(totalPolicySkus)+'</strong></div></section>'+
      '<section class="policy-tools"><input id="policySearch" value="'+esc(S.query)+'" placeholder="Buscar SKU ou produto"><span>'+rows.length+' SKUs</span></section>'+
      '<section class="policy-table"><table><thead><tr><th>SKU</th><th>Produto</th><th>Unidade</th><th>Venda média / dia</th><th>Mínimo</th><th>Objetivo</th><th>Máximo</th></tr></thead><tbody>'+
      (rows.length?rows.map(x=>'<tr><td><strong>'+esc(x.sku_code)+'</strong></td><td>'+esc(x.sku_name||'')+'</td><td>'+esc(x.unit_code||'—')+'</td><td><div class="policy-sales"><strong>'+esc(q(x.avg_daily_qty,x.unit_code||''))+'</strong><small>'+esc(hl(x.avg_daily_hl))+'/dia</small></div></td><td>'+level(nf.format(x.min_days||3)+' dias',x.min_qty,x.min_hl,x.unit_code||'')+'</td><td>'+level(nf.format(x.objective_days||5)+' dias',x.objective_qty,x.objective_hl,x.unit_code||'')+'</td><td>'+maxCell(x)+'</td></tr>').join(''):'<tr><td colspan="7" class="empty-row">Nenhum SKU encontrado.</td></tr>')+
      '</tbody></table></section>'+
      '</div>';
    $('policyCapacityOpen').onclick=()=>{S.screen='capacity';render();};
    $('policyVersion').onchange=async e=>{S.versionId=e.target.value;await load();};
    root.querySelectorAll('[data-quarter]').forEach(button=>button.onclick=async()=>{S.versionId=button.dataset.quarter;await load();});
    $('policySearch').oninput=e=>{S.query=e.target.value;render();};
  }
  async function open(){
    const v=view();if(!v)return;document.querySelectorAll('main > .view').forEach(x=>x.classList.add('hidden'));document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));v.classList.remove('hidden');document.querySelector('[data-view="pull-policy"]')?.classList.add('active');document.querySelector('.pull-nav-group')?.classList.add('open');$('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='Política de Estoque';
    if($('pageSubtitle'))$('pageSubtitle').textContent='';
    await load();
  }
  function install(){view();if(!$('stockPolicyCss')){const l=document.createElement('link');l.id='stockPolicyCss';l.rel='stylesheet';l.href='stock-policy.css?v=20261006-capacity-aligned';document.head.appendChild(l);}window.__stockPolicy={open,reload:load};}
  install();
})();
