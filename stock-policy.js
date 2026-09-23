(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const S={versions:[],versionId:'',data:null,query:''};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const dt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const statusLabel=s=>({approved:'Vigente',draft:'Em preparação',superseded:'Encerrada'})[s]||s||'—';
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
      const list=await call('policy_list');S.versions=list.versions||[];
      if(!S.versionId){
        const today=new Date().toISOString().slice(0,10);
        S.versionId=S.versions.find(x=>x.status==='approved'&&x.effective_start<=today&&x.effective_end>=today)?.id||S.versions.find(x=>x.status==='approved')?.id||S.versions[0]?.id||'';
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
    if(x.avg_daily_qty>0&&x.max_days!=null){
      const eff=nf.format(x.max_days)+' dias';
      const base=x.base_max_days!=null&&Math.abs(Number(x.max_days)-Number(x.base_max_days))>.15?'base '+nf.format(x.base_max_days)+'d + piso 1 PLT':'';
      return level(eff,x.max_qty,x.max_hl,unit,base);
    }
    return level('Piso 1 PLT',x.max_qty,x.max_hl,unit,'sem venda histórica');
  }
  function render(){
    const root=view();if(!root)return;const d=S.data;
    if(!d?.version){root.innerHTML='<div class="policy-empty"><strong>Nenhuma Política de Estoque cadastrada.</strong></div>';return;}
    const v=d.version,rows=filtered(),baseMax=d.items?.find(x=>x.base_max_days!=null)?.base_max_days;
    root.innerHTML='<div class="policy-v4">'+
      '<section class="policy-head"><div><div class="policy-titleline"><strong>'+esc(v.code)+'</strong><span class="policy-state '+esc(v.status)+'">'+esc(statusLabel(v.status))+'</span></div><small>Base '+dt(v.review_start)+' a '+dt(v.review_end)+' · Vigência '+dt(v.effective_start)+' a '+dt(v.effective_end)+'</small></div><label>Versão<select id="policyVersion">'+S.versions.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===v.id?'selected':'')+'>'+esc(x.code)+' · '+esc(statusLabel(x.status))+'</option>').join('')+'</select></label></section>'+
      '<section class="policy-rules"><div><small>Mínimo</small><strong>3 dias</strong><span>estoque de segurança</span></div><div><small>Objetivo</small><strong>5 dias</strong><span>ponto de puxada D+2</span></div><div><small>Máximo base</small><strong>'+esc(baseMax==null?'—':nf.format(baseMax)+' dias')+'</strong><span>com piso operacional de 1 pallet</span></div><div><small>SKUs</small><strong>'+d.items.length+'</strong><span>todos com política</span></div></section>'+
      '<section class="policy-tools"><input id="policySearch" value="'+esc(S.query)+'" placeholder="Buscar SKU ou produto"><span>'+rows.length+' SKUs</span></section>'+
      '<section class="policy-table"><table><thead><tr><th>SKU</th><th>Produto</th><th>Unidade</th><th>Venda média / dia</th><th>Mínimo</th><th>Objetivo</th><th>Máximo</th></tr></thead><tbody>'+
      (rows.length?rows.map(x=>'<tr><td><strong>'+esc(x.sku_code)+'</strong></td><td>'+esc(x.sku_name||'')+'</td><td>'+esc(x.unit_code||'—')+'</td><td><div class="policy-sales"><strong>'+esc(q(x.avg_daily_qty,x.unit_code||''))+'</strong><small>'+esc(hl(x.avg_daily_hl))+'/dia</small></div></td><td>'+level(nf.format(x.min_days||3)+' dias',x.min_qty,x.min_hl,x.unit_code||'')+'</td><td>'+level(nf.format(x.objective_days||5)+' dias',x.objective_qty,x.objective_hl,x.unit_code||'')+'</td><td>'+maxCell(x)+'</td></tr>').join(''):'<tr><td colspan="7" class="empty-row">Nenhum SKU encontrado.</td></tr>')+
      '</tbody></table></section>'+
      '<p class="policy-foot">Esta política fica congelada durante a vigência. O OOR diário apenas compara o disponível com o Mínimo e o Máximo definidos aqui.</p>'+
      '</div>';
    $('policyVersion').onchange=async e=>{S.versionId=e.target.value;await load();};
    $('policySearch').oninput=e=>{S.query=e.target.value;render();};
  }
  async function open(){
    const v=view();if(!v)return;document.querySelectorAll('main > .view').forEach(x=>x.classList.add('hidden'));document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));v.classList.remove('hidden');document.querySelector('[data-view="pull-policy"]')?.classList.add('active');document.querySelector('.pull-nav-group')?.classList.add('open');$('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='Política de Estoque';
    if($('pageSubtitle'))$('pageSubtitle').textContent='Política semestral fixa em dias, quantidade operacional e HL.';
    await load();
  }
  function install(){view();if(!$('stockPolicyCss')){const l=document.createElement('link');l.id='stockPolicyCss';l.rel='stylesheet';l.href='stock-policy.css?v=20260923-6';document.head.appendChild(l);}window.__stockPolicy={open,reload:load};}
  install();
})();