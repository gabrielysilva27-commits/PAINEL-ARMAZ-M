
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const enc = new TextEncoder();
const BASE = "https://imperio.promaxcloud.com.br";
const SELF = "https://wzawtpadchtnvtclyghm.supabase.co/functions/v1/promax-direct-api";

function clean(v:unknown,n=500){ return String(v ?? "").replace(/\s+/g," ").trim().slice(0,n); }
function validPromaxOrigin(v:string){
  try{
    const u=new URL(v);
    const h=u.hostname.toLowerCase();
    return u.protocol==="https:" && (h==="imperio.promaxcloud.com.br" || h.endsWith(".promaxcloud.com.br"));
  }catch{return false}
}
function cors(req:Request){
  const o=req.headers.get("origin")||"";
  return {
    "access-control-allow-origin": validPromaxOrigin(o)?o:"*",
    "access-control-allow-methods":"GET,POST,OPTIONS",
    "access-control-allow-headers":"content-type,x-agent-token",
    "vary":"Origin"
  };
}
const json = (req:Request,body:unknown,status=200) => new Response(JSON.stringify(body), {
  status,
  headers: {...cors(req),"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

async function sha256url(value:string){
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)));
  let s=""; for(const x of b) s+=String.fromCharCode(x);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

function allowedPromaxUrl(v:unknown){
  const u = new URL(String(v || BASE+"/"));
  if(!validPromaxOrigin(u.origin)) throw new Error("Host fora do Promax.");
  return u;
}

async function authNode(req:Request){
  const token=req.headers.get("x-agent-token")||"";
  if(!token) return null;
  const {data,error}=await db.from("receiving_pull_agent_nodes")
    .select("id,slot_code,display_name,active")
    .eq("token_hash",await sha256url(token))
    .eq("active",true)
    .maybeSingle();
  if(error) throw error;
  return data || null;
}

async function fetchProbe(url:URL,cookieHeader=""){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(url.toString(),{
      method:"GET",redirect:"follow",signal:controller.signal,
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/153 Safari/537.36",
        "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(cookieHeader?{"Cookie":cookieHeader}:{})
      }
    });
    const final=allowedPromaxUrl(r.url || url.toString());
    const text=(await r.text()).slice(0,500000);
    const norm=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    const authenticated=norm.includes("ATALHO") && (norm.includes("LOGOFF")||norm.includes("LOG OFF"));
    const login=norm.includes("USUARIO") && norm.includes("SENHA");
    return {ok:r.ok,status:r.status,final_host:final.hostname,content_type:r.headers.get("content-type")||"",
      bytes:text.length,authenticated,login,marker:authenticated?"HOME_AUTHENTICATED":login?"LOGIN_PAGE":"UNKNOWN_PAGE"};
  } finally { clearTimeout(timer); }
}

const BRIDGE_JS = String.raw`
(function(){
  if(window.__puxadaBridgeInstalled){try{window.__puxadaBridgeProbe();}catch(e){};return;}
  window.__puxadaBridgeInstalled=true;
  var endpoint="${SELF}";
  function norm(v){try{return String(v||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toUpperCase();}catch(e){return String(v||"").toUpperCase();}}
  function collect(w,depth,out){
    if(depth>10)return;
    try{
      var d=w.document,body=d.body,txt=(d.title||"")+" "+(body?(body.innerText||body.textContent||""):"");
      out.frames++;
      var n=norm(txt);
      if(n.indexOf("ATALHO")>=0)out.hasAtalho=true;
      if(n.indexOf("LOGOFF")>=0||n.indexOf("LOG OFF")>=0)out.hasLogoff=true;
      if(n.indexOf("USUARIO")>=0&&n.indexOf("SENHA")>=0)out.hasLogin=true;
      var nodes=d.querySelectorAll("input,button,a,select");
      out.controls+=nodes.length;
      for(var i=0;i<nodes.length;i++){
        var e=nodes[i],m=norm((e.value||"")+" "+(e.innerText||e.textContent||"")+" "+(e.name||"")+" "+(e.id||"")+" "+(e.title||""));
        if(m.indexOf("VISUALIZAR")>=0)out.hasVisualizar=true;
        if(m.indexOf("CSV")>=0||String(e.name||"")==="GerExecl")out.hasCsv=true;
      }
    }catch(e){out.blockedFrames++;}
    try{for(var j=0;j<w.frames.length;j++)collect(w.frames[j],depth+1,out);}catch(e){}
  }
  function overlay(text,ok){
    var id="__puxada_bridge_badge",x=document.getElementById(id);
    if(!x){x=document.createElement("div");x.id=id;x.style.cssText="position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:9px 12px;border-radius:8px;font:600 12px Arial;background:"+(ok?"#137333":"#b3261e")+";color:white;box-shadow:0 2px 10px #0005";(document.body||document.documentElement).appendChild(x);}
    x.style.background=ok?"#137333":"#b3261e";x.textContent=text;
  }
  async function probe(){
    var out={frames:0,blockedFrames:0,controls:0,hasAtalho:false,hasLogoff:false,hasLogin:false,hasVisualizar:false,hasCsv:false};
    collect(window,0,out);
    out.homeReady=!!(out.hasAtalho&&out.hasLogoff);
    try{
      var r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"bridge_probe",href:String(location.href),title:String(document.title||""),diag:out})});
      var j=await r.json().catch(function(){return{};});
      if(!r.ok)throw new Error(j.error||("HTTP "+r.status));
      overlay(out.homeReady?"Puxada Bridge conectado":"Bridge ativo · abra o início do Promax",true);
      return j;
    }catch(e){overlay("Puxada Bridge: "+String(e&&e.message||e),false);throw e;}
  }
  window.__puxadaBridgeProbe=probe;
  probe();
  setInterval(probe,60000);
})();`;

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors(req)});
  const u=new URL(req.url);

  if(req.method==="GET" && u.searchParams.get("asset")==="bridge.js"){
    return new Response(BRIDGE_JS,{status:200,headers:{...cors(req),"content-type":"application/javascript; charset=utf-8","cache-control":"no-store"}});
  }

  if(req.method==="GET")return json(req,{service:"promax-direct-api"},200);

  if(req.method!=="POST") return json(req,{error:"Método não permitido."},405);
  try{
    const body=await req.json().catch(()=>({}));
    const action=clean(body?.action,50);

    if(action==="bridge_probe"){
      const origin=req.headers.get("origin")||"";
      if(!validPromaxOrigin(origin)) return json(req,{error:"Origem do Promax não reconhecida."},403);
      const diag=body?.diag && typeof body.diag==="object" ? body.diag : {};
      const safeDiag={
        frames:Math.max(0,Math.min(100,Number(diag.frames)||0)),
        blockedFrames:Math.max(0,Math.min(100,Number(diag.blockedFrames)||0)),
        controls:Math.max(0,Math.min(5000,Number(diag.controls)||0)),
        hasAtalho:!!diag.hasAtalho,hasLogoff:!!diag.hasLogoff,hasLogin:!!diag.hasLogin,
        hasVisualizar:!!diag.hasVisualizar,hasCsv:!!diag.hasCsv,homeReady:!!diag.homeReady
      };
      // Browser diagnostics are observations, never trusted persistent agent state.
      return json(req,{ok:true,bridge_ready:!!safeDiag.homeReady,diag:safeDiag});
    }

    if(action==="public_probe"){
      if(!await authNode(req))return json(req,{error:"Agente não autorizado."},401);
      const result=await fetchProbe(allowedPromaxUrl(body?.url||BASE+"/"));
      await db.from("promax_direct_state").update({
        public_reachable:!!result.ok,http_status:result.status,final_host:result.final_host,
        marker:result.marker,last_error:null,last_probe_at:new Date().toISOString(),updated_at:new Date().toISOString()
      }).eq("id",1);
      return json(req,{result});
    }

    if(action==="session_probe"){
      const node=await authNode(req);
      if(!node) return json(req,{error:"Agente não autorizado."},401);
      const url=allowedPromaxUrl(body?.url);
      const cookie=String(body?.cookie_header||"");
      if(!cookie || cookie.length>16000) throw new Error("Sessão do Promax ausente ou inválida.");
      const result=await fetchProbe(url,cookie);
      await db.from("promax_direct_state").update({
        last_probe_node_id:node.id,public_reachable:!!result.ok,session_portable:!!result.authenticated,
        authenticated:!!result.authenticated,http_status:result.status,final_host:result.final_host,
        marker:result.marker,last_error:null,last_probe_at:new Date().toISOString(),updated_at:new Date().toISOString()
      }).eq("id",1);
      return json(req,{result:{...result,session_portable:!!result.authenticated}});
    }

    return json(req,{error:"Ação inválida."},400);
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    console.error("promax-direct-api",e);
    return json(req,{error:message},500);
  }
});
