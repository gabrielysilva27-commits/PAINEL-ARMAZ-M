import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-repack-token,x-session-token","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const J=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const C=(v:unknown,m=200)=>String(v??"").trim().slice(0,m);

function b64(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function ub64(s:string){const p=s.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((s.length+3)%4);return Uint8Array.from(atob(p),c=>c.charCodeAt(0))}
async function sha(text:string){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))))}
async function ph(password:string,salt:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);return b64(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:ub64(salt),iterations:200000},key,256)))}
function pin6(){return String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0")}

async function appUser(req:Request){
 const t=req.headers.get("x-session-token")||"";if(!t)return null;
 const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",await sha(t)).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;
 const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();return u||null
}
async function workerUser(req:Request){
 const t=req.headers.get("x-repack-token")||"";if(!t)return null;
 const {data:s}=await db.from("repack_worker_sessions").select("worker_id,expires_at").eq("token_hash",await sha(t)).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;
 const {data:w}=await db.from("repack_workers").select("id,display_name,active").eq("id",s.worker_id).eq("active",true).maybeSingle();return w||null
}
function range(month:string){
 if(!/^\d{4}-\d{2}$/.test(month))throw new Error("Mês inválido.");
 const [y,m]=month.split("-").map(Number);if(m<1||m>12)throw new Error("Mês inválido.");
 const ny=m===12?y+1:y,nm=m===12?1:m+1,n=`${ny}-${String(nm).padStart(2,"0")}`;
 return{from:`${month}-01T00:00:00-03:00`,to:`${n}-01T00:00:00-03:00`}
}
const TS="id,worker_id,process_type,channel,packaging_code,quantity_boxes,started_at,finished_at,duration_seconds,status,notes,source,source_month,source_file,source_row,cancelled_at,created_at,worker:repack_workers(display_name)";

async function home(workerId:string){
 const [{data:a,error:ae},{data:h,error:he},{data:t,error:te}]=await Promise.all([
  db.from("repack_tasks").select(TS).eq("worker_id",workerId).eq("status","active").maybeSingle(),
  db.from("repack_tasks").select(TS).eq("worker_id",workerId).eq("status","completed").order("finished_at",{ascending:false}).limit(20),
  db.from("repack_packaging_targets").select("packaging_code,target_seconds_per_box").eq("active",true).order("packaging_code")
 ]);
 for(const e of [ae,he,te])if(e)throw e;
 return{active:a||null,history:h||[],targets:t||[],default_target_seconds_per_box:170}
}
async function dashboard(month:string){
 const r=range(month),year=month.slice(0,4);
 const [{data:l,error:le},{data:s,error:se},{data:y,error:ye},{data:a,error:ae},{data:w,error:we},{data:t,error:te}]=await Promise.all([
  db.from("repack_legacy_monthly").select("reference_month,channel,task_count,quantity_boxes,duration_seconds,avg_daily_seconds,data_through,source_file").order("reference_month").order("channel"),
  db.from("repack_tasks").select(TS).eq("source","timer").eq("status","completed").gte("started_at",r.from).lt("started_at",r.to).order("started_at",{ascending:false}).limit(1000),
  db.from("repack_tasks").select(TS).eq("source","timer").eq("status","completed").gte("started_at",`${year}-01-01T00:00:00-03:00`).lt("started_at",`${Number(year)+1}-01-01T00:00:00-03:00`).order("started_at").limit(3000),
  db.from("repack_tasks").select(TS).eq("status","active").order("started_at"),
  db.from("repack_workers").select("id,display_name,active,created_at,updated_at").order("display_name"),
  db.from("repack_packaging_targets").select("packaging_code,target_seconds_per_box,active,source").order("packaging_code")
 ]);
 for(const e of [le,se,ye,ae,we,te])if(e)throw e;
 return{month,legacy:l||[],selected_tasks:s||[],live_year_tasks:y||[],active_tasks:a||[],workers:w||[],targets:t||[],default_target_seconds_per_box:170}
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method==="GET")return J({ok:true,service:"repack-api",version:"2026-09-28-2"});
 if(req.method!=="POST")return J({error:"Método não permitido."},405);
 try{
  const b=await req.json().catch(()=>({})),a=C(b?.action,60);

  if(a==="worker_list"){
   const {data,error}=await db.from("repack_workers").select("id,display_name").eq("active",true).order("display_name");if(error)throw error;return J({workers:data||[]})
  }
  if(a==="worker_login"){if(!await consumeLoginAttempt("repack-api",b.worker_id))return J({error:"Muitas tentativas. Aguarde 15 minutos."},429);
   const id=C(b.worker_id,80),p=C(b.pin,12);if(!id)throw new Error("Selecione seu nome.");if(!/^\d{6}$/.test(p))throw new Error("Informe o PIN de 6 dígitos.");
   const {data:w,error}=await db.from("repack_workers").select("id,display_name,pin_salt,pin_hash,active").eq("id",id).maybeSingle();if(error)throw error;
   if(!w||!w.active||!w.pin_salt||!w.pin_hash||await ph(p,w.pin_salt)!==w.pin_hash)return J({error:"Nome ou PIN inválido."},401);
   const token=b64(crypto.getRandomValues(new Uint8Array(32))),expires=new Date(Date.now()+12*3600e3).toISOString();
   await db.from("repack_worker_sessions").delete().lt("expires_at",new Date().toISOString());
   const {error:ie}=await db.from("repack_worker_sessions").insert({worker_id:w.id,token_hash:await sha(token),expires_at:expires});if(ie)throw ie;
   return J({token,expires_at:expires,worker:{id:w.id,display_name:w.display_name},home:await home(w.id)})
  }

  if(["worker_session","worker_logout","worker_home","worker_start","worker_finish","worker_cancel"].includes(a)){
   const w=await workerUser(req);if(!w)return J({error:"Sessão do Repack inválida ou expirada."},401);
   if(a==="worker_session")return J({worker:w,home:await home(w.id)});
   if(a==="worker_logout"){const t=req.headers.get("x-repack-token")||"";if(t)await db.from("repack_worker_sessions").delete().eq("token_hash",await sha(t));return J({ok:true})}
   if(a==="worker_home")return J({worker:w,home:await home(w.id)});
   if(a==="worker_start"){
    const pt=C(b.process_type,20);let ch=C(b.channel,20),pc=C(b.packaging_code,80)||null;
    if(!["repack","despejo"].includes(pt))throw new Error("Tipo de atividade inválido.");
    if(pt==="despejo"){ch="bombona";pc=null}
    if(pt==="repack"&&!["repack","bag","devolucao"].includes(ch))throw new Error("Canal de Repack inválido.");
    if(pc){const {data:q}=await db.from("repack_packaging_targets").select("packaging_code").eq("packaging_code",pc).eq("active",true).maybeSingle();if(!q)throw new Error("Embalagem inválida.")}
    const {data:cur}=await db.from("repack_tasks").select("id").eq("worker_id",w.id).eq("status","active").maybeSingle();if(cur)throw new Error("Você já possui um cronômetro em andamento.");
    const now=new Date().toISOString();
    const {data,error}=await db.from("repack_tasks").insert({worker_id:w.id,process_type:pt,channel:ch,packaging_code:pc,started_at:now,status:"active",source:"timer",updated_at:now}).select(TS).single();if(error)throw error;
    return J({task:data,server_now:now})
   }
   if(a==="worker_finish"){
    const id=Number(b.task_id),qty=Number(b.quantity_boxes),notes=C(b.notes,1000)||null;
    if(!Number.isInteger(id)||id<=0)throw new Error("Tarefa inválida.");if(!Number.isFinite(qty)||qty<=0)throw new Error("Informe a quantidade de caixas.");
    const {data:q,error:qe}=await db.from("repack_tasks").select("id,started_at,status").eq("id",id).eq("worker_id",w.id).maybeSingle();if(qe)throw qe;if(!q||q.status!=="active")throw new Error("Cronômetro não está mais ativo.");
    const now=new Date(),sec=Math.max(1,Math.round((now.getTime()-new Date(q.started_at).getTime())/1000));
    const {data,error}=await db.from("repack_tasks").update({quantity_boxes:qty,finished_at:now.toISOString(),duration_seconds:sec,status:"completed",notes,updated_at:now.toISOString()}).eq("id",id).eq("worker_id",w.id).eq("status","active").select(TS).maybeSingle();if(error)throw error;if(!data)throw new Error("Não foi possível finalizar: a tarefa mudou de estado.");
    return J({task:data,home:await home(w.id)})
   }
   if(a==="worker_cancel"){
    const id=Number(b.task_id),now=new Date().toISOString();
    const {data,error}=await db.from("repack_tasks").update({status:"cancelled",cancelled_at:now,updated_at:now}).eq("id",id).eq("worker_id",w.id).eq("status","active").select("id").maybeSingle();if(error)throw error;if(!data)throw new Error("Cronômetro não encontrado ou já encerrado.");
    return J({ok:true,home:await home(w.id)})
   }
  }

  const u=await appUser(req);if(!u)return J({error:"Sessão do Painel inválida ou expirada."},401);
  if(a==="dashboard")return J({dashboard:await dashboard(C(b.month,7)||new Date().toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"}).slice(0,7))});

  if(a==="admin_workers"){
   if(u.role!=="admin")return J({error:"Acesso restrito à administração."},403);
   const {data,error}=await db.from("repack_workers").select("id,display_name,active,pin_hash,created_at,updated_at").order("display_name");if(error)throw error;
   return J({workers:(data||[]).map((x:any)=>({id:x.id,display_name:x.display_name,active:x.active,pin_ready:!!x.pin_hash,created_at:x.created_at,updated_at:x.updated_at}))})
  }
  if(a==="admin_worker_create"){
   if(u.role!=="admin")return J({error:"Acesso restrito à administração."},403);
   const name=C(b.display_name,120);if(name.length<2)throw new Error("Informe o nome do ajudante.");
   const p=pin6(),salt=b64(crypto.getRandomValues(new Uint8Array(16))),hash=await ph(p,salt);
   const {data,error}=await db.from("repack_workers").insert({display_name:name,pin_salt:salt,pin_hash:hash,active:true}).select("id,display_name,active").single();if(error)throw error;
   return J({worker:data,issued:{id:data.id,display_name:data.display_name,pin:p}},201)
  }
  if(a==="admin_worker_reset_pin"){
   if(u.role!=="admin")return J({error:"Acesso restrito à administração."},403);
   const id=C(b.id,80),{data:old,error:qe}=await db.from("repack_workers").select("id,display_name").eq("id",id).maybeSingle();if(qe)throw qe;if(!old)throw new Error("Ajudante não encontrado.");
   const p=pin6(),salt=b64(crypto.getRandomValues(new Uint8Array(16))),hash=await ph(p,salt);
   const {error}=await db.from("repack_workers").update({pin_salt:salt,pin_hash:hash,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;
   await db.from("repack_worker_sessions").delete().eq("worker_id",id);return J({issued:{id:old.id,display_name:old.display_name,pin:p}})
  }
  if(a==="admin_worker_toggle"){
   if(u.role!=="admin")return J({error:"Acesso restrito à administração."},403);
   const id=C(b.id,80),active=!!b.active,{data,error}=await db.from("repack_workers").update({active,updated_at:new Date().toISOString()}).eq("id",id).select("id,display_name,active").maybeSingle();if(error)throw error;if(!data)throw new Error("Ajudante não encontrado.");
   if(!active)await db.from("repack_worker_sessions").delete().eq("worker_id",id);return J({worker:data})
  }
  return J({error:"Ação inválida."},400)
 }catch(e){console.error(e);return J({error:e instanceof Error?e.message:"Erro interno."},500)}
});
async function consumeLoginAttempt(scope:string,identity:unknown){
 const normalized=String(identity??"").trim().toLowerCase().slice(0,200);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(scope+":"+normalized))),b=>b.toString(16).padStart(2,"0")).join("");
 const {data,error}=await db.rpc("consume_login_attempt",{p_key:hash});
 if(error)throw error;return data===true;
}
