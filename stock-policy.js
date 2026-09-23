(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const S={versions:[],versionId:'',data:null,query:''};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const dt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const canAdmin=()=>String(window.state?.user?.role||'').toLowerCase()==='admin';
  const toast=(m,e=false)=>window.showToast?.(m,e);

  function view(){
    let v=$('stockPolicyView');
    if(v)return v;
    const main=document.querySelector('main');
    if(!main)return null;
    v=document.createElement('section');v.id='stockPolicyView';v.className='view hidden';main.appendChild(v);return v;
  }

  async function call(action,payload={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Falha na Política de Estoque');
    return d;
  }

  const statusLabel=s=>({approved:'Vigente',draft:'Em preparação',superseded:'Encerrada'})[s]||s||'—';

  async function load(){
    const root=view();if(!root)return;
    root.innerHTML='<div class="policy-loading">Carregando política…</div>';
    try{
      const list=await call('policy_list');S.versions=list.versions||[];
      if(!S.versionId){
        const today=new Date().toISOString().slice(0,10);
        S.versionId=S.versions.find(x=>x.status==='approved'&&x.effective_start<=today&&x.effective_end>=today)?.id
          ||S.versions.find(x=>x.status==='approved')?.id||S.versions[0]?.id||'';
      }
      S.data=S.versionId?await call('policy_get',{version_id:S.versionId}):null;
      render();
    }catch(e){root.innerHTML='<div class="policy-empty"><strong>Não foi possível carregar a Política de Estoque</strong><span>'+esc(e.message)+'</span><button class="outline-button" data-retry>Tentar novamente</button></div>';root.querySelector('[data-retry]')?.addEventListener('click',load);}
  }

  function filtered(){
    const q=S.query.trim().toLowerCase();
    return (S.data?.items||[]).filter(x=>!q||String(x.sku_code).includes(q)||String(x.sku_name||'').toLowerCase().includes(q));
  }

  function render(){
    const root=view();if(!root)return;
    const d=S.data;
    if(!d?.version){root.innerHTML='<div class="policy-empty"><strong>Nenhuma Política de Estoque cadastrada.</strong></div>';return;}
    const v=d.version,rows=filtered(),editable=v.status==='draft'&&canAdmin();
    root.innerHTML='<div class="policy-fixed">'+
      '<section class="policy-bar"><div><div class="policy-version"><strong>'+esc(v.code)+'</strong><span class="policy-state '+esc(v.status)+'">'+esc(statusLabel(v.status))+'</span></div><small>Base '+dt(v.review_start)+' a '+dt(v.review_end)+' · Vigência '+dt(v.effective_start)+' a '+dt(v.effective_end)+'</small></div>'+
      '<label>Versão<select id="policyVersion">'+S.versions.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===v.id?'selected':'')+'>'+esc(x.code)+' · '+esc(statusLabel(x.status))+'</option>').join('')+'</select></label></section>'+
      '<section class="policy-tools"><input id="policySearch" value="'+esc(S.query)+'" placeholder="Buscar SKU ou produto"><span>'+rows.length+' SKUs</span></section>'+
      '<section class="policy-table"><table><thead><tr><th>SKU</th><th>Produto</th><th>Unidade</th><th>OUT</th><th>OVER</th>'+(editable?'<th></th>':'')+'</tr></thead><tbody>'+
      (rows.length?rows.map(x=>'<tr><td><strong>'+esc(x.sku_code)+'</strong></td><td>'+esc(x.sku_name||'')+'</td><td>'+esc(x.unit_code||'—')+'</td><td class="limit out">'+(x.out_qty==null?'—':nf.format(x.out_qty))+'</td><td class="limit over">'+(x.over_qty==null?'—':nf.format(x.over_qty))+'</td>'+(editable?'<td><button class="policy-edit" data-edit="'+esc(x.sku_code)+'">Editar</button></td>':'')+'</tr>').join(''):'<tr><td colspan="6" class="empty-row">Nenhum SKU encontrado.</td></tr>')+
      '</tbody></table></section>'+
      '<p class="policy-foot">A política é fixa durante a vigência. O OOR diário apenas compara o disponível com estes limites.</p>'+
      '</div>';
    $('policyVersion').onchange=async e=>{S.versionId=e.target.value;await load();};
    $('policySearch').oninput=e=>{S.query=e.target.value;render();};
    root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(b.dataset.edit));
  }

  function edit(code){
    const x=S.data?.items?.find(i=>String(i.sku_code)===String(code));if(!x)return;
    $('policyDialog')?.remove();
    const d=document.createElement('dialog');d.id='policyDialog';d.className='policy-dialog';
    d.innerHTML='<form method="dialog" class="policy-dialog-card"><header><div><small>'+esc(x.sku_code)+'</small><h3>'+esc(x.sku_name||'')+'</h3></div><button value="cancel">×</button></header><div class="policy-edit-grid"><label>OUT<input name="out" type="number" min="0" step="0.01" value="'+esc(x.out_qty??'')+'"></label><label>OVER<input name="over" type="number" min="0" step="0.01" value="'+esc(x.over_qty??'')+'"></label></div><label class="policy-note">Justificativa<textarea name="note" rows="3">'+esc(x.review_note||'')+'</textarea></label><p data-error></p><footer><button class="outline-button" value="cancel">Cancelar</button><button class="primary-button" type="button" data-save>Salvar</button></footer></form>';
    document.body.appendChild(d);
    d.querySelector('[data-save]').onclick=async()=>{
      const out=Number(d.querySelector('[name="out"]').value),over=Number(d.querySelector('[name="over"]').value),note=d.querySelector('[name="note"]').value;
      try{await call('policy_edit',{version_id:S.data.version.id,sku_code:code,out_qty:out,over_qty:over,review_note:note});d.close();toast('Limites atualizados.');await load();}catch(e){d.querySelector('[data-error]').textContent=e.message;}
    };
    d.showModal();
  }

  async function open(){
    const v=view();if(!v)return;
    document.querySelectorAll('main > .view').forEach(x=>x.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
    v.classList.remove('hidden');document.querySelector('[data-view="pull-policy"]')?.classList.add('active');document.querySelector('.pull-nav-group')?.classList.add('open');$('sidebar')?.classList.remove('open');
    if($('pageTitle'))$('pageTitle').textContent='Política de Estoque';
    if($('pageSubtitle'))$('pageSubtitle').textContent='Limites fixos semestrais de OUT e OVER.';
    await load();
  }

  function install(){
    view();
    if(!$('stockPolicyCss')){const l=document.createElement('link');l.id='stockPolicyCss';l.rel='stylesheet';l.href='stock-policy.css?v=20260923-4';document.head.appendChild(l);}
    window.__stockPolicy={open,reload:load};
  }
  install();
})();