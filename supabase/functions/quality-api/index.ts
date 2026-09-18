import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function requireSession(req:Request){
  const token=req.headers.get("x-session-token")||"";
  if(!token)return null;
  const tokenHash=await sha256(token);
  const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!s)return null;
  const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();
  return u||null;
}
const norm=(s:string)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const monthName=(m:number)=>["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][m]||String(m);
const isoWeek=(date:string)=>{const d=new Date(date+"T12:00:00Z");const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day+3);const first=new Date(Date.UTC(d.getUTCFullYear(),0,4));return 1+Math.round(((d.getTime()-first.getTime())/86400000-3+(first.getUTCDay()+6)%7)/7);};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  try{
    const user=await requireSession(req);
    if(!user)return json({error:"Sessão inválida ou expirada"},401);
    const body=await req.json().catch(()=>({}));
    if(body.action!=="dashboard")return json({error:"Ação inválida"},400);

    const year=2026;
    const month=String(body.month||"all");
    const auditor=String(body.auditor||"").trim();
    if(month!=="all"&&!/^(0[1-9]|1[0-2])$/.test(month))return json({error:"Mês inválido"},400);

    const {data:questions,error:qErr}=await db.from("quality_questions").select("question_key,position,label").eq("active",true).order("position");
    if(qErr)throw qErr;

    let base=db.from("quality_rounds").select("id,round_date,auditor,sku_codes,sku_text,answers,anomaly_count,total_checks,submitted_year_mismatch,imported_at").gte("round_date","2026-01-01").lte("round_date","2026-12-31").order("round_date",{ascending:false}).order("id",{ascending:false});
    if(month!=="all"){
      const mm=Number(month),start=`2026-${month}-01`;
      const next=mm===12?"2027-01-01":`2026-${String(mm+1).padStart(2,"0")}-01`;
      base=base.gte("round_date",start).lt("round_date",next);
    }
    if(auditor)base=base.eq("auditor",auditor);
    const {data:rows,error}=await base;
    if(error)throw error;

    const {data:allAuditors,error:aErr}=await db.from("quality_rounds").select("auditor").gte("round_date","2026-01-01").lte("round_date","2026-12-31");
    if(aErr)throw aErr;
    const auditors=[...new Set((allAuditors||[]).map((r:any)=>r.auditor).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"pt-BR"));

    const qByKey=new Map((questions||[]).map((q:any)=>[q.question_key,q]));
    const qAgg=new Map<string,{label:string,count:number}>();
    const people=new Map<string,{rounds:number,anomalies:number,checks:number}>();
    const sku=new Map<string,number>();
    const trend=new Map<string,{label:string,rounds:number,anomalies:number,checks:number}>();
    let anomalyFlags=0,checks=0,anomalyRounds=0,mismatch=0;
    const history:any[]=[];

    for(const r of rows||[]){
      const a=Number(r.anomaly_count||0),t=Number(r.total_checks||0);
      anomalyFlags+=a;checks+=t;if(a>0)anomalyRounds++;if(r.submitted_year_mismatch)mismatch++;
      const p=people.get(r.auditor)||{rounds:0,anomalies:0,checks:0};p.rounds++;p.anomalies+=a;p.checks+=t;people.set(r.auditor,p);
      for(const c of r.sku_codes||[])sku.set(String(c),(sku.get(String(c))||0)+1);
      for(const [key,val] of Object.entries(r.answers||{})){
        if(!val)continue;const q=qByKey.get(key);if(!q)continue;const nk=norm(q.label);const cur=qAgg.get(nk)||{label:q.label,count:0};cur.count++;qAgg.set(nk,cur);
      }
      const d=String(r.round_date);
      const date=new Date(d+"T12:00:00Z");
      let tk:string,tl:string;
      if(month==="all"){tk=d.slice(0,7);tl=monthName(date.getUTCMonth()+1);}
      else{const w=isoWeek(d);tk=`2026-W${String(w).padStart(2,"0")}`;tl=`Sem ${w}`;}
      const tr=trend.get(tk)||{label:tl,rounds:0,anomalies:0,checks:0};tr.rounds++;tr.anomalies+=a;tr.checks+=t;trend.set(tk,tr);

      if(history.length<25){
        const anomalies:string[]=[];
        for(const [key,val] of Object.entries(r.answers||{}))if(val&&qByKey.get(key))anomalies.push(qByKey.get(key).label);
        history.push({id:r.id,date:d,auditor:r.auditor,compliance:t?1-a/t:null,anomaly_count:a,sku_codes:r.sku_codes||[],sku_text:r.sku_text||"",anomalies});
      }
    }
    const uniqueSku=[...sku.keys()].length;
    const topQuestions=[...qAgg.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,"pt-BR")).slice(0,10);
    const topSkus=[...sku.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"pt-BR",{numeric:true})).slice(0,10).map(([code,count])=>({code,count}));
    const byPerson=[...people.entries()].map(([name,v])=>({name,...v,compliance:v.checks?1-v.anomalies/v.checks:null})).sort((a,b)=>b.rounds-a.rounds);
    const trendData=[...trend.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([key,v])=>({key,...v,compliance:v.checks?1-v.anomalies/v.checks:null}));

    return json({
      filters:{year,month,auditor,auditors},
      summary:{rounds:(rows||[]).length,anomaly_rounds:anomalyRounds,anomaly_flags:anomalyFlags,compliance:checks?1-anomalyFlags/checks:null,unique_skus:uniqueSku,timestamp_mismatch:mismatch},
      trend:trendData,
      top_questions:topQuestions,
      top_skus:topSkus,
      by_person:byPerson,
      history,
      source:{form:"RONDA DE QUALIDADE",sheet:"RONDA DE QUALIDADE (respostas)",latest_import:(rows||[])[0]?.imported_at||null}
    });
  }catch(e){
    console.error(e);
    return json({error:e instanceof Error?e.message:"Erro ao carregar Ronda de Qualidade"},400);
  }
});