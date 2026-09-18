import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, x-receiving-quality-key","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const SOURCE_ID="1cZ3-elTqS4sFTXDiB5vGXDamt-E_XRdOGg_mC959M9w";
const SHEET_NAME="Respostas ao formulário 1";

function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
const clean=(v:unknown)=>String(v??"").trim().replace(/\s+/g," ");
const norm=(v:unknown)=>clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const yes=(v:unknown)=>norm(v)==="sim";
const no=(v:unknown)=>norm(v)==="nao";
function parseBR(value:unknown,withTime=false){
  const m=clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(!m)return null;
  const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]),hh=Number(m[4]||0),mi=Number(m[5]||0),ss=Number(m[6]||0);
  const date=`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  return withTime?{y,date,iso:`${date}T${String(hh).padStart(2,"0")}:${String(mi).padStart(2,"0")}:${String(ss).padStart(2,"0")}-03:00`}:{y,date};
}
function normalizeChecker(value:unknown){
  const raw=clean(value),key=norm(raw);
  const map:Record<string,string>={cintia:"Cíntia",ruan:"Ruan",marques:"Marques",tiago:"Tiago",alex:"Alex",gabriel:"Gabriel",leandro:"Leandro"};
  return map[key]||raw||"Sem identificação";
}
function meaningful(value:unknown){
  const x=norm(value);
  return !!x&&!["0","n/a","na","ok","on","oo","pk","-"].includes(x);
}
function addTextCategories(set:Set<string>,value:unknown){
  const x=norm(value);if(!meaningful(value))return;
  if(x.includes("vaz"))set.add("Vazamento");
  if(x.includes("quebrad")||x.includes("sem toco"))set.add("Palete quebrado / sem toco");
  if(x.includes("adernad")||x.includes("inclin"))set.add("Carga adernada / inclinada");
  if(x.includes("mal formado"))set.add("Palete mal formado");
  if(x.includes("falta"))set.add("Falta de produto");
  if(x.includes("trocad"))set.add("Palete trocado");
  const known=["vaz","quebrad","sem toco","adernad","inclin","mal formado","falta","trocad"];
  if(!known.some(k=>x.includes(k)))set.add("Outras não conformidades");
}
function skuCodes(values:any[]){
  const joined=[values[14],values[22],values[23]].map(clean).join(" ");
  return [...new Set((joined.match(/\d+/g)||[]).filter(x=>x!=="0"))];
}
function skuText(values:any[]){return [values[14],values[22],values[23]].map(clean).filter(Boolean).join(" | ");}
function transform(item:any){
  const sourceRow=Number(item?.source_row),values=Array.isArray(item?.values)?item.values:[];
  if(!Number.isInteger(sourceRow)||sourceRow<2||values.length<24)return {sourceRow,ignored:true,reason:"Linha inválida"};
  const received=parseBR(values[2],false),submitted=parseBR(values[0],true);
  if(!received)return {sourceRow,ignored:true,reason:"Data de recebimento inválida"};
  if(received.y!==2026)return {sourceRow,ignored:true,reason:"Fora de 2026"};
  const answers:Record<string,string|null>={};let bad=0,answered=0;const cats=new Set<string>();
  const rules:[number,string,string,"no"|"yes"][]=[
    [5,"q01","Carga adernada / inclinada","no"],
    [6,"q02","Odor na carga","no"],
    [7,"q03","Filmagem incompleta","no"],
    [8,"q04","Vazamento","no"],
    [9,"q05","Embalagem secundária danificada","no"],
    [10,"q06","Tipo de palete incorreto","no"],
    [11,"q07","Palete em condição inadequada","no"],
    [12,"q08","Falta de produto","yes"],
    [15,"q09","Assoalho / conservação inadequada","no"],
    [16,"q10","Objeto pontiagudo","no"],
    [17,"q11","Logomarca de concorrente","no"],
    [18,"q12","Espinha dorsal sem revestimento","no"],
    [19,"q13","Cabos / cordas danificados","no"],
    [20,"q14","Lona com furo / rasgo","no"]
  ];
  for(const [idx,key,label,dir] of rules){
    const raw=clean(values[idx]);answers[key]=raw||null;
    if(raw){answered++;const fail=dir==="no"?no(raw):yes(raw);if(fail){bad++;cats.add(label);}}
  }
  addTextCategories(cats,values[13]);addTextCategories(cats,values[21]);
  return {
    sourceRow,ignored:false,row:{
      source_key:`gforms-receiving-quality:${sourceRow}`,source_row:sourceRow,
      submitted_at:submitted?.iso??null,received_date:received.date,
      checker_raw:clean(values[1]),checker:normalizeChecker(values[1]),driver:clean(values[3]),origin:clean(values[4]),
      answers,other_nonconformity:clean(values[13]),post_unload_damage:clean(values[21]),
      sku_text:skuText(values),sku_codes:skuCodes(values),
      binary_nonconformity_count:bad,binary_checks_answered:answered,
      damage_count:bad+(meaningful(values[13])?1:0)+(meaningful(values[21])?1:0),
      nonconformity_categories:[...cats],has_nonconformity:cats.size>0,
      submitted_year_mismatch:submitted?submitted.y!==received.y:false,imported_at:new Date().toISOString()
    }
  };
}
async function authorized(req:Request){
  const key=req.headers.get("x-receiving-quality-key")||"";if(!key)return false;
  const hash=await sha256(key);
  const {data,error}=await db.from("receiving_quality_webhook_config").select("secret_hash,active").eq("id","receiving-quality-forms").maybeSingle();
  return !error&&!!data?.active&&hash===data.secret_hash;
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  try{
    if(!await authorized(req))return json({error:"Webhook não autorizado"},401);
    const body=await req.json().catch(()=>({}));
    const items=Array.isArray(body.rows)?body.rows:[{source_row:body.source_row,values:body.values}];
    if(!items.length||items.length>100)return json({error:"Envie entre 1 e 100 linhas por chamada"},400);
    const transformed=items.map(transform);
    const rows=transformed.filter((x:any)=>!x.ignored).map((x:any)=>x.row);
    const maxRow=Math.max(...transformed.map((x:any)=>Number(x.sourceRow)||1),1);
    if(rows.length){
      const {error}=await db.from("receiving_quality_checks").upsert(rows,{onConflict:"source_key"});
      if(error)throw error;
    }
    const ignored=transformed.length-rows.length;
    await db.rpc("advance_receiving_quality_sync_state",{p_source_id:SOURCE_ID,p_sheet_name:SHEET_NAME,p_row:maxRow,p_status:`${rows.length} linha(s) 2026 sincronizada(s), ${ignored} ignorada(s)`,p_error:null});
    return json({ok:true,received:items.length,imported:rows.length,ignored,max_source_row:maxRow});
  }catch(e){
    const msg=e instanceof Error?e.message:"Erro no webhook";console.error(msg);
    return json({error:msg},500);
  }
});