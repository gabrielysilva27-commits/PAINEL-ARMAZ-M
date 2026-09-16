export const AREAS=['Regulador','Marketplace','Câmara Fria'];
export const normalizeAddress=value=>String(value||'').trim().toUpperCase().replace(/^([A-Z]+)0+(\d)/,'$1$2');
export const keyOf=row=>`${row.area}:${normalizeAddress(row.address)}`;
export const dayDiff=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
export function validateSnapshot(input){
 if(!input||!Array.isArray(input.rows)||input.rows.length<1||input.rows.length>10000)throw new Error('Base de estoque vazia ou acima de 10.000 registros.');
 const ids=new Set();
 for(const r of input.rows){
  if(!r.id||ids.has(r.id))throw new Error('Identificador de registro duplicado.');ids.add(r.id);
  if(!AREAS.includes(r.area)||!String(r.address||'').trim())throw new Error('Área ou endereço inválido.');
  if(r.sku_code&&!/^\d+$/.test(String(r.sku_code)))throw new Error('Código de produto inválido na linha '+r.source_row);
  for(const k of ['received_on','expires_on'])if(r[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(r[k])||!Number.isFinite(Date.parse(r[k]))||new Date(r[k]+'T12:00:00Z').toISOString().slice(0,10)!==r[k]))throw new Error('Data inválida na linha '+r.source_row);
  if(r.pallets!=null&&(!Number.isFinite(r.pallets)||r.pallets<0))throw new Error('Quantidade inválida na linha '+r.source_row);
 }
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.as_of||''))throw new Error('Informe a data de referência do estoque.');
 return input;
}
export function enrich(snapshot,curves,today){
 const curveMap=new Map(curves.map(x=>[`${x.area}:${x.sku_code}`,x]));
 const rows=snapshot.rows.map(r=>({...r,curve:curveMap.get(`${r.area}:${r.sku_code}`)?.curve_class||null}));
 for(const r of rows){
  r.days=r.expires_on?dayDiff(r.expires_on,today):null;
  r.receipt_life=r.expires_on&&r.received_on?dayDiff(r.expires_on,r.received_on):null;
  const lock=String(r.lock||'').trim().toLowerCase();
  if(!r.sku_code)r.fefo_status='Vazio';
  else if(r.pallets===0)r.fefo_status='Sem saldo';
  else if(lock&&!['não','nao','n','0','liberado','false'].includes(lock))r.fefo_status='Trava-palete';
  else if(!r.expires_on)r.fefo_status='Sem validade';
  else if(r.days<0)r.fefo_status='Vencido';
  else if(r.days===0)r.fefo_status='Vence hoje';
  else if(r.receipt_life!==null&&r.receipt_life<0)r.fefo_status='Datas inconsistentes';
  else if(r.receipt_life!==null&&r.receipt_life<40)r.fefo_status='Solicitar devolução';
  else if(r.received_on&&r.received_on>today)r.fefo_status='Recebimento futuro';
  else r.fefo_status='Disponível';
 }
 const first=new Map();
 for(const r of rows.filter(x=>x.fefo_status==='Disponível')){const k=`${r.area}:${r.sku_code}`;if(!first.has(k)||r.expires_on<first.get(k))first.set(k,r.expires_on);}
 for(const r of rows)if(r.fefo_status==='Disponível')r.fefo_status=r.expires_on===first.get(`${r.area}:${r.sku_code}`)?'Prioridade FEFO':'Aguardar lote anterior';
 const groups=new Map();for(const r of rows){const k=keyOf(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 const locations=[...groups.entries()].map(([key,rs])=>{const occupied=rs.filter(r=>r.sku_code&&r.pallets!==0);const cls=[...new Set(occupied.map(r=>r.curve))];return {key,area:rs[0].area,address:rs[0].address,rows:rs,occupied:occupied.length>0,curve:cls.length===1?cls[0]:cls.length?'Mista':null,pallets:occupied.reduce((s,r)=>s+(r.pallets||0),0),unknown_pallets:occupied.filter(r=>r.pallets==null).length};});
 const adherence=AREAS.map(area=>{const target=snapshot.targets?.[area]||{planned:0,monitored:[]};const seen=new Set();const checks=[];for(const a of target.monitored||[]){const k=`${area}:${normalizeAddress(a.address)}`;if(seen.has(k))continue;seen.add(k);const loc=locations.find(l=>l.key===k);checks.push({address:a.address,curve:loc?.curve||null,status:!loc?.occupied?'Vazio':loc.curve==='A'?'Aderente':!loc.curve?'Sem curva':'Corrigir',rows:loc?.rows||[]});}const real=checks.filter(c=>c.status==='Aderente').length;return {area,planned:Number(target.planned)||0,real,rate:target.planned?real/target.planned:null,checks,monitored:checks.length};});
 return {rows,locations,adherence,today};
}
export function fefoRows(rows,sku,area){return rows.filter(r=>r.sku_code===sku&&(!area||r.area===area)).sort((a,b)=>{const ok=x=>['Prioridade FEFO','Aguardar lote anterior'].includes(x.fefo_status)?0:1;return ok(a)-ok(b)||(a.expires_on||'9999').localeCompare(b.expires_on||'9999')||(a.received_on||'9999').localeCompare(b.received_on||'9999')||a.address.localeCompare(b.address,'pt-BR',{numeric:true});});}
