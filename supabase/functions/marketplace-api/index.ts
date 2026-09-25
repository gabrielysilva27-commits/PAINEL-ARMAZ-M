import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const body=await req.json();const action=body?.action;
    if(action==="marketplace_base"){
      const {data,error}=await db.from("abc_marketplace_products").select("sku_code,sku_name,source_file,imported_at").eq("active",true).order("sku_code");if(error)throw error;
      return json({items:data||[],count:(data||[]).length});
    }
    if(action==="marketplace_import"){
      const incoming=Array.isArray(body.items)?body.items:[];const source=String(body.source_file||"");
      const seen=new Set<string>();const items:any[]=[];
      for(const row of incoming){const code=String(row?.sku_code??"").trim().replace(/\.0+$/,'');if(!/^\d+$/.test(code)||seen.has(code))continue;seen.add(code);items.push({sku_code:code,sku_name:String(row?.sku_name??"").trim()||null,active:true,source_file:source,imported_at:new Date().toISOString(),imported_by:user.id,updated_at:new Date().toISOString()});}
      if(!items.length)return json({error:"Nenhum SKU válido encontrado na Base Marketplace"},400);
      const {error:delError}=await db.from("abc_marketplace_products").delete().neq("sku_code","");if(delError)throw delError;
      for(let i=0;i<items.length;i+=500){const {error}=await db.from("abc_marketplace_products").insert(items.slice(i,i+500));if(error)throw error;}
      return json({ok:true,count:items.length});
    }
    return json({error:"Ação inválida"},400);
  }catch(e){console.error(e);return json({error:"Erro interno",detail:e instanceof Error?e.message:String(e)},500);}
});