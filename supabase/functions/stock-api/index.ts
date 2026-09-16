import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import {validateSnapshot,enrich} from "./stock-core.js";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function requireSession(req:Request){const token=req.headers.get("x-session-token")||"";if(!token)return null;const tokenHash=await sha256(token);const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();return u||null;}
const canEdit=(u:any)=>['admin','conferente'].includes(String(u?.role||'').toLowerCase());
function rowKey(r:any){return String(r?.id||`${r?.area||''}|${r?.address||''}|${r?.sku_code||''}`);}
function diffRows(before:any[]=[],after:any[]=[]){
 const a=new Map(before.map(r=>[rowKey(r),r])),b=new Map(after.map(r=>[rowKey(r),r])),keys=new Set([...a.keys(),...b.keys()]),out:any[]=[];
 const fields=['area','address','sku_code','sku_name','received_on','expires_on','pallets','lock'];
 for(const k of keys){const x=a.get(k),y=b.get(k);if(!x&&y){out.push({id:k,type:'ADDED',after:y});continue;}if(x&&!y){out.push({id:k,type:'REMOVED',before:x});continue;}const changes:any={};for(const f of fields)if(JSON.stringify(x?.[f]??null)!==JSON.stringify(y?.[f]??null))changes[f]={before:x?.[f]??null,after:y?.[f]??null};if(Object.keys(changes).length)out.push({id:k,type:'CHANGED',area:y?.area||x?.area,address:y?.address||x?.address,sku_code:y?.sku_code||x?.sku_code,changes});}
 return out;
}
async function latestSnapshot(){const {data,error}=await db.from("stock_snapshots").select("*").order("created_at",{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data;}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Método não permitido"},405);
 try{
  const user=await requireSession(req);if(!user)return json({error:"Sessão inválida ou expirada"},401);
  const body=await req.json();
  const latest=await latestSnapshot();
  if(body.action==="get"){
   const month=String(body.month||"");if(!/^\d{4}-\d{2}$/.test(month))return json({error:"Mês inválido"},400);
   const curves:any[]=[];for(let offset=0;;offset+=1000){const {data,error}=await db.from("abc_items").select("area,sku_code,curve_class,sku_name").eq("reference_month",month+"-01").in("area",["Regulador","Marketplace","Câmara Fria"]).range(offset,offset+999);if(error)throw error;curves.push(...data||[]);if(!data||data.length<1000)break;}
   if(!latest)return json({snapshot:null,curves});
   const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   return json({snapshot:latest,curves,...enrich(latest.payload,curves,today)});
  }
  if(body.action==="history"){
   const limit=Math.min(200,Math.max(1,Number(body.limit||50)));
   const {data,error}=await db.from("stock_audit_log").select("id,created_at,action,changed_count,changed_rows,note,user_id,app_users(display_name,username,role)").order("created_at",{ascending:false}).limit(limit);if(error)throw error;
   return json({items:data||[]});
  }
  if(body.action==="save"){
   if(!canEdit(user))return json({error:"Seu perfil não possui permissão para atualizar o estoque"},403);
   if(String(body.previous_id||"")!==String(latest?.id||""))return json({error:"O estoque foi atualizado por outra pessoa. Recarregue antes de salvar."},409);
   const payload=validateSnapshot(body.payload);
   if(JSON.stringify(payload).length>5000000)return json({error:"Base excede o limite de tamanho"},400);
   if(!payload.maps||!payload.targets)return json({error:"Configuração dos layouts ausente"},400);
   const changes=diffRows(latest?.payload?.rows||[],payload.rows||[]);
   const action=String(body.change_type||'').toUpperCase()==='IMPORT'?'IMPORT':changes.length>1?'BULK_EDIT':'EDIT';
   const {data,error}=await db.from("stock_snapshots").insert({payload,as_of:payload.as_of,source_name:String(payload.source_name||"Atualização no painel").slice(0,200),created_by:user.id,previous_id:latest?.id||null}).select("id,created_at").single();
   if(error){if(error.code==="23505")return json({error:"Atualização concorrente. Recarregue a base."},409);throw error;}
   const compact=changes.slice(0,250).map((x:any)=>x.type==='CHANGED'?x:{id:x.id,type:x.type,area:x.after?.area||x.before?.area,address:x.after?.address||x.before?.address,sku_code:x.after?.sku_code||x.before?.sku_code});
   const {error:auditError}=await db.from("stock_audit_log").insert({snapshot_id:data.id,previous_snapshot_id:latest?.id||null,user_id:user.id,action,changed_count:changes.length,changed_rows:compact,note:String(body.note||payload.source_name||'').slice(0,300)});if(auditError)throw auditError;
   return json({ok:true,...data,changed_count:changes.length});
  }
  return json({error:"Ação inválida"},400);
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Erro ao processar estoque"},400);}
});
