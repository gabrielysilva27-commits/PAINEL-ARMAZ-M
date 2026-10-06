import {ocpDay,ocpJob} from './ocp-source.mjs';
import {wmsDay} from './wms-adherence.mjs';
import {cycleTarget,cycleResult,frozenEvents} from './efc-cycle.mjs';
import {mergeEvents,sharedEvents} from './shared-031120.mjs';
import {createClient} from 'jsr:@supabase/supabase-js@2.57.4';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const H={'Access-Control-Allow-Origin':'https://painel-armaz-m.gabrielysilva27.workers.dev','Access-Control-Allow-Headers':'content-type,x-session-token,x-agent-token','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:H});
async function hash(t:string){const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)));return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function check(e:any){if(e)throw e;}
async function all(make:()=>any){const rows:any[]=[];for(let n=0;n<50000;n+=1000){const {data,error}=await make().range(n,n+999);check(error);rows.push(...data);if(data.length<1000)return rows;}throw Error('Limite de consulta excedido');}
async function agentNode(req:Request){const t=req.headers.get('x-agent-token');if(!t)return null;const {data,error}=await db.from('receiving_pull_agent_nodes').select('id').eq('token_hash',await hash(t)).eq('active',true).eq('slot_code','ADM').maybeSingle();check(error);return data;}
async function activeCycles(){
 const target=cycleTarget();const {data:latest,error}=await db.from('efc_night_cycles').select('reference_date').order('reference_date',{ascending:false}).limit(1).maybeSingle();check(error);
 const start=latest?.reference_date?new Date(Date.parse(latest.reference_date+'T12:00:00Z')+86400000).toISOString().slice(0,10):target;
 for(let date=start;date<=target;date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10)){const {error:ie}=await db.from('efc_night_cycles').upsert({reference_date:date,status:'waiting',started_at:date+'T00:00:00Z'},{onConflict:'reference_date',ignoreDuplicates:true});check(ie);}
 return all(()=>db.from('efc_night_cycles').select('*').in('status',['waiting','running']).order('reference_date'));
}
async function reconcileCycle(date:string){
 const {data:cycle,error}=await db.from('efc_night_cycles').select('*').eq('reference_date',date).maybeSingle();check(error);if(!cycle||!['waiting','running'].includes(cycle.status))return cycle;
 const {data:file,error:fe}=await db.from('efc_agent_map_files').select('*').eq('reference_date',date).maybeSingle();check(fe);if(!file)return cycle;
 const before=new Date(Date.parse(date+'T12:00:00Z')-2*86400000).toISOString().slice(0,10),next=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const records=await all(()=>db.from('report_031120_current').select('reference_date,headers,raw_values,source_file,completed_at').gte('reference_date',before).lt('reference_date',next).order('reference_date').order('row_no'));
 const result=cycleResult(date,file.rows,sharedEvents(records)),now=new Date().toISOString(),patch={...result,plans:file.rows,source_file:file.source_file,map_import_at:file.updated_at,report_import_at:records.map((r:any)=>r.completed_at).sort().at(-1)||null,updated_at:now,completed_at:result.status==='completed'?now:null};
 const {error:ue}=await db.from('efc_night_cycles').update(patch).eq('reference_date',date).in('status',['waiting','running']);check(ue);return{...cycle,...patch};
}
async function segmentationCycles(){
 const target=cycleTarget(),startDate='2026-10-06';
 const {data:latest,error}=await db.from('efc_segmentation_night_cycles').select('reference_date').order('reference_date',{ascending:false}).limit(1).maybeSingle();check(error);
 const start=latest?.reference_date?new Date(Date.parse(latest.reference_date+'T12:00:00Z')+86400000).toISOString().slice(0,10):startDate;
 for(let date=start;date<=target&&date<'2027-01-01';date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10)){const {error:ie}=await db.from('efc_segmentation_night_cycles').upsert({reference_date:date,status:'waiting'},{onConflict:'reference_date',ignoreDuplicates:true});check(ie);}
 const waiting=await all(()=>db.from('efc_segmentation_night_cycles').select('*').eq('status','waiting').order('reference_date'));
 const {data:scan,error:scanError}=await db.from('efc_segmentation_scans').select('updated_at,errors,last_error').order('updated_at',{ascending:false}).limit(1).maybeSingle();check(scanError);
 if(!scan||scan.last_error||scan.errors)return waiting;
 for(const cycle of waiting){
  const date=cycle.reference_date;
  const [file,emails]=await Promise.all([db.from('efc_agent_map_files').select('rows').eq('reference_date',date).maybeSingle(),all(()=>db.from('efc_segmentation_emails').select('*').eq('reference_date',date).order('received_at'))]);check(file.error);
  if(emails.some((m:any)=>m.updated_at>scan.updated_at))continue;
  const result=wmsDay(date,file.data?.rows||[],emails);
  if(result.rate!==null){const {error:ue}=await db.from('efc_segmentation_night_cycles').update({status:'completed',email_id:result.email_id,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('reference_date',date).eq('status','waiting');check(ue);cycle.status='completed';}
 }
 return waiting.filter(c=>c.status==='waiting');
}
async function ocpState(){
 const {data:config,error}=await db.from('efc_ocp_config').select('*').eq('id',1).single();check(error);if(!config.enabled)return{enabled:false};
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 const today=parts.year+'-'+parts.month+'-'+parts.day,yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10),target=Number(parts.hour)>=21?today:yesterday,through=config.backfill_through&&config.backfill_through>target?config.backfill_through:target;
 const [inventory,imports]=await Promise.all([all(()=>db.from('efc_ocp_inventory').select('*').lte('reference_date',through).order('reference_date')),all(()=>db.from('efc_ocp_imports').select('maps').eq('status','completed').order('completed_at'))]);
 const latest=new Map();for(const file of imports)for(const r of file.maps)latest.set(r.map,r);const available=[...latest.values()],days=[];
 for(const f of inventory){const result=ocpDay(f.rows,available),row={reference_date:f.reference_date,...result,completed_at:result.status==='completed'?new Date().toISOString():null,updated_at:new Date().toISOString()};days.push(row);}
 if(days.length){const {error:e}=await db.from('efc_ocp_days').upsert(days,{onConflict:'reference_date'});check(e);}
 const needsInventory=!config.last_inventory_date||config.last_inventory_date<through||!inventory.some(f=>f.reference_date===through);
 const pending=days.filter(d=>d.status!=='completed').length+(needsInventory?1:0);
 if(!pending&&config.backfill_through){const {error:e}=await db.from('efc_ocp_config').update({backfill_through:null}).eq('id',1);check(e);}
 return{enabled:true,pending,force_run:Boolean(config.backfill_through),inventory_through:through,job:ocpJob(inventory,days,through),days,start_hour:21,time_zone:'America/Sao_Paulo'};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return reply({ok:true});if(req.method==='GET')return reply({service:'efc-api',version:'2026-10-02-fleet-fixed-1'});if(req.method!=='POST')return reply({error:'Método inválido'},405);
 try{
 const b=await req.json();
 if(String(b.action||'').startsWith('agent_ocp_')){
  const node=await agentNode(req);if(!node)return reply({enabled:false,error:'Agente ADM necessário'},b.action==='agent_ocp_status'?200:403);
  if(b.action==='agent_ocp_status')return reply(await ocpState());
  if(b.action==='agent_ocp_inventory'){
   const date=String(b.date||'');if(!/^20[2-9]\d-\d{2}-\d{2}$/.test(date)||date<'2026-10-01'||!Array.isArray(b.rows)||b.rows.length>5000||!/^\d{1,12}$/.test(b.map_from)||!/^\d{1,12}$/.test(b.map_to)||Number(b.map_from)>Number(b.map_to)||String(b.source_file||'').length>500)return reply({error:'MAPAS OCP inválidos'},400);
   const rows=b.rows.map((r:any)=>{const map=String(r.map),plate=String(r.plate||'');if(!/^\d{1,12}$/.test(map)||!/^\w{5,12}$/.test(plate)||Number(map)<Number(b.map_from)||Number(map)>Number(b.map_to))throw Error('Mapa inválido');return{map,plate,eligible:r.eligible!==false};});
   const {error}=await db.from('efc_ocp_inventory').upsert({reference_date:date,source_file:String(b.source_file||''),signature:String(b.signature||'').slice(0,100),map_from:Number(b.map_from),map_to:Number(b.map_to),rows,updated_at:new Date().toISOString()});check(error);return reply({ok:true});
  }
  if(b.action==='agent_ocp_inventory_end'){if(!/^20[2-9]\d-\d{2}-\d{2}$/.test(b.date))return reply({error:'Data inválida'},400);const {error}=await db.from('efc_ocp_config').update({last_inventory_date:b.date}).eq('id',1);check(error);return reply({ok:true});}
  if(b.action==='agent_ocp_begin'){
   if(!/^[a-f0-9-]{36}$/.test(b.id)||!Array.isArray(b.headers)||b.headers.length!==34||!Number.isInteger(b.row_count)||b.row_count<1||b.row_count>200000||!/^\d{1,12}$/.test(b.map_from)||!/^\d{1,12}$/.test(b.map_to)||!Number.isSafeInteger(Number(b.map_from))||!Number.isSafeInteger(Number(b.map_to))||! /^[a-f0-9]{64}$/.test(b.sha256))return reply({error:'Importação OCP inválida'},400);
   const {error}=await db.from('efc_ocp_imports').insert({id:b.id,agent_node_id:node.id,headers:b.headers,row_count:b.row_count,sha256:b.sha256,source_file:String(b.source_file||'').slice(0,180),map_from:Number(b.map_from),map_to:Number(b.map_to)});check(error);return reply({ok:true});
  }
  const id=String(b.id||'');if(b.action==='agent_ocp_error'){
   const error=String(b.error||'Falha OCP').slice(0,400);const {error:e}=await db.from('efc_ocp_config').update({last_error:error,last_scan_at:new Date().toISOString()}).eq('id',1);check(e);
   if(/^[a-f0-9-]{36}$/.test(id)){const {error:e}=await db.from('efc_ocp_imports').update({status:'failed',last_error:error}).eq('id',id).eq('agent_node_id',node.id).eq('status','staging');check(e);}return reply({ok:true});
  }
  const {data:run,error}=await db.from('efc_ocp_imports').select('*').eq('id',id).eq('agent_node_id',node.id).maybeSingle();check(error);if(!run)return reply({error:'Importação ausente'},404);
  if(b.action==='agent_ocp_rows'){
   if(run.status!=='staging'||!Number.isInteger(b.chunk)||b.chunk<0||!Array.isArray(b.rows)||!b.rows.length||b.rows.length>200||JSON.stringify(b.rows).length>1000000)return reply({error:'Lote OCP inválido'},400);
   const rows=b.rows.map((r:any,i:number)=>{
    const raw=r.raw_values;if(!Array.isArray(raw)||raw.length!==34||raw.some((v:any)=>typeof v!=='string'||v.length>2000)||r.row_no!==b.chunk*200+i+1||r.row_no>run.row_count||!/^\d{1,12}$/.test(raw[0])||!/^\d{1,12}$/.test(raw[19])||Number(raw[0])<run.map_from||Number(raw[0])>run.map_to)throw Error('Linha OCP inválida');
    const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw[1]);if(!m)throw Error('Data OCP inválida');const date=m[3]+'-'+m[2]+'-'+m[1];if(new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Data OCP inválida');
    return{row_no:r.row_no,date,map:String(Number(raw[0])),plate:raw[6].toUpperCase().replace(/[^A-Z0-9]/g,''),product:String(Number(raw[19])),pallet:raw[18],closed:raw[28].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()==='SIM',raw_values:raw};
   });const {error:e}=await db.from('efc_ocp_chunks').upsert({import_id:id,chunk:b.chunk,rows},{onConflict:'import_id,chunk'});check(e);return reply({ok:true,imported:rows.length});
  }
  if(b.action==='agent_ocp_finish'){const {error:e}=await db.rpc('efc_ocp_finish',{p_id:id,p_node:node.id});check(e);const {error:ce}=await db.from('efc_ocp_config').update({last_error:null,last_scan_at:new Date().toISOString()}).eq('id',1);check(ce);return reply({ok:true,...await ocpState()});}
  return reply({error:'Ação OCP inválida'},400);
 }
 if(['agent_segmentations_status','agent_segmentations_import','agent_segmentations_scan'].includes(b.action)){
  const node=await agentNode(req);if(!node)return reply({enabled:false},b.action==='agent_segmentations_status'?200:403);
  if(b.action==='agent_segmentations_status'){const cycles=await segmentationCycles();return reply({enabled:true,account:'gabrielypi@imperio1973.com',targets:cycles.map(c=>c.reference_date),start_hour:21,time_zone:'America/Sao_Paulo'});}
  if(b.action==='agent_segmentations_scan'){
   const clean=(v:any)=>Number.isInteger(v)&&v>=0&&v<=10000?v:0;
   const {error}=await db.from('efc_segmentation_scans').upsert({agent_node_id:node.id,messages:clean(b.messages),review:clean(b.review),errors:clean(b.errors),last_error:b.error?String(b.error).slice(0,400):null,updated_at:new Date().toISOString()});check(error);const cycles=b.error?null:await segmentationCycles();return reply({ok:true,targets:cycles?.map(c=>c.reference_date)||[]});
  }
  if(!Array.isArray(b.messages)||b.messages.length>50||JSON.stringify(b.messages).length>1000000)return reply({error:'Lote inválido'},400);
  const pending=new Set((await all(()=>db.from('efc_segmentation_night_cycles').select('reference_date').eq('status','waiting').order('reference_date'))).map(c=>c.reference_date));
  const emails=b.messages.filter((m:any)=>pending.has(String(m.date||''))).map((m:any)=>{
   const date=String(m.date||'');if(!/^[a-f0-9]{64}$/.test(m.id)||!/^2026-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!['parsed','review'].includes(m.status)||!Array.isArray(m.rows)||m.rows.length>2000||!Number.isFinite(Date.parse(m.received_at)))throw Error('E-mail inválido');
   const rows=m.rows.map((r:any)=>{for(const key of ['map','vehicle','customer'])if(!/^\d{1,12}$/.test(String(r[key])))throw Error('Segmentação inválida');return {map:String(r.map),vehicle:String(r.vehicle),customer:String(r.customer)};});
   if(m.status==='parsed'&&!rows.length)throw Error('Tabela vazia');
   return{id:m.id,reference_date:date,received_at:m.received_at,rows,status:m.status,issue:m.status==='review'?String(m.issue||'Revisar e-mail').slice(0,200):null,agent_node_id:node.id,updated_at:new Date().toISOString()};
  });
  if(emails.length){const {error}=await db.from('efc_segmentation_emails').upsert(emails,{onConflict:'id'});check(error);}return reply({ok:true,imported:emails.length});
 }
 if(['agent_efc_status','agent_efc_cycle'].includes(b.action)){
  if(!await agentNode(req))return reply({error:'Agente ADM necessário'},403);
  const cycles=await activeCycles();
  if(b.action==='agent_efc_status')return reply({target:cycleTarget(),targets:cycles.map(c=>c.reference_date),start_hour:21,time_zone:'America/Sao_Paulo'});
  const date=String(b.reference_date||'');if(!cycles.some(c=>c.reference_date===date))return reply({ok:true,stopped:true});
  const cycle=await reconcileCycle(date);return reply({ok:true,cycle});
 }
 if(b.action==='agent_maps'){
  const token=req.headers.get('x-agent-token');if(!token)return reply({error:'Agente não autorizado'},401);
  const {data:node,error}=await db.from('receiving_pull_agent_nodes').select('id').eq('token_hash',await hash(token)).eq('active',true).eq('slot_code','ADM').maybeSingle();check(error);if(!node)return reply({error:'Agente ADM necessário'},403);
  const date=String(b.reference_date||''),source=String(b.source_file||'');
  if(!/^2026-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!/(^|[\\/])MAPAS[^\\/]*\.xlsx$/i.test(source)||source.length>500||!Array.isArray(b.rows)||!b.rows.length||b.rows.length>5000||JSON.stringify(b.rows).length>2000000)return reply({error:'Planilha MAPAS inválida'},400);
  const active=await activeCycles();if(!active.some(c=>c.reference_date===date))return reply({error:'Este ciclo EFC ainda não começou ou já foi encerrado.'},409);
  const rows=b.rows.filter((r:any)=>r.plate&&!String(r.plate).trim().toUpperCase().startsWith('REC')).map((r:any,i:number)=>{const plate=String(r.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,''),vehicle=String(r.vehicle||'');if(!/^\d{1,12}$/.test(vehicle)||!/^\w{5,12}$/.test(plate))throw Error('Veículo MAPAS inválido');return{...r,id:'maps-agent:'+date+'|'+i,date,plate,vehicle,fleet:'FF',eligible:r.eligible!==false,source:'MAPAS agente',agent_source:source};});
  if(!rows.length)return reply({error:'Nenhum mapa com placa válida fora de REC.'},400);
  const {error:ie}=await db.from('efc_agent_map_files').upsert({reference_date:date,source_file:source,rows,agent_node_id:node.id,updated_at:new Date().toISOString()},{onConflict:'reference_date'});check(ie);return reply({ok:true,imported:rows.length});
 }
 if(b.action==='agent_events'){
  const t=req.headers.get('x-agent-token');if(!t)return reply({error:'Agente não autorizado'},401);
  const {data:node,error}=await db.from('receiving_pull_agent_nodes').select('id').eq('token_hash',await hash(t)).eq('active',true).maybeSingle();check(error);if(!node)return reply({error:'Agente não autorizado'},403);
  if(!Array.isArray(b.rows)||b.rows.length>500||JSON.stringify(b.rows).length>400000)return reply({error:'Lote inválido'},400);
  const rows=b.rows.map((x:any)=>{if(!/^\d{1,12}$/.test(x.map)||!/^2026-\d{2}-\d{2}$/.test(x.date)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(x.time)||!/^\w{5,12}$/.test(x.plate)||!['Carregado','Carga Montada'].includes(x.phase))throw Error('Evento inválido');const payload={map:x.map,date:x.date,time:x.time,phase:x.phase,plate:x.plate,vehicle:String(x.vehicle||'').slice(0,12),user:String(x.user||'').slice(0,100),system:String(x.system||'').slice(0,40),emission:x.emission||null,boxes:Number.isFinite(x.boxes)?x.boxes:null};return{id:[x.map,x.phase,x.date,x.time].join('|'),reference_date:x.date,payload,source_file:String(b.source_file||'031120').slice(0,180),updated_at:new Date().toISOString()};});
  if(rows.length){const {error}=await db.from('efc_agent_events').upsert(rows,{onConflict:'id'});check(error);}return reply({ok:true,imported:rows.length});
 }
 const token=req.headers.get('x-session-token');if(!token)return reply({error:'Sessão necessária'},401);
 const {data:s,error:se}=await db.from('app_sessions').select('user_id').eq('token_hash',await hash(token)).gt('expires_at',new Date().toISOString()).maybeSingle();check(se);if(!s)return reply({error:'Sessão expirada'},401);
 const {data:u,error:ue}=await db.from('app_users').select('id,role').eq('id',s.user_id).eq('active',true).maybeSingle();check(ue);if(!u)return reply({error:'Acesso negado'},403);
 const month=String(b.month||'');if(!/^2026-(0[1-9]|1[0-2])$/.test(month))return reply({error:'Mês inválido'},400);
 if(b.action==='adjust'){
  if(month<='2026-09')return reply({error:'Histórico fechado: os resultados originais do Excel foram preservados.'},409);
  if(u.role!=='admin')return reply({error:'Acesso administrativo necessário'},403);
  const kinds:any={helpers:['name','map','date','vehicle','pallets','start','end'],checkers:['name','map','date','vehicle','pallets'],priority:['priority'],capacity:['positions','palletization'],legacy_pay:['absences','compensation'],pcd:['eligible']};
  const allowed=kinds[b.kind],id=String(b.id||''),reason=String(b.reason||'').trim();if(!allowed||!id.startsWith(month+':'+b.kind+':')||!reason||reason.length>1000)return reply({error:'Correção inválida'},400);
  const {data:chunks,error}=await db.from('efc_archive').select('payload').eq('month',month).eq('kind',b.kind);check(error);if(!chunks?.some(c=>c.payload.some((r:any)=>r.id===id)))return reply({error:'Registro ausente'},404);
  const patch:any={};for(const [key,value] of Object.entries(b.patch||{})){if(!allowed.includes(key))return reply({error:'Campo não permitido'},400);if(['pallets','priority','positions','palletization','absences','compensation'].includes(key)){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000)return reply({error:'Número inválido'},400);}else if(key==='eligible'){if(typeof value!=='boolean')return reply({error:'Elegibilidade inválida'},400);}else if(key==='date'){if(typeof value!=='string'||!value.startsWith(month)||!/^2026-\d{2}-\d{2}$/.test(value))return reply({error:'Data inválida'},400);}else if(['start','end'].includes(key)){if(value!==null&&!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(value)))return reply({error:'Hora inválida'},400);}else if(typeof value!=='string'||value.length>160)return reply({error:'Texto inválido'},400);patch[key]=value;}
  if(!Object.keys(patch).length)return reply({error:'Informe uma alteração'},400);
  const {error:ae}=await db.rpc('efc_save_adjustment',{p_id:id,p_month:month,p_kind:b.kind,p_patch:patch,p_reason:reason,p_user:u.id});check(ae);return reply({ok:true});
 }
 if(b.action==='request_scan'){if(u.role!=='admin')return reply({error:'Acesso administrativo necessário'},403);return reply({ok:true,message:'O EFC acompanha os MAPAS a partir das 21h do dia anterior, retomando ao ligar o PC até identificar todos os carregamentos.'});}
 if(b.action!=='dashboard')return reply({error:'Ação inválida'},400);
 const from=month+'-01',next=new Date(Date.UTC(2026,Number(month.slice(5)),1)).toISOString().slice(0,10),before=new Date(Date.parse(from+'T12:00:00Z')-2*86400000).toISOString().slice(0,10);
 const [chunks,patches,events,pcd,agent,history,shared,cycles]=await Promise.all([all(()=>db.from('efc_archive').select('*').eq('month',month).order('kind').order('chunk')),all(()=>db.from('efc_adjustments').select('*').eq('month',month).order('record_id')),all(()=>db.from('efc_agent_events').select('id,payload').gte('reference_date',before).lt('reference_date',next).order('id')),all(()=>db.from('efc_agent_map_files').select('*').gte('reference_date',from).lt('reference_date',next).order('reference_date')),db.from('efd_agent_config').select('status,last_scan_at,last_error').eq('id',1).single(),db.from('efc_workbook_history').select('payload').eq('month',month).maybeSingle(),all(()=>db.from('report_031120_current').select('reference_date,headers,raw_values,source_file,completed_at').gte('reference_date',before).lt('reference_date',next).order('reference_date').order('row_no')),all(()=>db.from('efc_night_cycles').select('*').gte('reference_date',from).lt('reference_date',next).order('reference_date'))]);check(agent.error);check(history.error);
 const data:any={};for(const c of chunks){data[c.kind]??=[];data[c.kind].push(...c.payload);}for(const p of patches){const row=data[p.kind]?.find((x:any)=>x.id===p.record_id);if(row){Object.assign(row,p.patch);row.adjustment_reason=p.reason;}}
 const [segmentationEmails,segmentationScans]=await Promise.all([all(()=>db.from('efc_segmentation_emails').select('id,reference_date,received_at,rows,status,issue').gte('reference_date',from).lt('reference_date',next).order('reference_date').order('id')),db.from('efc_segmentation_scans').select('messages,review,errors,last_error,updated_at').order('updated_at',{ascending:false}).limit(1).maybeSingle()]);check(segmentationScans.error);
 const ocp=await all(()=>db.from('report_03023601_current').select('*').gte('reference_date',from).lt('reference_date',next).order('map').order('row_no'));data.ocp=ocp.map((r:any)=>({...r.payload,date:r.reference_date,source:r.source_file}));
 data.segmentations=segmentationEmails.map((m:any)=>({...m,date:m.reference_date}));
 data.events=frozenEvents(mergeEvents(data.events||[],events,shared),cycles);
 const covered=new Set(pcd.map((r:any)=>r.reference_date)),planned=(data.pcd||[]).filter((p:any)=>!covered.has(p.date));for(const file of pcd){const snapshot=cycles.find((c:any)=>c.reference_date===file.reference_date);if(snapshot)planned.push(...snapshot.plans);else planned.push(...file.rows);}for(const p of planned){const matching=data.events.filter((e:any)=>e.emission===p.date&&e.plate===String(p.plate).replace(/[^A-Z0-9]/gi,'').toUpperCase());const fleets=[...new Set(matching.map((e:any)=>e.fleet).filter(Boolean))];if(!p.fleet&&fleets.length===1)p.fleet=fleets[0];}data.pcd=planned;
 return reply({month,data,history:history.data?.payload||null,agent:agent.data,sources:[...new Set([...chunks.map(c=>c.source),...shared.map((r:any)=>r.source_file),...pcd.map((r:any)=>r.source_file)])],routine:{start_hour:21,time_zone:'America/Sao_Paulo',cycles:cycles.map((c:any)=>({date:c.reference_date,status:c.status,planned:c.planned,matched:c.matched,completed_at:c.completed_at}))},coverage:{report_03023601:{dates:[...new Set(ocp.map((r:any)=>r.reference_date))],last_import_at:ocp.map((r:any)=>r.completed_at).sort().at(-1)||null},segmentations:segmentationScans.data,report_031120:{dates:[...new Set(shared.map((r:any)=>r.reference_date))],last_import_at:shared.map((r:any)=>r.completed_at).sort().at(-1)||null},maps:{dates:[...new Set(pcd.map((r:any)=>r.reference_date))],last_import_at:pcd.map((r:any)=>r.updated_at).sort().at(-1)||null}},adjustments:patches.length});
 }catch(e){console.error('efc-api',e);return reply({error:'Não foi possível processar EFC. Confira os dados e tente novamente.'},400);}
});
