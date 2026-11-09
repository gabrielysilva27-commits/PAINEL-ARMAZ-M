import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
import {period,buildCurve} from "./abc-core.mjs";
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const lease=()=>new Date(Date.now()+30*60000).toISOString();
async function nodeAuth(req:Request){const token=req.headers.get('x-agent-token')||'';if(!token)return null;const hash=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');const {data,error}=await db.from('receiving_pull_agent_nodes').select('id,slot_code,active').eq('token_hash',hash).eq('active',true).maybeSingle();if(error)throw error;return data;}
const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
async function imported(month:string){const {data,error}=await db.from('abc_months').select('status').eq('reference_month',month+'-01').maybeSingle();if(error)throw error;return data?.status==='imported';}
async function owned(month:string,runId:string,nodeId:string){const {data,error}=await db.from('abc_agent_monthly_runs').select('*').eq('reference_month',month+'-01').eq('run_id',runId).eq('node_id',nodeId).eq('status','running').gt('lease_expires_at',new Date().toISOString()).maybeSingle();if(error)throw error;if(!data)throw Error('ABC_LEASE_LOST');return data;}
function sourceRows(rows:any){if(!Array.isArray(rows)||!rows.length||rows.length>15000)throw Error('ABC_INVALID_ROWS');return rows.map((r:any)=>{const sku_code=String(r.sku_code||''),boxes=Number(r.boxes);if(!/^\d{1,12}$/.test(sku_code)||!Number.isFinite(boxes))throw Error('ABC_INVALID_SOURCE_ROW');return{sku_code,boxes,name:String(r.name||'').slice(0,300)};});}
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return json({error:'Método não permitido'},405);
  try{
    const node=await nodeAuth(req);if(!node)return json({error:'Agente não autorizado'},401);
    const b=await req.json(),action=String(b.action||''),month=currentMonth(),job=period(month);
    if(month<'2026-11')return json({complete:true});
    if(action==='status')return json({complete:await imported(month),...job});
    if(action==='claim'){
      if(await imported(month))return json({complete:true});
      const {data:config,error:ce}=await db.from('efd_agent_config').select('root_path').limit(1).maybeSingle();if(ce)throw ce;if(!config?.root_path)throw Error('ABC_MAP_ROOT_NOT_CONFIGURED');
      const {error:ie}=await db.from('abc_agent_monthly_runs').upsert({reference_month:month+'-01'},{onConflict:'reference_month',ignoreDuplicates:true});if(ie)throw ie;
      const now=new Date().toISOString();
      const {data:prior,error:pe}=await db.from('abc_agent_monthly_runs').select('attempts').eq('reference_month',month+'-01').maybeSingle();if(pe)throw pe;
      const run_id=crypto.randomUUID();
      const {data,error}=await db.from('abc_agent_monthly_runs').update({status:'running',run_id,node_id:node.id,lease_expires_at:lease(),stage:'claimed',details:{},attempts:Number(prior?.attempts||0)+1,last_error:null,started_at:now,updated_at:now}).eq('reference_month',month+'-01').or('status.in.(pending,error),and(status.eq.running,lease_expires_at.lt.'+now+')').select('run_id').maybeSingle();if(error)throw error;
      return json({job:data?{...job,run_id,root_path:config.root_path}:null});
    }
    const requested=String(b.month||'');period(requested);const run=await owned(requested,String(b.run_id||''),node.id);
    if(action==='stage'||action==='heartbeat'||action==='error'){
      const patch:any={updated_at:new Date().toISOString(),lease_expires_at:lease()};
      if(action==='stage'){patch.stage=String(b.stage||'').slice(0,60);patch.details={...run.details,[patch.stage]:b.details||{}};if(JSON.stringify(patch.details).length>60000)throw Error('ABC_DETAILS_TOO_LARGE');}
      if(action==='error'){patch.status='error';patch.last_error=String(b.error||'Falha').slice(0,2000);patch.lease_expires_at=null;}
      const {data,error}=await db.from('abc_agent_monthly_runs').update(patch).eq('reference_month',requested+'-01').eq('run_id',b.run_id).eq('node_id',node.id).eq('status','running').select('run_id').maybeSingle();if(error)throw error;if(!data)throw Error('ABC_LEASE_LOST');return json({ok:true});
    }
    if(action==='complete'){
      const p=period(requested),bounds=b.bounds;
      if(!bounds||bounds.first_date!==p.date_from||bounds.last_date!==p.date_to||!/^\d{1,12}$/.test(bounds.map_from)||!/^\d{1,12}$/.test(bounds.map_to)||+bounds.map_from>+bounds.map_to)throw Error('ABC_INVALID_BOUNDARIES');
      const confirmed=run.details?.map_boundaries;if(!confirmed||JSON.stringify(confirmed)!==JSON.stringify(bounds))throw Error('ABC_BOUNDARIES_NOT_CONFIRMED');
      const dates=[...new Set(Array.isArray(b.dates)?b.dates:[])];if(!dates.length||dates.length>92||dates.some((x:any)=>typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||x<p.date_from||x>p.date_to||new Date(x+'T12:00:00Z').toISOString().slice(0,10)!==x))throw Error('ABC_INVALID_DATES');
      if(!Array.isArray(b.source_files)||b.source_files.length!==2||!Array.isArray(b.sha256)||b.sha256.length!==2||b.sha256.some((x:any)=>!/^[a-f0-9]{64}$/.test(x)))throw Error('ABC_SOURCE_AUDIT_MISSING');
      const sales=sourceRows(b.sales),picking=sourceRows(b.picking),codes=[...new Set([...sales,...picking].map(x=>x.sku_code))],catalog:any[]=[];
      for(let i=0;i<codes.length;i+=150){const {data,error}=await db.from('product_catalog').select('sku_code,sku_name,factor_hecto_commercial,boxes_per_pallet').in('sku_code',codes.slice(i,i+150));if(error)throw error;catalog.push(...(data||[]));}
      const {data:marketplace,error:me}=await db.from('abc_marketplace_products').select('sku_code').eq('active',true);if(me)throw me;
      const curve=buildCurve(sales,picking,catalog,marketplace||[],dates.length),result={...p,bounds,items:curve.items.length,days:dates.length,skipped_codes:curve.skipped_codes,asset_codes:curve.asset_codes,source_files:b.source_files,sha256:b.sha256,excluded_ocp_rows:Number(b.excluded_ocp_rows)||0};
      const {error}=await db.rpc('complete_abc_agent_month',{p_month:requested+'-01',p_run_id:b.run_id,p_node_id:node.id,p_days:dates.length,p_source:b.source_files.map((x:any)=>String(x).slice(0,200)).join(' | '),p_items:curve.items,p_result:result});if(error)throw error;
      return json({ok:true,...result});
    }
    return json({error:'Ação inválida'},400);
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:String(e)},500);}
});
