import { validateRows, summarizeWorkbook, checkIdentity } from "./blitz-import-core.mjs";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"https://painel-armaz-m.gabrielysilva27.workers.dev","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token, x-bo-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function requireSession(req:Request){const token=req.headers.get("x-session-token")||"";if(!token)return null;const tokenHash=await sha256(token);const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();return u||null;}
async function requireConferencer(req:Request){
 const token=req.headers.get("x-bo-token")||"";if(!token)return null;
 const {data:session,error}=await db.from("bo_conferencer_sessions").select("conferencer_id").eq("token_hash",await sha256(token)).gt("expires_at",new Date().toISOString()).maybeSingle();if(error)throw error;if(!session)return null;
 const {data:user,error:ue}=await db.from("bo_conferencers").select("id,display_name,active").eq("id",session.conferencer_id).eq("active",true).maybeSingle();if(ue)throw ue;
 return user?{...user,role:"conferencer",is_conferencer:true}:null;
}
function monthStart(v:string){if(!/^\d{4}-\d{2}$/.test(v))throw new Error("Mês inválido");return `${v}-01`;}
function nextMonth(v:string){const [y,m]=v.split("-").map(Number);return new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);}
function normalizeLoss(x:any){return{invoice:String(x.invoice||"").trim()||null,factory:String(x.factory||"").trim()||null,sku_code:String(x.sku_code||"").trim()||null,sku_name:String(x.sku_name||"").trim()||null,quantity_units:Number(x.quantity_units||0),reason:String(x.reason||"").trim()||null};}
const TRUCK_PLATES:Record<string,string>={"229":"KYI-8259","231":"LSN-7312","246":"LSZ-9355","264":"KZM-9D84","271":"LMZ-4G31","289":"RIX-8E72","298":"RKK-8G53","312":"TTZ5E13"};
async function availableTrailers(month:string){
 const {data,error}=await db.from("receiving_pull_daily").select("pull_date,vehicle_counts,imported_at").gte("pull_date",monthStart(month)).lt("pull_date",nextMonth(month)).order("pull_date",{ascending:true});
 if(error)throw error;
 const trailers:any[]=[];
 for(const row of data||[]){
  for(const [vehicle,count] of Object.entries(row.vehicle_counts||{})){
   const trips=Number(count);
   if(!vehicle.trim()||!Number.isFinite(trips)||trips<=0)continue;
   trailers.push({date:row.pull_date,vehicle,plate:TRUCK_PLATES[vehicle]||null,route:null,trips,source:"receiving_pull_daily"});
  }
 }
 return {trailers:trailers.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.vehicle).localeCompare(String(b.vehicle),undefined,{numeric:true})),coverage:{dates:(data||[]).map(r=>r.pull_date),updated_at:(data||[]).map(r=>r.imported_at).sort().at(-1)||null}};
}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Método não permitido"},405);try{const raw=await req.text();if(raw.length>6000000)return json({error:"Arquivo excede o limite de importação."},413);const body=JSON.parse(raw);const action=String(body?.action||"");const user:any=req.headers.has("x-bo-token")?await requireConferencer(req):await requireSession(req);if(!user)return json({error:"Sessão inválida ou expirada"},401);if(action==="import_workbook"){
 if(user.is_conferencer)return json({error:"Importação disponível somente no painel de gestão."},403);
 try{const month=String(body.month||"");monthStart(month);const rows=validateRows(body.rows,month),filename=String(body.filename||"Planilha Blitz").slice(0,200);const result=summarizeWorkbook(rows,[],filename);
 const {error}=await db.from("blitz_pull_summary_cache").upsert({...result,workbook_rows:rows,updated_at:new Date().toISOString()},{onConflict:"reference_month"});if(error)throw error;
 return json({ok:true,month,rows:rows.length,checks:result.checks,loss_lines:result.loss_lines});
 }catch(e){return json({error:e instanceof Error?e.message:"Falha na importação."},400);}
 }if(action==="lookup_product"){const sku=String(body.sku_code||"").trim().replace(/^0+(?=\d)/,"");if(!sku||sku.length>60)return json({product:null});const {data,error}=await db.from("product_catalog").select("sku_code,sku_name").eq("sku_code",sku).maybeSingle();if(error)throw error;return json({product:data||null});}if(action==="dashboard"){
 const month=String(body.month||new Date().toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"}).slice(0,7));const start=monthStart(month),end=nextMonth(month);
 let cq=db.from("blitz_pull_checks").select("*").gte("reference_date",start).lt("reference_date",end).order("reference_date",{ascending:false}).order("check_time",{ascending:false});
 if(user.is_conferencer)cq=cq.eq("conferencer_id",user.id);
 const [{data:checks,error:ce},{data:cache,error:cacheError}]=await Promise.all([cq,user.is_conferencer?Promise.resolve({data:null,error:null}):db.from("blitz_pull_summary_cache").select("*").eq("reference_month",start).maybeSingle()]);
 if(ce)throw ce;if(cacheError)throw cacheError;
 let losses:any[]=[];
 if(user.is_conferencer){const keys=(checks||[]).map(c=>c.check_key);if(keys.length){const {data,error}=await db.from("blitz_pull_losses").select("*").in("check_key",keys).order("reference_date",{ascending:false});if(error)throw error;losses=data||[];}}
 else{const {data,error}=await db.from("blitz_pull_losses").select("*").gte("reference_date",start).lt("reference_date",end).order("reference_date",{ascending:false});if(error)throw error;losses=data||[];}
 const source=await availableTrailers(month);let effectiveCache=cache,workbookRows:any[]=[];
 if(cache?.workbook_rows){const rows=cache.workbook_rows as any[];effectiveCache=summarizeWorkbook(rows,checks||[],String(cache.source||"Planilha Blitz").replace(/^Aba Lançamento Perda — /,""));const keys=new Set((checks||[]).map(checkIdentity));workbookRows=rows.filter(r=>!keys.has(checkIdentity(r)));}
 if(effectiveCache){const {workbook_rows,...summary}=effectiveCache;effectiveCache=summary;}
 return json({month,cache:effectiveCache,checks:checks||[],losses,workbook_rows:workbookRows,trailers:source.trailers,source_031120:source.coverage});
}if(action==="save_check"){const d=body.check||{},losses=(body.losses||[]).map(normalizeLoss).filter((x:any)=>x.quantity_units>0&&(x.sku_code||x.reason));if(!d.reference_date)return json({error:"Informe a data."},400);let existing:any=null;
 if(d.check_key){const {data,error}=await db.from("blitz_pull_checks").select("conferencer_id").eq("check_key",String(d.check_key)).maybeSingle();if(error)throw error;if(!data)return json({error:"Lançamento não encontrado."},404);existing=data;if(user.is_conferencer&&data.conferencer_id!==user.id)return json({error:"Este lançamento não pertence ao seu acesso."},403);}
 const check_key=d.check_key||crypto.randomUUID();const check={check_key,reference_date:d.reference_date,check_time:d.check_time||null,trailer:String(d.trailer||"").trim()||null,driver:String(d.driver||"").trim()||null,checker:user.is_conferencer?user.display_name:String(d.checker||user.display_name||"").trim()||null,trips_day:d.trips_day?Number(d.trips_day):null,trips_checked:d.trips_checked?Number(d.trips_checked):null,packages_checked:d.packages_checked?Number(d.packages_checked):null,notes:String(d.notes||"").trim()||null,created_by:user.is_conferencer?null:user.id,conferencer_id:user.is_conferencer?user.id:existing?.conferencer_id||null,updated_at:new Date().toISOString()};const {error:e1}=await db.from("blitz_pull_checks").upsert(check,{onConflict:"check_key"});if(e1)throw e1;if(d.check_key){const {error:del}=await db.from("blitz_pull_losses").delete().eq("check_key",check_key);if(del)throw del;}if(losses.length){const rows=losses.map((l:any)=>({...l,loss_key:crypto.randomUUID(),check_key,reference_date:d.reference_date}));const {error:e2}=await db.from("blitz_pull_losses").insert(rows);if(e2)throw e2;}return json({ok:true,check_key});}if(action==="delete_check"){if(user.role!=="admin")return json({error:"Somente ADM pode excluir."},403);const {error}=await db.from("blitz_pull_checks").delete().eq("check_key",String(body.check_key||""));if(error)throw error;return json({ok:true});}return json({error:"Ação inválida"},400);}catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Erro interno"},500);}});

