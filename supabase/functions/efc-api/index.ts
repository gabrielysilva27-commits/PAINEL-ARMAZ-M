import {createClient} from 'jsr:@supabase/supabase-js@2.57.4';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const H={'Access-Control-Allow-Origin':'https://painel-armaz-m.gabrielysilva27.workers.dev','Access-Control-Allow-Headers':'content-type,x-session-token,x-agent-token','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:H});
async function hash(t:string){const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)));return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function check(e:any){if(e)throw e;}
async function all(make:()=>any){const rows:any[]=[];for(let n=0;n<50000;n+=1000){const {data,error}=await make().range(n,n+999);check(error);rows.push(...data);if(data.length<1000)return rows;}throw Error('Limite de consulta excedido');}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return reply({ok:true});if(req.method==='GET')return reply({service:'efc-api',version:'2026-10-01-1'});if(req.method!=='POST')return reply({error:'Método inválido'},405);
 try{
 const b=await req.json();
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
  if(u.role!=='admin')return reply({error:'Acesso administrativo necessário'},403);
  const kinds:any={helpers:['name','map','date','vehicle','pallets','start','end'],checkers:['name','map','date','vehicle','pallets'],priority:['priority'],capacity:['positions','palletization'],legacy_pay:['absences','compensation'],pcd:['eligible']};
  const allowed=kinds[b.kind],id=String(b.id||''),reason=String(b.reason||'').trim();if(!allowed||!id.startsWith(month+':'+b.kind+':')||!reason||reason.length>1000)return reply({error:'Correção inválida'},400);
  const {data:chunks,error}=await db.from('efc_archive').select('payload').eq('month',month).eq('kind',b.kind);check(error);if(!chunks?.some(c=>c.payload.some((r:any)=>r.id===id)))return reply({error:'Registro ausente'},404);
  const patch:any={};for(const [key,value] of Object.entries(b.patch||{})){if(!allowed.includes(key))return reply({error:'Campo não permitido'},400);if(['pallets','priority','positions','palletization','absences','compensation'].includes(key)){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000)return reply({error:'Número inválido'},400);}else if(key==='eligible'){if(typeof value!=='boolean')return reply({error:'Elegibilidade inválida'},400);}else if(key==='date'){if(typeof value!=='string'||!value.startsWith(month)||!/^2026-\d{2}-\d{2}$/.test(value))return reply({error:'Data inválida'},400);}else if(['start','end'].includes(key)){if(value!==null&&!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(value)))return reply({error:'Hora inválida'},400);}else if(typeof value!=='string'||value.length>160)return reply({error:'Texto inválido'},400);patch[key]=value;}
  if(!Object.keys(patch).length)return reply({error:'Informe uma alteração'},400);
  const {error:ae}=await db.rpc('efc_save_adjustment',{p_id:id,p_month:month,p_kind:b.kind,p_patch:patch,p_reason:reason,p_user:u.id});check(ae);return reply({ok:true});
 }
 if(b.action==='request_scan'){if(u.role!=='admin')return reply({error:'Acesso administrativo necessário'},403);const {error}=await db.from('efd_agent_config').update({diagnostic_requested:true,status:'pending'}).eq('id',1);check(error);return reply({ok:true});}
 if(b.action!=='dashboard')return reply({error:'Ação inválida'},400);
 const from=month+'-01',next=new Date(Date.UTC(2026,Number(month.slice(5)),1)).toISOString().slice(0,10),before=new Date(Date.parse(from+'T12:00:00Z')-2*86400000).toISOString().slice(0,10);
 const [chunks,patches,events,pcd,agent]=await Promise.all([all(()=>db.from('efc_archive').select('*').eq('month',month).order('kind').order('chunk')),all(()=>db.from('efc_adjustments').select('*').eq('month',month).order('record_id')),all(()=>db.from('efc_agent_events').select('id,payload').gte('reference_date',before).lt('reference_date',next).order('id')),all(()=>db.from('efd_pcd_routes').select('*').gte('reference_date',from).lt('reference_date',next).order('reference_date').order('vehicle').order('plate')),db.from('efd_agent_config').select('status,last_scan_at,last_error').eq('id',1).single()]);check(agent.error);
 const data:any={};for(const c of chunks){data[c.kind]??=[];data[c.kind].push(...c.payload);}for(const p of patches){const row=data[p.kind]?.find((x:any)=>x.id===p.record_id);if(row){Object.assign(row,p.patch);row.adjustment_reason=p.reason;}}
 const ev=new Map((data.events||[]).map((e:any)=>[[e.map,String(e.phase).trim().toUpperCase(),e.date,e.time].join('|'),e]));for(const e of events)ev.set([e.payload.map,String(e.payload.phase).trim().toUpperCase(),e.payload.date,e.payload.time].join('|'),{...e.payload,id:e.id,source:'Puxada'});data.events=[...ev.values()];
 const planned=data.pcd||[];for(const r of pcd){const matches=planned.filter((p:any)=>p.date===r.reference_date&&(String(p.plate).replace(/[^A-Z0-9]/gi,'').toUpperCase()===r.plate||String(p.plate)===r.vehicle));if(matches.length){for(const p of matches){p.plate=r.plate;p.vehicle=r.vehicle;p.agent_source=r.source_file;}}else planned.push({id:'pcd-agent:'+r.reference_date+'|'+r.plate,date:r.reference_date,plate:r.plate,vehicle:r.vehicle,route:r.route_name,eligible:true,source:'Puxada'});}data.pcd=planned;
 return reply({month,data,agent:agent.data,sources:[...new Set(chunks.map(c=>c.source))],adjustments:patches.length});
 }catch(e){console.error('efc-api',e);return reply({error:'Não foi possível processar EFC. Confira os dados e tente novamente.'},400);}
});
