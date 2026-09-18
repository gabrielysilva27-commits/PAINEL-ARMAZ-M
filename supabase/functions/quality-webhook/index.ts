import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, x-quality-webhook-key","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const SOURCE_ID="1vwzUIscoA8TWSMotUhkFnuFcC6fOI1sA9MDnqQQRwRs";
const SHEET_NAME="Respostas ao formulário 1";

function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
function parseBR(value:unknown,withTime=false){
  const s=String(value??"").trim();
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(!m)return null;
  const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]),hh=Number(m[4]||0),mi=Number(m[5]||0),ss=Number(m[6]||0);
  const date=`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  return withTime?{y,date,iso:`${date}T${String(hh).padStart(2,"0")}:${String(mi).padStart(2,"0")}:${String(ss).padStart(2,"0")}-03:00`}:{y,date};
}
function normalizeAuditor(value:unknown){
  const raw=String(value??"").trim().replace(/\s+/g," ");
  const key=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return key==="cintia"?"Cíntia":raw||"Sem identificação";
}
function skuCodes(value:unknown){
  return [...new Set((String(value??"").match(/\d+/g)||[]).filter(x=>x!=="0"))];
}
async function authorized(req:Request){
  const key=req.headers.get("x-quality-webhook-key")||"";
  if(!key)return false;
  const hash=await sha256(key);
  const {data,error}=await db.from("quality_webhook_config").select("secret_hash,active").eq("id","ronda-quality-forms").maybeSingle();
  if(error||!data?.active)return false;
  return hash===data.secret_hash;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  try{
    if(!await authorized(req))return json({error:"Webhook não autorizado"},401);
    const body=await req.json().catch(()=>({}));
    const sourceRow=Number(body.source_row);
    const values=Array.isArray(body.values)?body.values:[];
    if(!Number.isInteger(sourceRow)||sourceRow<2)return json({error:"Linha de origem inválida"},400);
    if(values.length<35)return json({error:"Resposta incompleta: esperadas 35 colunas"},400);

    const submitted=parseBR(values[0],true);
    const round=parseBR(values[2],false);
    if(!round){
      await db.rpc("advance_quality_sync_state",{p_source_id:SOURCE_ID,p_sheet_name:SHEET_NAME,p_row:sourceRow,p_status:`Linha ${sourceRow} ignorada: DATA inválida`,p_error:null});
      return json({ok:true,ignored:true,reason:"DATA inválida"});
    }

    if(round.y!==2026){
      await db.rpc("advance_quality_sync_state",{p_source_id:SOURCE_ID,p_sheet_name:SHEET_NAME,p_row:sourceRow,p_status:`Linha ${sourceRow} recebida fora de 2026`,p_error:null});
      return json({ok:true,ignored:true,reason:"Fora de 2026"});
    }

    const answers:Record<string,boolean>={};
    let anomalyCount=0;
    for(let i=0;i<31;i++){
      const yes=String(values[3+i]??"").trim().toLowerCase()==="sim";
      const key=`q${String(i+1).padStart(2,"0")}`;
      answers[key]=yes;
      if(yes)anomalyCount++;
    }
    const skuText=String(values[34]??"").trim();
    const row={
      source_key:`gforms-ronda-quality:${sourceRow}`,
      source_row:sourceRow,
      submitted_at:submitted?.iso??null,
      round_date:round.date,
      auditor_raw:String(values[1]??"").trim(),
      auditor:normalizeAuditor(values[1]),
      sku_text:skuText,
      sku_codes:skuCodes(skuText),
      answers,
      anomaly_count:anomalyCount,
      total_checks:31,
      submitted_year_mismatch:submitted?submitted.y!==round.y:false,
      imported_at:new Date().toISOString()
    };
    const {error}=await db.from("quality_rounds").upsert(row,{onConflict:"source_key"});
    if(error)throw error;
    await db.rpc("advance_quality_sync_state",{p_source_id:SOURCE_ID,p_sheet_name:SHEET_NAME,p_row:sourceRow,p_status:`Linha ${sourceRow} sincronizada em tempo real`,p_error:null});
    return json({ok:true,source_row:sourceRow,round_date:round.date,anomaly_count:anomalyCount});
  }catch(e){
    const msg=e instanceof Error?e.message:"Erro no webhook";
    console.error(msg);
    return json({error:msg},500);
  }
});