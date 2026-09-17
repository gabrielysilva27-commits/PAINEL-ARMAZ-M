(() => {
  const API='https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/stock-api';
  const SAMPLE=['11191','9084','9071','12948','37144','18341','31207','18267','7977','7703'];
  const U={data:null,month:null,codes:[...SAMPLE],area:'Regulador',stockArea:'',stockQuery:'',busy:false};
  let core=null;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const dt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  const canEdit=()=>['admin','conferente'].includes(String(window.state?.user?.role||'').toLowerCase());
  const areaName=a=>a==='Regulador'?'Estoque geral':a;
  const toast=(m,e=false)=>window.showToast?.(m,e);
  const table=(heads,rows,cls='')=>`<div class="stock-table-wrap ${cls}"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${Array.isArray(rows)?rows.join(''):String(rows||'')}</tbody></table></div>`;

  async function call(action,payload={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-session-token':window.state?.token||''},body:JSON.stringify({action,...payload})});
    const d=await r.json().catch(()=>({error:'Resposta inválida'}));
    if(!r.ok)throw new Error(d.error||'Falha ao consultar estoque');
    return d;
  }
  async function load(force=false){
    const month=window.state?.currentMonth||'2026-06';
    if(!force&&U.data&&U.month===month)return U.data;
    U.data=await call('get',{month}); U.month=month; return U.data;
  }
  const meta=()=>U.data?.snapshot?`Base ${dt(U.data.snapshot.as_of)} · Curva ABC ${String(U.month).split('-').reverse().join('/')}`:'Nenhuma base importada';
  function dialog(title,body){
    $('stockEnhanceDialog')?.remove();
    const d=document.createElement('dialog'); d.id='stockEnhanceDialog'; d.className='stock-dialog';
    d.innerHTML=`<div class="stock-heading"><h2>${esc(title)}</h2><button class="outline-button" data-close>Fechar</button></div>${body}<p class="stock-error" data-error></p>`;
    document.body.appendChild(d); d.querySelector('[data-close]').onclick=()=>d.close(); d.showModal(); return d;
  }

  function fefoSequence(code){
    if(!code||!U.data?.rows)return [];
    return core.fefoRows(U.data.rows,String(code),U.area)
      .filter(r=>['Prioridade FEFO','Aguardar lote anterior'].includes(r.fefo_status)&&Number(r.pallets)!==0)
      .slice(0,8);
  }
  function readCodesFromGrid(root){
    return [...root.querySelectorAll('[data-rpl-code]')].map(i=>i.value.trim()).filter(Boolean).slice(0,50);
  }
  function buildReplenishmentRows(codes){
    return codes.map((code,i)=>{
      const seq=fefoSequence(code), all=code?core.fefoRows(U.data.rows,String(code),U.area):[], name=all[0]?.sku_name||'';
      const cells=Array.from({length:8},(_,j)=>{
        const r=seq[j];
        if(!r)return `<td class="rpl-address empty">—</td>`;
        const first=j===0;
        return `<td class="rpl-address ${first?'priority':''}" title="Validade ${esc(dt(r.expires_on))} · ${r.pallets==null?'saldo não informado':esc(nf.format(r.pallets))+' PLT'}">
          <strong>${esc(r.address)}</strong>
          ${first&&canEdit()?`<button class="rpl-consume" data-rpl-consume="${esc(r.id)}">Consumir</button>`:''}
        </td>`;
      }).join('');
      return `<tr><td class="rpl-code"><input data-rpl-code value="${esc(code)}" inputmode="numeric" aria-label="Código ${i+1}"></td><td class="rpl-product">${code?esc(name||'Produto não localizado'):'—'}</td>${cells}</tr>`;
    });
  }
  async function renderReplenishment(force=false){
    const view=$('replenishmentView'); if(!view||view.classList.contains('hidden')||U.busy)return;
    U.busy=true;
    try{
      await load(force);
      let codes=U.codes.length?[...U.codes]:Array(10).fill('');
      if(codes.length<10)codes=[...codes,...Array(10-codes.length).fill('')];
      const rows=buildReplenishmentRows(codes);
      view.innerHTML=`<div class="stock-module rpl-sheet" data-rpl-v3>
        <div class="rpl-topline"><span>${esc(meta())}</span><div><button class="outline-button" data-rpl-paste>Colar lista</button><button class="outline-button" data-rpl-sample>Amostra da planilha</button><button class="outline-button" data-rpl-clear>Limpar</button><button class="primary-button" data-rpl-refresh>Atualizar sequência</button></div></div>
        <div class="rpl-area"><label>Origem <select data-rpl-area>${core.AREAS.map(a=>`<option ${a===U.area?'selected':''}>${esc(a)}</option>`).join('')}</select></label><span>Digite os códigos na primeira coluna. O sistema retorna, da esquerda para a direita, a ordem FEFO das ruas.</span></div>
        ${table(['CÓDIGO','PRODUTO','1° A SER CONSUMIDO','2° A SER CONSUMIDO','3° A SER CONSUMIDO','4° A SER CONSUMIDO','5° A SER CONSUMIDO','6° A SER CONSUMIDO','7° A SER CONSUMIDO','8° A SER CONSUMIDO'],rows,'rpl-grid')}
        <div class="rpl-note"><strong>Leitura rápida:</strong> a primeira rua destacada é a prioridade atual. As demais aparecem apenas como sequência futura. Clique em <b>Consumir</b> somente quando o palete daquela rua tiver sido utilizado.</div>
      </div>`;
      const root=view.querySelector('[data-rpl-v3]');
      root.querySelector('[data-rpl-area]').onchange=e=>{U.area=e.target.value;U.codes=readCodesFromGrid(root);renderReplenishment(true);};
      root.querySelector('[data-rpl-sample]').onclick=()=>{U.codes=[...SAMPLE];renderReplenishment(false);};
      root.querySelector('[data-rpl-clear]').onclick=()=>{U.codes=[];renderReplenishment(false);};
      root.querySelector('[data-rpl-refresh]').onclick=()=>{U.codes=readCodesFromGrid(root);renderReplenishment(false);};
      root.querySelector('[data-rpl-paste]').onclick=()=>openPaste();
      root.querySelectorAll('[data-rpl-code]').forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter'){U.codes=readCodesFromGrid(root);renderReplenishment(false);}}));
      root.querySelectorAll('[data-rpl-consume]').forEach(b=>b.onclick=()=>openConsume(b.dataset.rplConsume));
    }catch(err){view.innerHTML=`<p class="stock-error">${esc(err.message)}</p>`;}finally{U.busy=false;}
  }
  function openPaste(){
    const d=dialog('Colar lista de produtos',`<p>Cole os códigos separados por linha, espaço, vírgula ou ponto e vírgula.</p><textarea class="rpl-paste-box" rows="8" placeholder="11191\n9084\n9071">${esc(U.codes.join('\n'))}</textarea><button class="primary-button" data-apply-list>Aplicar lista</button>`);
    d.querySelector('[data-apply-list]').onclick=()=>{
      U.codes=[...new Set(d.querySelector('textarea').value.split(/[\s,;|]+/).map(x=>x.trim()).filter(x=>/^\d+$/.test(x)))].slice(0,50);
      d.close(); renderReplenishment(false);
    };
  }
  async function openConsume(id){
    const row=U.data?.rows?.find(r=>String(r.id)===String(id)); if(!row||!canEdit())return;
    if(row.fefo_status!=='Prioridade FEFO'){toast('Este lote não é mais a prioridade FEFO. Atualize a sequência.',true);return;}
    const current=Number(row.pallets); if(!Number.isFinite(current)||current<=0){toast('Saldo da posição não está informado.',true);return;}
    const d=dialog('Consumir palete',`<div class="consume-summary"><strong>${esc(row.sku_code)} · ${esc(row.sku_name)}</strong><span>Rua ${esc(row.address)} · validade ${dt(row.expires_on)}</span><b>Saldo atual: ${nf.format(current)} PLT</b></div>
      <form class="stock-form consume-form" data-consume-form>
        <label class="consume-choice"><input type="radio" name="mode" value="all" checked> Usou tudo desta posição</label>
        <label class="consume-choice"><input type="radio" name="mode" value="partial"> Sobrou saldo</label>
        <label>Quantidade utilizada (PLT)<input name="used" type="number" min="0.01" max="${current}" step="0.01" value="1" disabled></label>
        <label>Saldo restante<input name="remaining" value="0" disabled></label>
        <label class="consume-note">Observação<input name="note" placeholder="Opcional"></label>
        <button class="primary-button" type="submit">Confirmar consumo</button>
      </form>`);
    const f=d.querySelector('[data-consume-form]'), used=f.elements.used, rem=f.elements.remaining;
    const calc=()=>{const all=f.elements.mode.value==='all';used.disabled=all;const q=all?current:Number(used.value||0);rem.value=nf.format(Math.max(0,current-q));};
    f.querySelectorAll('[name=mode]').forEach(x=>x.onchange=calc); used.oninput=calc; calc();
    f.onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{
      const all=f.elements.mode.value==='all', qty=all?current:Number(used.value);
      if(!Number.isFinite(qty)||qty<=0||qty>current)throw new Error('Informe uma quantidade válida.');
      const result=await call('consume',{previous_id:U.data.snapshot.id,row_id:id,used:qty,note:f.elements.note.value||''});
      d.close(); await load(true); await renderReplenishment(false); toast(`Consumo registrado. Saldo restante: ${nf.format(result.remaining)} PLT.`);
    }catch(err){d.querySelector('[data-error]').textContent=err.message;}finally{btn.disabled=false;}};
  }

  function stockRows(){
    return (U.data?.rows||[]).filter(r=>r.source_sheet==='Base Ruas'&&(!U.stockArea||r.area===U.stockArea)&&(!U.stockQuery||norm([r.address,r.sku_code,r.sku_name,r.received_on,r.expires_on,r.lock,r.fefo_status,r.curve].join(' ')).includes(norm(U.stockQuery))));
  }
  async function renderStock(force=false){
    const view=$('stockBaseView'); if(!view||view.classList.contains('hidden')||U.busy)return;
    U.busy=true;
    try{
      const preserved=view.querySelector('.stock-actions'); if(preserved)preserved.remove();
      await load(force); const rows=stockRows(), occupied=rows.filter(r=>r.sku_code), history=await call('history',{limit:50}).catch(()=>({items:[]}));
      const trs=rows.map(r=>`<tr><td><strong>${esc(r.address)}</strong><small>${esc(areaName(r.area))}</small></td><td>${esc(r.sku_code||'')}</td><td class="stock-product">${esc(r.sku_name||'')}</td><td>${esc(r.curve||'—')}</td><td>${dt(r.received_on)}</td><td>${dt(r.expires_on)}</td><td>${r.days??'—'}</td><td>${r.pallets==null?'—':nf.format(r.pallets)}</td><td>${esc(r.fefo_status||'')}</td><td>${esc(r.lock||'')}</td><td>${canEdit()?`<button class="stock-link" data-base-edit="${esc(r.id)}">Editar</button>`:''}</td></tr>`);
      view.innerHTML=`<div class="stock-module" data-stock-v3><div class="stock-base-top"><span>${esc(meta())} · ${rows.length} linhas exibidas</span><div data-stock-actions class="stock-actions"></div></div>
        <div class="stock-toolbar"><label>Área<select data-base-area><option value="">Todas</option><option value="Regulador" ${U.stockArea==='Regulador'?'selected':''}>Estoque geral</option><option value="Marketplace" ${U.stockArea==='Marketplace'?'selected':''}>Marketplace</option></select></label><label class="stock-search">Pesquisar<input data-base-search value="${esc(U.stockQuery)}" placeholder="Rua, código, produto, validade, status..."></label></div>
        <div class="stock-kpis"><article><small>Linhas da Base Ruas</small><strong>${rows.length}</strong></article><article><small>Com produto</small><strong>${occupied.length}</strong></article><article><small>Sem validade</small><strong>${occupied.filter(r=>!r.expires_on).length}</strong></article><article><small>Paletes informados</small><strong>${nf.format(occupied.reduce((s,r)=>s+(Number(r.pallets)||0),0))}</strong></article></div>
        ${table(['RUA','CÓDIGO','PRODUTO','CURVA','RECEBIMENTO','VALIDADE','DIAS','QTD (PLT)','STATUS','TRAVA-PALETE',''],trs,'base-ruas-table')}
        <details class="panel stock-method"><summary>Histórico de alterações por usuário</summary><div class="stock-audit-list">${history.items.length?history.items.map(h=>{const u=h.app_users?.display_name||h.app_users?.username||'Usuário';const ac=h.action==='IMPORT'?'Importação':h.action==='BULK_EDIT'?'Edição em lote':h.action==='CONSUME'?'Consumo':'Edição';return `<div class="stock-audit-row"><strong>${esc(u)}</strong><span>${esc(ac)} · ${h.changed_count} registro(s)</span><small>${new Date(h.created_at).toLocaleString('pt-BR')} · ${esc(h.note||'')}</small></div>`;}).join(''):'<p class="stock-empty">Nenhuma alteração registrada.</p>'}</div></details></div>`;
      if(preserved)view.querySelector('[data-stock-actions]').appendChild(preserved);
      const root=view.querySelector('[data-stock-v3]'); root.querySelector('[data-base-area]').onchange=e=>{U.stockArea=e.target.value;renderStock(false);};
      let timer; root.querySelector('[data-base-search]').oninput=e=>{U.stockQuery=e.target.value;clearTimeout(timer);timer=setTimeout(()=>renderStock(false),120);};
      root.querySelectorAll('[data-base-edit]').forEach(b=>b.onclick=()=>openEdit(b.dataset.baseEdit));
    }catch(err){view.innerHTML=`<p class="stock-error">${esc(err.message)}</p>`;}finally{U.busy=false;}
  }
  async function openEdit(id){
    const row=U.data?.rows?.find(r=>String(r.id)===String(id));if(!row||!canEdit())return;
    const d=dialog('Atualizar Base Ruas',`<p><strong>${esc(row.address)}</strong> · ${esc(areaName(row.area))}</p><form class="stock-form" data-edit-form>
      <label>Código<input name="sku_code" value="${esc(row.sku_code||'')}" pattern="[0-9]*"></label><label>Produto<input name="sku_name" value="${esc(row.sku_name||'')}"></label><label>Recebimento<input name="received_on" type="date" value="${esc(row.received_on||'')}"></label><label>Validade<input name="expires_on" type="date" value="${esc(row.expires_on||'')}"></label><label>Quantidade (PLT)<input name="pallets" type="number" min="0" step="0.01" value="${row.pallets??''}"></label><label>Trava-palete<input name="lock" value="${esc(row.lock||'')}"></label><label class="consume-note">Observação<input name="note" placeholder="Ex.: conferência física"></label><button class="primary-button" type="submit">Salvar alteração</button></form>`);
    const f=d.querySelector('[data-edit-form]');f.onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{const v=Object.fromEntries(new FormData(f));await call('edit_row',{previous_id:U.data.snapshot.id,row_id:id,patch:{sku_code:v.sku_code||null,sku_name:v.sku_name||'',received_on:v.received_on||null,expires_on:v.expires_on||null,pallets:v.pallets===''?null:Number(v.pallets),lock:v.lock||'',inventory_confirmed:true},note:v.note||`Atualização ${row.address}`});d.close();await load(true);await renderStock(false);toast('Base Ruas atualizada e alteração registrada.');}catch(err){d.querySelector('[data-error]').textContent=err.message;}finally{btn.disabled=false;}};
  }

  function wireObservers(){
    const rep=$('replenishmentView'), stock=$('stockBaseView'); if(!rep||!stock)return false;
    const obsRep=new MutationObserver(()=>{if(!rep.classList.contains('hidden')&&!rep.querySelector('[data-rpl-v3]'))setTimeout(()=>renderReplenishment(false),0);});
    const obsStock=new MutationObserver(()=>{if(!stock.classList.contains('hidden')&&!stock.querySelector('[data-stock-v3]'))setTimeout(()=>renderStock(false),0);});
    obsRep.observe(rep,{childList:true,subtree:false,attributes:true,attributeFilter:['class']}); obsStock.observe(stock,{childList:true,subtree:false,attributes:true,attributeFilter:['class']});
    document.querySelector('[data-view="replenishment"]')?.addEventListener('click',()=>setTimeout(()=>renderReplenishment(false),0));
    document.querySelector('[data-view="stock-base"]')?.addEventListener('click',()=>setTimeout(()=>renderStock(false),0));
    return true;
  }
  async function boot(){
    if(!window.state||!window.__stockModule||!$('replenishmentView')||!$('stockBaseView'))return setTimeout(boot,120);
    core=await import('./stock-core.js?v=20260916-2');
    if(!$('stockEnhancementCss')){const l=document.createElement('link');l.id='stockEnhancementCss';l.rel='stylesheet';l.href='stock-enhancements.css?v=20260917-5';document.head.appendChild(l);}
    wireObservers();
    if(!$('replenishmentView').classList.contains('hidden'))renderReplenishment(true);
    if(!$('stockBaseView').classList.contains('hidden'))renderStock(true);
    window.__stockEnhancements={renderReplenishment,renderStock};
  }
  boot();
})();
