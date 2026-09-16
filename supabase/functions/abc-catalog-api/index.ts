import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function requireSession(req:Request){const token=req.headers.get("x-session-token")||"";if(!token)return null;const tokenHash=await sha256(token);const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();return u||null;}
const n=(v:any)=>{const x=Number(v);return Number.isFinite(x)?x:null;};
const fields="sku_code,sku_name,factor_hecto_commercial,boxes_per_pallet,source_file,updated_at";

async function readAllCatalog(){const out:any[]=[];const page=1000;for(let from=0;;from+=page){const {data,error}=await db.from("product_catalog").select(fields).order("sku_code").range(from,from+page-1);if(error)throw error;const rows=data||[];out.push(...rows);if(rows.length<page)break;}return out;}
async function readCodes(codes:string[]){const unique=[...new Set(codes.map(x=>String(x||"").trim()).filter(Boolean))].slice(0,1500);const out:any[]=[];for(let i=0;i<unique.length;i+=150){const {data,error}=await db.from("product_catalog").select(fields).in("sku_code",unique.slice(i,i+150));if(error)throw error;out.push(...(data||[]));}return out;}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  try{
    const body=await req.json();const user=await requireSession(req);if(!user)return json({error:"Sessão inválida ou expirada"},401);const action=String(body?.action||"");
    if(action==="status"){
      const [{count:total,error:e1},{count:withFactor,error:e2}]=await Promise.all([db.from("product_catalog").select("sku_code",{count:"exact",head:true}),db.from("product_catalog").select("sku_code",{count:"exact",head:true}).gt("factor_hecto_commercial",0)]);if(e1)throw e1;if(e2)throw e2;return json({count:total||0,valid_factor_count:withFactor||0,no_factor_count:Math.max(0,(total||0)-(withFactor||0))});
    }
    if(action==="get_codes"){
      const codes=Array.isArray(body.codes)?body.codes:[];if(!codes.length)return json({items:[],count:0});const data=await readCodes(codes);const valid=data.filter((x:any)=>Number(x.factor_hecto_commercial)>0).length;return json({items:data,count:data.length,valid_factor_count:valid,no_factor_count:data.length-valid});
    }
    if(action==="get"){
      const data=await readAllCatalog();const valid=data.filter((x:any)=>Number(x.factor_hecto_commercial)>0).length;return json({items:data,count:data.length,valid_factor_count:valid,no_factor_count:data.length-valid});
    }
    if(action==="import"){
      if(user.role!=="admin")return json({error:"Sem autorização"},403);const items=Array.isArray(body.items)?body.items:[];if(!items.length)return json({error:"Nenhum produto recebido"},400);let saved=0,withFactor=0;
      for(let i=0;i<items.length;i+=200){const batch=items.slice(i,i+200).map((x:any)=>{const factor=n(x.factor_hecto_commercial);return{sku_code:String(x.sku_code||"").trim(),sku_name:String(x.sku_name||""),factor_hecto_commercial:factor&&factor>0?factor:null,boxes_per_pallet:n(x.boxes_per_pallet),source_file:String(body.source_file||"01.11"),updated_at:new Date().toISOString()};}).filter((x:any)=>x.sku_code);if(!batch.length)continue;const {error}=await db.from("product_catalog").upsert(batch,{onConflict:"sku_code"});if(error)throw error;saved+=batch.length;withFactor+=batch.filter((x:any)=>Number(x.factor_hecto_commercial)>0).length;}
      return json({ok:true,count:saved,valid_factor_count:withFactor,no_factor_count:saved-withFactor});
    }
    return json({error:"Ação inválida"},400);
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:String(e)},500);}
});