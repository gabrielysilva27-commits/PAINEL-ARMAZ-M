import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function requireSession(req:Request){
  const token=req.headers.get("x-session-token")||"";if(!token)return null;
  const tokenHash=await sha256(token);
  const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!s)return null;
  const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();
  return u||null;
}
const monthName=(m:number)=>["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][m]||String(m);
const isoWeek=(date:string)=>{const d=new Date(date+"T12:00:00Z");const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day+3);const first=new Date(Date.UTC(d.getUTCFullYear(),0,4));return 1+Math.round(((d.getTime()-first.getTime())/86400000-3+(first.getUTCDay()+6)%7)/7);};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  try{
    const user=await requireSession(req);if(!user)return json({error:"Sessão inválida ou expirada"},401);
    const body=await req.json().catch(()=>({}));
    if(body.action!=="dashboard")return json({error:"Ação inválida"},400);

    const month=String(body.month||"all"),checker=String(body.checker||"").trim(),origin=String(body.origin||"").trim();
    if(month!=="all"&&!/^(0[1-9]|1[0-2])$/.test(month))return json({error:"Mês inválido"},400);

    let q=db.from("receiving_quality_checks").select("id,received_date,checker,driver,origin,sku_codes,sku_text,binary_nonconformity_count,binary_checks_answered,nonconformity_categories,has_nonconformity,other_nonconformity,post_unload_damage,submitted_year_mismatch,imported_at").gte("received_date","2026-01-01").lte("received_date","2026-12-31").order("received_date",{ascending:false}).order("id",{ascending:false});
    if(month!=="all"){
      const mm=Number(month),start=`2026-${month}-01`,next=mm===12?"2027-01-01":`2026-${String(mm+1).padStart(2,"0")}-01`;
      q=q.gte("received_date",start).lt("received_date",next);
    }
    if(checker)q=q.eq("checker",checker);
    if(origin)q=q.eq("origin",origin);
    const {data:rows,error}=await q;if(error)throw error;

    const [{data:people,error:pErr},{data:origins,error:oErr},{data:sync,error:sErr}]=await Promise.all([
      db.from("receiving_quality_checks").select("checker").gte("received_date","2026-01-01").lte("received_date","2026-12-31"),
      db.from("receiving_quality_checks").select("origin").gte("received_date","2026-01-01").lte("received_date","2026-12-31"),
      db.from("receiving_quality_sync_state").select("last_source_row,last_synced_at,last_status,last_error").eq("source_id","1cZ3-elTqS4sFTXDiB5vGXDamt-E_XRdOGg_mC959M9w").maybeSingle()
    ]);if(pErr)throw pErr;if(oErr)throw oErr;if(sErr)throw sErr;
    const checkers=[...new Set((people||[]).map((r:any)=>r.checker).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"pt-BR"));
    const originList=[...new Set((origins||[]).map((r:any)=>r.origin).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"pt-BR"));

    let checks=0,binaryNc=0,ncReceipts=0,mismatch=0;
    const trend=new Map<string,{label:string,receipts:number,checks:number,nc:number,nc_receipts:number}>();
    const category=new Map<string,number>();
    const sku=new Map<string,number>();
    const byChecker=new Map<string,{receipts:number,checks:number,nc:number,nc_receipts:number}>();
    const byOrigin=new Map<string,{receipts:number,checks:number,nc:number,nc_receipts:number}>();
    const byDriver=new Map<string,{receipts:number,nc_receipts:number}>();
    const history:any[]=[];

    for(const r of rows||[]){
      const c=Number(r.binary_checks_answered||0),n=Number(r.binary_nonconformity_count||0),has=!!r.has_nonconformity;
      checks+=c;binaryNc+=n;if(has)ncReceipts++;if(r.submitted_year_mismatch)mismatch++;
      for(const x of new Set(r.nonconformity_categories||[]))category.set(String(x),(category.get(String(x))||0)+1);
      if(has)for(const x of new Set(r.sku_codes||[]))sku.set(String(x),(sku.get(String(x))||0)+1);

      const pc=byChecker.get(r.checker)||{receipts:0,checks:0,nc:0,nc_receipts:0};pc.receipts++;pc.checks+=c;pc.nc+=n;if(has)pc.nc_receipts++;byChecker.set(r.checker,pc);
      const po=byOrigin.get(r.origin)||{receipts:0,checks:0,nc:0,nc_receipts:0};po.receipts++;po.checks+=c;po.nc+=n;if(has)po.nc_receipts++;byOrigin.set(r.origin,po);
      const pd=byDriver.get(r.driver)||{receipts:0,nc_receipts:0};pd.receipts++;if(has)pd.nc_receipts++;byDriver.set(r.driver,pd);

      const d=String(r.received_date),date=new Date(d+"T12:00:00Z");
      let key:string,label:string;
      if(month==="all"){key=d.slice(0,7);label=monthName(date.getUTCMonth()+1);}else{const w=isoWeek(d);key=`2026-W${String(w).padStart(2,"0")}`;label=`Sem ${w}`;}
      const t=trend.get(key)||{label,receipts:0,checks:0,nc:0,nc_receipts:0};t.receipts++;t.checks+=c;t.nc+=n;if(has)t.nc_receipts++;trend.set(key,t);

      if(history.length<30)history.push({
        id:r.id,date:d,checker:r.checker,driver:r.driver,origin:r.origin,
        compliance:c?1-n/c:null,has_nonconformity:has,binary_nc:n,
        sku_codes:r.sku_codes||[],sku_text:r.sku_text||"",categories:r.nonconformity_categories||[],
        other_nonconformity:r.other_nonconformity||"",post_unload_damage:r.post_unload_damage||""
      });
    }

    const topSkuEntries=[...sku.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"pt-BR",{numeric:true})).slice(0,10);
    let catalog:any[]=[];
    if(topSkuEntries.length){
      const {data,error}=await db.from("product_catalog").select("sku_code,sku_name").in("sku_code",topSkuEntries.map(x=>x[0]));if(error)throw error;catalog=data||[];
    }
    const nameByCode=new Map(catalog.map((x:any)=>[String(x.sku_code),x.sku_name]));
    const topSkus=topSkuEntries.map(([code,count],i)=>({rank:i+1,code,count,name:nameByCode.get(code)||""}));
    const topCategories=[...category.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"pt-BR")).slice(0,10).map(([label,count])=>({label,count}));
    const checkerData=[...byChecker.entries()].map(([name,v])=>({name,...v,compliance:v.checks?1-v.nc/v.checks:null,nc_rate:v.receipts?v.nc_receipts/v.receipts:null})).sort((a,b)=>b.receipts-a.receipts);
    const originData=[...byOrigin.entries()].map(([name,v])=>({name,...v,compliance:v.checks?1-v.nc/v.checks:null,nc_rate:v.receipts?v.nc_receipts/v.receipts:null})).sort((a,b)=>b.receipts-a.receipts);
    const driverData=[...byDriver.entries()].filter(([name])=>name).map(([name,v])=>({name,...v,nc_rate:v.receipts?v.nc_receipts/v.receipts:null})).sort((a,b)=>b.nc_receipts-a.nc_receipts||b.receipts-a.receipts).slice(0,10);
    const trendData=[...trend.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([key,v])=>({key,...v,compliance:v.checks?1-v.nc/v.checks:null,nc_rate:v.receipts?v.nc_receipts/v.receipts:null}));

    return json({
      filters:{year:2026,month,checker,origin,checkers,origins:originList},
      summary:{receipts:(rows||[]).length,nc_receipts:ncReceipts,binary_nonconformities:binaryNc,compliance:checks?1-binaryNc/checks:null,unique_nc_skus:sku.size,timestamp_mismatch:mismatch},
      trend:trendData,top_categories:topCategories,top_skus:topSkus,by_checker:checkerData,by_origin:originData,top_drivers:driverData,history,
      sync:sync||null,
      source:{form:"CHECK QUALIDADE DE RECEBIMENTO PUXADA",sheet:"CHECK QUALIDADE DE RECEBIMENTO PUXADA (respostas)"}
    });
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Erro ao carregar Qualidade do Recebimento"},500);}
});