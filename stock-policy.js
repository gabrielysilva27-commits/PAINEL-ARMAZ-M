(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const P={data:null,versions:[],versionId:'',query:'',curve:'',qty:'',validity:'',loading:false};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const pct=v=>nf.format((Number(v)||0)*100)+'%';
  const dt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const canAdmin=()=>String(window.state?.user?.role||'').toLowerCase()==='admin';
  const toast=(m,e=false)=>window.showToast?.(m,e);
  function policyView(){
    let view=$('stockPolicyView');
    if(view)return view;
    const main=document.querySelector('main');
    if(!main)return null;
    view=document.createElement('section');
    view.id='stockPolicyView';
    view.className='view hidden';
    main.appendChild(view);
    return view;
  }
  async function call(action,payload={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Falha na Política de Estoque');
    return d;
  }
  function tabs(){return '';}
  function currentRevision(){
    const now=new Date(), y=now.getFullYear(), m=now.getMonth()+1;
    if(m<=6)return {code:'R1/'+y,review_start:(y-1)+'-07-01',review_end:(y-1)+'-12-31',effective_start:y+'-01-01',effective_end:y+'-06-30'};
    return {code:'R2/'+y,review_start:y+'-01-01',review_end:y+'-06-30',effective_start:y+'-07-01',effective_end:y+'-12-31'};
  }
  function statusLabel(v){return ({draft:'Rascunho',approved:'Aprovada',superseded:'Substituída'})[v]||v||'—';}
  function qtyLabel(v){return ({OUT:'OUT','ABAIXO_DO_OBJETIVO':'Abaixo do objetivo',OK:'OK',OVER:'OVER','SEM_DADO':'Sem dado','SEM_POLITICA':'Sem política'})[v]||v||'—';}
  function validityLabel(v){return ({NORMAL:'Normal',ATENCAO:'Atenção ≤45d',CRITICO:'Crítico ≤30d',VENCIDO:'Vencido','SEM_VALIDADE':'Sem validade'})[v]||v||'—';}
  function cls(v){return String(v||'').toLowerCase().replace(/_/g,'-').replace(/[ãáàâ]/g,'a').replace(/[ç]/g,'c').replace(/[í]/g,'i');}
  function bindTabs(){ }
  async function loadVersions(){
    const d=await call('policy_list');P.versions=d.versions||[];
    if(!P.versionId)P.versionId=P.versions.find(x=>x.status==='approved')?.id||P.versions.find(x=>x.status==='draft')?.id||P.versions[0]?.id||'';
  }
  async function load(){
    P.loading=true;renderLoading();
    try{
      await loadVersions();
      P.data=P.versionId?await call('policy_get',{version_id:P.versionId}):null;
      render();
    }catch(e){renderError(e.message);}finally{P.loading=false;}
  }
  function renderLoading(){const v=policyView();if(!v)return;v.innerHTML=tabs('policy')+'<div class="policy-loading">Carregando Política de Estoque…</div>';bindTabs(v);}
  function renderError(msg){const v=policyView();if(!v)return;v.innerHTML=tabs('policy')+'<div class="policy-empty-card"><strong>Não foi possível carregar</strong><span>'+esc(msg)+'</span><button class="outline-button" data-retry>Tentar novamente</button></div>';bindTabs(v);v.querySelector('[data-retry]').onclick=load;}
  function filtered(){
    const items=P.data?.items||[],q=P.query.trim().toLowerCase();
    return items.filter(x=>(!q||String(x.sku_code).toLowerCase().includes(q)||String(x.sku_name||'').toLowerCase().includes(q))&&(!P.curve||x.curve_class===P.curve)&&(!P.qty||x.qty_status===P.qty)&&(!P.validity||x.validity_status===P.validity));
  }
  function kpis(items){
    const total=items.length;
    return '<section class="policy-kpis">'+
      '<article><small>SKUs</small><strong>'+total+'</strong></article>'+
      '<article class="danger"><small>OUT</small><strong>'+items.filter(x=>x.qty_status==='OUT').length+'</strong></article>'+
      '<article class="warn"><small>Abaixo objetivo</small><strong>'+items.filter(x=>x.qty_status==='ABAIXO_DO_OBJETIVO').length+'</strong></article>'+
      '<article class="over"><small>OVER</small><strong>'+items.filter(x=>x.qty_status==='OVER').length+'</strong></article>'+
      '<article class="critical"><small>Stock Age crítico</small><strong>'+items.filter(x=>['CRITICO','VENCIDO'].includes(x.validity_status)).length+'</strong></article>'+
    '</section>';
  }
  function tableRows(items){
    if(!items.length)return '<tr><td colspan="15" class="policy-empty">Nenhum SKU encontrado com os filtros selecionados.</td></tr>';
    return items.map(x=>{
      return '<tr>'+
        '<td><strong>'+esc(x.sku_code)+'</strong></td>'+
        '<td class="policy-product"><strong>'+esc(x.sku_name||'')+'</strong></td>'+
        '<td><span class="policy-badge curve-'+String(x.curve_class||'').toLowerCase()+'">'+esc(x.curve_class||'—')+'</span></td>'+
        '<td>'+nf.format(x.avg_daily_pallets||0)+'<small>PLT/dia</small></td>'+
        '<td><strong>3</strong><small>'+nf.format((x.avg_daily_pallets||0)*3)+' PLT</small></td>'+
        '<td><strong>'+nf.format(x.objective_days||0)+'</strong><small>'+nf.format((x.avg_daily_pallets||0)*(x.objective_days||0))+' PLT</small></td>'+
        '<td><strong>'+nf.format(x.max_days||0)+'</strong><small>'+nf.format((x.avg_daily_pallets||0)*(x.max_days||0))+' PLT</small></td>'+
        '<td>'+nf.format(x.current_pallets||0)+'<small>'+((x.current_days==null)?'—':nf.format(x.current_days)+' dias')+'</small></td>'+
        '<td><span class="policy-badge qty-'+cls(x.qty_status)+'">'+esc(qtyLabel(x.qty_status))+'</span></td>'+
        '<td>'+dt(x.oldest_expiry)+'<small>'+((x.days_to_expiry==null)?'—':x.days_to_expiry+' dias')+'</small></td>'+
        '<td><span class="policy-badge validity-'+cls(x.validity_status)+'">'+esc(validityLabel(x.validity_status))+'</span></td>'+
        '<td>'+(P.data.version.status==='draft'&&canAdmin()?'<button class="policy-edit" data-edit="'+esc(x.sku_code)+'">Editar</button>':'—')+'</td>'+
      '</tr>';
    }).join('');
  }
  function render(){
    const view=policyView();if(!view)return;
    if(!P.data){
      const r=currentRevision();
      view.innerHTML=tabs('policy')+'<div class="policy-empty-card"><strong>Nenhuma Política de Estoque criada.</strong><span>Crie '+esc(r.code)+' usando as vendas do período '+dt(r.review_start)+' a '+dt(r.review_end)+'. A regra operacional mantém o mínimo em 3 dias e o ponto objetivo inicial em 5 dias (D+2).</span>'+(canAdmin()?'<button class="primary-button" data-generate>Gerar '+esc(r.code)+'</button>':'')+'</div>';
      bindTabs(view);view.querySelector('[data-generate]')?.addEventListener('click',generateCurrent);return;
    }
    const v=P.data.version,items=P.data.items||[],show=filtered();
    view.innerHTML=tabs('policy')+'<div class="stock-policy">'+
      '<section class="policy-head"><div class="policy-version-line"><strong>'+esc(v.code)+'</strong><span class="policy-badge version-'+esc(v.status)+'">'+esc(statusLabel(v.status))+'</span><small>Vigência '+dt(v.effective_start)+' a '+dt(v.effective_end)+'</small></div><div class="policy-head-actions"><label>Versão<select id="policyVersion">'+P.versions.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===v.id?'selected':'')+'>'+esc(x.code)+'</option>').join('')+'</select></label>'+(v.status==='draft'&&canAdmin()?'<button class="primary-button" data-approve>Aprovar política</button>':'')+'</div></section>'+
      kpis(items)+
      '<div class="policy-toolbar"><div class="policy-filters"><input id="policySearch" placeholder="Buscar SKU ou descrição" value="'+esc(P.query)+'"><select id="policyCurve"><option value="">Todas as curvas</option><option value="A" '+(P.curve==='A'?'selected':'')+'>A</option><option value="B" '+(P.curve==='B'?'selected':'')+'>B</option><option value="C" '+(P.curve==='C'?'selected':'')+'>C</option></select><select id="policyQty"><option value="">Todos os status</option><option value="OUT">OUT</option><option value="ABAIXO_DO_OBJETIVO">Abaixo do objetivo</option><option value="OK">OK</option><option value="OVER">OVER</option><option value="SEM_DADO">Sem dado</option></select><select id="policyValidity"><option value="">Toda validade</option><option value="NORMAL">Normal</option><option value="ATENCAO">Atenção ≤45d</option><option value="CRITICO">Crítico ≤30d</option><option value="VENCIDO">Vencido</option><option value="SEM_VALIDADE">Sem validade</option></select></div><span class="policy-result-count">'+show.length+' SKUs</span></div>'+
      '<section class="policy-table-card"><div class="policy-table-wrap"><table><thead><tr><th>SKU</th><th>Produto</th><th>Curva</th><th>Venda média</th><th>Mínimo</th><th>Objetivo</th><th>Máximo</th><th>Estoque atual</th><th>Status</th><th>Validade</th><th>Stock Age</th><th></th></tr></thead><tbody>'+tableRows(show)+'</tbody></table></div></section>'+
    '</div>';
    bindTabs(view);
    $('policyVersion').onchange=async e=>{P.versionId=e.target.value;await load();};
    $('policySearch').oninput=e=>{P.query=e.target.value;render();};
    $('policyCurve').onchange=e=>{P.curve=e.target.value;render();};
    $('policyQty').onchange=e=>{P.qty=e.target.value;render();};
    $('policyValidity').onchange=e=>{P.validity=e.target.value;render();};
    view.querySelector('[data-approve]')?.addEventListener('click',approve);
    view.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEdit(b.dataset.edit));
  }
  async function generateCurrent(){
    const r=currentRevision(),btn=document.querySelector('[data-generate]');if(btn){btn.disabled=true;btn.textContent='Gerando…';}
    try{const d=await call('policy_generate',r);P.versionId=d.version_id;toast(r.code+' gerada como rascunho.');await load();}catch(e){toast(e.message,true);if(btn){btn.disabled=false;btn.textContent='Gerar '+r.code;}}
  }
  function openEdit(code){
    const x=P.data?.items?.find(i=>String(i.sku_code)===String(code));if(!x)return;
    document.getElementById('policyDialog')?.remove();
    const d=document.createElement('dialog');d.id='policyDialog';d.className='policy-dialog';
    d.innerHTML='<div class="policy-dialog-card"><header><div><small>'+esc(x.sku_code)+'</small><h3>'+esc(x.sku_name)+'</h3></div><button type="button" data-close>×</button></header><p class="policy-rule-note">Mínimo bloqueado em 3 dias. Pela puxada D+2, o objetivo recomendado inicia em 5 dias.</p><div class="policy-edit-grid"><label>Mínimo (dias)<input value="3" disabled></label><label>Objetivo (dias)<input name="objective" type="number" min="3" step="0.5" value="'+esc(x.objective_days||5)+'"></label><label>Máximo (dias)<input name="max" type="number" min="3" step="0.5" value="'+esc(x.max_days||5)+'"></label></div><div class="policy-suggestion"><strong>Histórico</strong><small>'+esc(x.suggestion_basis||'Sem histórico')+'</small></div><label class="policy-note">Justificativa da revisão<textarea name="note" rows="3">'+esc(x.review_note||'')+'</textarea></label><p class="policy-dialog-error" data-error></p><footer><button class="outline-button" type="button" data-close>Cancelar</button><button class="primary-button" type="button" data-save>Salvar revisão</button></footer></div>';
    document.body.appendChild(d);d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());
    d.querySelector('[data-save]').onclick=async e=>{const btn=e.currentTarget,objective=Number(d.querySelector('[name="objective"]').value),max=Number(d.querySelector('[name="max"]').value),note=d.querySelector('[name="note"]').value;btn.disabled=true;try{await call('policy_edit',{version_id:P.data.version.id,sku_code:code,objective_days:objective,max_days:max,review_note:note});d.close();toast('Parâmetros atualizados.');await load();}catch(err){d.querySelector('[data-error]').textContent=err.message;btn.disabled=false;}};
    d.showModal();
  }
  async function approve(){
    if(!confirm('Aprovar esta Política de Estoque? Após a aprovação, ela passa a ser a versão vigente do período.'))return;
    try{await call('policy_approve',{version_id:P.data.version.id});toast('Política aprovada.');await load();}catch(e){toast(e.message,true);}
  }
  async function open(){
    const view=policyView();if(!view)return;
    document.querySelectorAll('main > .view').forEach(v=>v.classList.add('hidden'));document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));view.classList.remove('hidden');document.querySelector('[data-view="pull-policy"]')?.classList.add('active');document.querySelector('.pull-nav-group')?.classList.add('open');$('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='Política de Estoque';if($('pageSubtitle'))$('pageSubtitle').textContent='Revisão semestral de mínimo, objetivo, máximo, OOR e Stock Age.';
    await load();
  }
  function install(){
    policyView();
    if(!document.getElementById('stockPolicyCss')){const l=document.createElement('link');l.id='stockPolicyCss';l.rel='stylesheet';l.href='stock-policy.css?v=20260923-3';document.head.appendChild(l);}
    window.__stockPolicy={open,reload:load};
  }
  install();
})();