import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import {validateSnapshot,enrich} from "./stock-core.js";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function requireSession(req:Request){const token=req.headers.get("x-session-token")||"";if(!token)return null;const tokenHash=await sha256(token);const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();return u||null;}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Método não permitido"},405);
 try{
  const user=await requireSession(req);if(!user)return json({error:"Sessão inválida ou expirada"},401);
  const body=await req.json();
  const {data:latest,error}=await db.from("stock_snapshots").select("*").order("created_at",{ascending:false}).limit(1).maybeSingle();if(error)throw error;
  if(body.action==="get"){
   const month=String(body.month||"");if(!/^\d{4}-\d{2}$/.test(month))return json({error:"Mês inválido"},400);
   const curves:any[]=[];for(let offset=0;;offset+=1000){const {data,error}=await db.from("abc_items").select("area,sku_code,curve_class,sku_name").eq("reference_month",month+"-01").in("area",["Regulador","Marketplace","Câmara Fria"]).range(offset,offset+999);if(error)throw error;curves.push(...data||[]);if(!data||data.length<1000)break;}
   if(!latest)return json({snapshot:null,curves});
   const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   return json({snapshot:latest,curves,...enrich(latest.payload,curves,today)});
  }
  if(body.action==="save"){
   if(user.role!=="admin")return json({error:"Somente administradores podem atualizar o estoque"},403);
   if(String(body.previous_id||"")!==String(latest?.id||""))return json({error:"O estoque foi atualizado por outra pessoa. Recarregue antes de salvar."},409);
   const payload=validateSnapshot(body.payload);
   if(JSON.stringify(payload).length>5000000)return json({error:"Base excede o limite de tamanho"},400);
   if(!payload.maps||!payload.targets)return json({error:"Configuração dos layouts ausente"},400);
   const {data,error}=await db.from("stock_snapshots").insert({payload,as_of:payload.as_of,source_name:String(payload.source_name||"Atualização no painel").slice(0,200),created_by:user.id,previous_id:latest?.id||null}).select("id,created_at").single();
   if(error){if(error.code==="23505")return json({error:"Atualização concorrente. Recarregue a base."},409);throw error;}return json({ok:true,...data});
  }
  return json({error:"Ação inválida"},400);
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Erro ao processar estoque"},400);}
});

