import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const origin='https://painel-armaz-m.gabrielysilva27.workers.dev';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,x-session-token,x-agent-token','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
async function hash(t:string){const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)));return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function check(error:any){if(error)throw error}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Método não permitido'},405);
 try{
  const b=await req.json();const action=String(b.action||'');
  if(action.startsWith('agent_')){
   const token=req.headers.get('x-agent-token');if(!token)return reply({error:'Agente não autorizado'},401);
   const {data:node,error}=await db.from('receiving_pull_agent_nodes').select('id,slot_code').eq('token_hash',await hash(token)).eq('active',true).maybeSingle();check(error);
   if(!node||node.slot_code!=='ADM')return reply({error:'Leitura PCD reservada ao Computador ADM'},403);
   if(action==='agent_status'){const {data,error}=await db.from('efd_agent_config').select('*').eq('id',1).single();check(error);return reply({config:data})}
   if(action==='agent_diagnostic'){
    const d=b.diagnostic;
    if(!d||typeof d!=='object'||JSON.stringify(d).length>200000)return reply({error:'Diagnóstico inválido'},400);
    const status=b.error?'error':'completed';
    const {error}=await db.from('efd_agent_config').update({status,last_error:b.error?String(b.error).slice(0,1000):null,diagnostic:d,diagnostic_requested:false,last_scan_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',1);check(error);return reply({ok:true});
   }
   return reply({error:'Ação inválida'},400);
  }
  const token=req.headers.get('x-session-token');if(!token)return reply({error:'Sessão necessária'},401);
  const {data:s,error:se}=await db.from('app_sessions').select('user_id').eq('token_hash',await hash(token)).gt('expires_at',new Date().toISOString()).maybeSingle();check(se);
  if(!s)return reply({error:'Sessão expirada'},401);
  const {data:u,error:ue}=await db.from('app_users').select('role').eq('id',s.user_id).eq('active',true).maybeSingle();check(ue);if(!u)return reply({error:'Acesso negado'},403);
  if(action==='request_scan'){
   if(u.role!=='admin')return reply({error:'Acesso administrativo necessário'},403);
   const {error}=await db.from('efd_agent_config').update({diagnostic_requested:true,status:'pending',last_error:null}).eq('id',1);check(error);return reply({ok:true});
  }
  if(action!=='dashboard')return reply({error:'Ação inválida'},400);
  const month=String(b.month||'2026-01');if(!/^2026-(0[1-9]|1[0-2])$/.test(month))return reply({error:'Mês inválido'},400);
  const from=month+'-01';const end=new Date(Date.UTC(2026,Number(month.slice(5)),1)).toISOString().slice(0,10);
  const {data:rows,error:re}=await db.from('efd_maps').select('*').gte('reference_date',from).lt('reference_date',end).order('reference_date').order('vehicle').limit(10000);check(re);
  const {count,error:ce}=await db.from('efd_maps').select('map_id',{count:'exact',head:true}).is('reference_date',null);check(ce);
  const {data:config,error:ae}=await db.from('efd_agent_config').select('status,last_scan_at,last_error,diagnostic,root_path,diagnostic_requested').eq('id',1).single();check(ae);
  // Dates are local operational timestamps; the cutoff is on the departure day.
  const maps=(rows||[]).map(r=>({...r,status:!r.valid?'excluded':!r.physical_at?'pending':Date.parse(r.physical_at)<=Date.parse(r.reference_date+'T21:00:00')?'on_time':'late'}));
  return reply({month,maps,unmatched_maps:count||0,cutoff:'21:00',target:90,source:'PC_Física · 03.11.20 + PCD',coverage:'Base inicial do arquivo anexado; pendências de conciliação disponíveis.',agent:u.role==='admin'?config:{status:config.status,last_scan_at:config.last_scan_at,last_error:config.last_error}});
 }catch(e){console.error(e);return reply({error:'Não foi possível processar o EFD. Tente novamente.'},500)}
});
