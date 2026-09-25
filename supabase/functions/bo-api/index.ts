import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import {
  LOCATIONS, MOVEMENT_TYPES, REASONS, RESPONSIBILITIES, SHIFTS,
  cleanText, isValidator, normalizeCode, normalizeMatch, validateOccurrenceInput, weekOfMonth,
} from "./bo-core.mjs";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const PUBLIC_ORIGIN="https://painel-armaz-m.gabrielysilva27.workers.dev";
const PIN_ITERATIONS=200000;
const PIN_SESSION_HOURS=8;
const MAX_PIN_ATTEMPTS=5;
const LOCK_MINUTES=15;

function responseHeaders(req:Request){
  const origin=req.headers.get("origin");
  const allowed=origin===PUBLIC_ORIGIN||origin?.startsWith("http://localhost:")||origin?.startsWith("http://127.0.0.1:")?origin:PUBLIC_ORIGIN;
  return {
    "Access-Control-Allow-Origin":allowed,
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token, x-bo-token",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Vary":"Origin",
    "X-Content-Type-Options":"nosniff",
  };
}
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:responseHeaders(req)});

function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function decodeB64url(s:string){const p=s.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((s.length+3)%4);return Uint8Array.from(atob(p),c=>c.charCodeAt(0));}
function randomToken(size=32){return b64url(crypto.getRandomValues(new Uint8Array(size)));}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function pbkdf2(secret:string,salt:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:decodeB64url(salt),iterations:PIN_ITERATIONS},key,256);
  return b64url(new Uint8Array(bits));
}
function constantTimeEqual(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
async function pinRecord(pin:string){const salt=randomToken(16);return{pin_salt:salt,pin_hash:`pbkdf2-sha256$${PIN_ITERATIONS}$${await pbkdf2(pin,salt)}`,pin_updated_at:new Date().toISOString(),failed_attempts:0,locked_until:null,updated_at:new Date().toISOString()};}
async function verifyPin(pin:string,row:any){
  if(!row?.pin_hash?.startsWith("pbkdf2-sha256$")||!row.pin_salt)return false;
  const [,iterations,expected]=String(row.pin_hash).split("$");
  if(Number(iterations)!==PIN_ITERATIONS||!expected)return false;
  return constantTimeEqual(expected,await pbkdf2(pin,row.pin_salt));
}

async function readBody(req:Request){
  const declared=Number(req.headers.get("content-length")||0);if(declared>250000)throw new Error("Solicitação muito grande.");
  const text=await req.text();if(text.length>250000)throw new Error("Solicitação muito grande.");
  const body=JSON.parse(text||"{}");if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Solicitação inválida.");return body;
}

async function requireAppUser(req:Request){
  const token=req.headers.get("x-session-token")||"";if(!token)return null;
  const {data:session}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",await sha256(token)).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!session)return null;
  const {data:user}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",session.user_id).eq("active",true).maybeSingle();
  return user||null;
}

async function requireBoSession(req:Request){
  const token=req.headers.get("x-bo-token")||"";if(!token)return null;
  const {data:session}=await db.from("bo_conferencer_sessions").select("id,conferencer_id,expires_at").eq("token_hash",await sha256(token)).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!session)return null;
  const {data:conferencer}=await db.from("bo_conferencers").select("id,display_name,active").eq("id",session.conferencer_id).eq("active",true).maybeSingle();
  return conferencer?{...conferencer,session_id:session.id}:null;
}

function randomPin(){const value=crypto.getRandomValues(new Uint32Array(1))[0];return String(100000+(value%900000));}
function boNumber(date:string){return `BO-${date.replace(/-/g,"")}-${randomToken(5).replace(/[^A-Z0-9]/gi,"").slice(0,6).toUpperCase().padEnd(6,"X")}`;}
function safeSearch(value:unknown,max=80){return cleanText(value,max).replace(/[%_*,()]/g," ").replace(/\s+/g," ").trim();}
function situationFromReason(reason:string){
  const r=normalizeMatch(reason);
  if(r==="falta")return "Falta";
  if(r==="vencido")return "Validade";
  if(r==="consumo interno")return "Consumo";
  if(r.startsWith("quebra ao "))return "Quebra";
  if(r.includes("liq pela metade")||r.includes("sem tampa"))return "Liq. pela metade";
  if(r==="descarte repack")return "Descarte";
  return "Avariada";
}

async function catalogForCodes(codes:string[]){
  const unique=[...new Set(codes.map(normalizeCode))];
  const {data,error}=await db.from("product_catalog").select("sku_code,sku_name,factor_hecto,factor_hecto_commercial,average_cost").in("sku_code",unique);
  if(error)throw error;
  const byCode=new Map((data||[]).map((row:any)=>[String(row.sku_code),row]));
  const missing=unique.filter(code=>!byCode.has(code));
  if(missing.length)throw new Error(`Código não encontrado no 01.11: ${missing.join(", ")}.`);
  return byCode;
}

function itemRecords(occurrenceId:number,input:any,catalog:Map<string,any>){
  return input.items.map((item:any,index:number)=>{const product=catalog.get(item.sku_code);return{
    occurrence_id:occurrenceId,line_no:index+1,sku_code:item.sku_code,sku_name:String(product.sku_name||""),
    total_qty:item.total_qty,repacked_qty:item.repacked_qty,discarded_qty:item.discarded_qty,
    factor_hecto:product.factor_hecto==null?null:Number(product.factor_hecto),
    factor_hecto_commercial:product.factor_hecto_commercial==null?null:Number(product.factor_hecto_commercial),
    average_cost:product.average_cost==null?null:Number(product.average_cost),
    invoice_number:item.invoice_number,lot_number:item.lot_number,expiry_date:item.expiry_date,
  };});
}

async function createOccurrence(conferencer:any,body:any){
  const input=validateOccurrenceInput(body?.occurrence);
  const catalog=await catalogForCodes(input.items.map((x:any)=>x.sku_code));
  const header={
    bo_number:boNumber(input.occurrence_date),conferencer_id:conferencer.id,
    occurrence_date:input.occurrence_date,occurrence_time:input.occurrence_time,shift:input.shift,
    movement_type:input.movement_type,location:input.location,subject_type:input.subject_type,factory_name:input.factory_name,
    employee_name:input.employee_name,employee_function:input.employee_function,reason:input.reason,responsibility:input.responsibility,
    comments:input.comments,interview_report:input.interview_report,status:"pending",
    record_kind:input.shift==="C"?"turn_c_origin":"standard",
    confront_state:input.shift==="C"?"awaiting":null,
    source_occurrence_id:null,
    updated_at:new Date().toISOString(),
  };
  const {data:created,error}=await db.from("bo_occurrences").insert(header).select("id,bo_number,status,submitted_at").single();
  if(error)throw error;
  const {error:itemError}=await db.from("bo_occurrence_items").insert(itemRecords(Number(created.id),input,catalog));
  if(itemError){await db.from("bo_occurrences").delete().eq("id",created.id);throw itemError;}
  return created;
}

const occurrenceSelect="id,bo_number,occurrence_date,occurrence_time,shift,movement_type,location,subject_type,factory_name,employee_name,employee_function,reason,responsibility,comments,interview_report,status,revision,validation_comment,validated_at,cancelled_at,submitted_at,updated_at,record_kind,source_occurrence_id,confront_state,conferencer:bo_conferencers(display_name),validator:app_users(display_name,username),items:bo_occurrence_items(id,line_no,sku_code,sku_name,total_qty,repacked_qty,discarded_qty,factor_hecto,factor_hecto_commercial,average_cost,invoice_number,lot_number,expiry_date)";

async function hydrateSources(rows:any[]){
  const ids=[...new Set((rows||[]).map((r:any)=>Number(r.source_occurrence_id)).filter((id:number)=>Number.isInteger(id)&&id>0))];
  if(!ids.length)return rows||[];
  const {data,error}=await db.from("bo_occurrences").select("id,bo_number,shift,record_kind,confront_state,status").in("id",ids);
  if(error)throw error;
  const byId=new Map((data||[]).map((r:any)=>[Number(r.id),r]));
  return (rows||[]).map((r:any)=>({...r,source:r.source_occurrence_id?byId.get(Number(r.source_occurrence_id))||null:null}));
}

async function myOccurrences(conferencer:any){
  const {data,error}=await db.from("bo_occurrences").select(occurrenceSelect).eq("conferencer_id",conferencer.id).order("submitted_at",{ascending:false}).limit(100);
  if(error)throw error;return await hydrateSources(data||[]);
}
async function confrontQueue(){
  const {data,error}=await db.from("bo_occurrences")
    .select(occurrenceSelect)
    .eq("record_kind","turn_c_origin")
    .eq("confront_state","awaiting")
    .neq("status","cancelled")
    .order("occurrence_date",{ascending:true})
    .order("id",{ascending:true})
    .limit(200);
  if(error)throw error;return await hydrateSources(data||[]);
}

async function createConfrontation(conferencer:any,body:any){
  const sourceId=Number(body?.source_id);if(!Number.isInteger(sourceId)||sourceId<=0)throw new Error("B.O. de origem inválido.");
  const {data:source,error:se}=await db.from("bo_occurrences")
    .select("*,items:bo_occurrence_items(*)")
    .eq("id",sourceId).eq("record_kind","turn_c_origin").neq("status","cancelled").maybeSingle();
  if(se)throw se;if(!source)throw new Error("B.O. do Turno C não encontrado.");
  if(source.confront_state==="completed")throw new Error("Este B.O. do Turno C já possui confronto do Turno A.");

  const input=validateOccurrenceInput(body?.occurrence);
  if(input.shift!=="A")throw new Error("O confronto oficial deve ser registrado pelo Turno A.");
  const catalog=await catalogForCodes(input.items.map((x:any)=>x.sku_code));
  const {data:existing,error:ee}=await db.from("bo_occurrences").select("id,bo_number,status")
    .eq("source_occurrence_id",sourceId).eq("record_kind","turn_a_confront").neq("status","cancelled").maybeSingle();
  if(ee)throw ee;if(existing)throw new Error("Este B.O. já possui confronto ativo: "+existing.bo_number+".");

  const header={
    bo_number:boNumber(input.occurrence_date),conferencer_id:conferencer.id,
    occurrence_date:input.occurrence_date,occurrence_time:input.occurrence_time,shift:"A",
    movement_type:input.movement_type,location:input.location,subject_type:input.subject_type,factory_name:input.factory_name,
    employee_name:input.employee_name,employee_function:input.employee_function,reason:input.reason,responsibility:input.responsibility,
    comments:input.comments,interview_report:input.interview_report,status:"pending",
    record_kind:"turn_a_confront",source_occurrence_id:sourceId,confront_state:null,updated_at:new Date().toISOString(),
  };
  const {data:created,error}=await db.from("bo_occurrences").insert(header).select("id,bo_number,status,submitted_at,record_kind,source_occurrence_id").single();
  if(error){
    if(error.code==="23505")throw new Error("Este B.O. do Turno C já foi assumido para confronto.");
    throw error;
  }
  const {error:itemError}=await db.from("bo_occurrence_items").insert(itemRecords(Number(created.id),input,catalog));
  if(itemError){await db.from("bo_occurrences").delete().eq("id",created.id);throw itemError;}
  const {data:sourceUpdated,error:ue}=await db.from("bo_occurrences")
    .update({confront_state:"completed",updated_at:new Date().toISOString()})
    .eq("id",sourceId).eq("record_kind","turn_c_origin").eq("confront_state","awaiting")
    .select("id").maybeSingle();
  if(ue||!sourceUpdated){
    await db.from("bo_occurrences").delete().eq("id",created.id);
    if(ue)throw ue;
    throw new Error("O B.O. do Turno C foi alterado enquanto o confronto era salvo. Atualize a fila e tente novamente.");
  }
  return created;
}

async function updateOccurrence(conferencer:any,body:any){
  const id=Number(body?.id);if(!Number.isInteger(id)||id<=0)throw new Error("B.O. inválido.");
  const {data:old,error:oldError}=await db.from("bo_occurrences").select("*,items:bo_occurrence_items(*)").eq("id",id).eq("conferencer_id",conferencer.id).in("status",["pending","returned"]).maybeSingle();
  if(oldError)throw oldError;if(!old)throw new Error("Este B.O. não pode mais ser editado.");
  if(old.record_kind==="turn_c_origin"&&old.confront_state==="completed")throw new Error("O B.O. do Turno C já foi confrontado e não pode mais ser alterado.");
  const input=validateOccurrenceInput(body?.occurrence);
  if(old.record_kind==="turn_a_confront"&&input.shift!=="A")throw new Error("O confronto oficial deve permanecer no Turno A.");
  const catalog=await catalogForCodes(input.items.map((x:any)=>x.sku_code));
  const nextKind=old.record_kind==="turn_a_confront"?"turn_a_confront":(input.shift==="C"?"turn_c_origin":"standard");
  const nextConfront=nextKind==="turn_c_origin"?(old.record_kind==="turn_c_origin"?(old.confront_state||"awaiting"):"awaiting"):null;
  const update={
    occurrence_date:input.occurrence_date,occurrence_time:input.occurrence_time,shift:old.record_kind==="turn_a_confront"?"A":input.shift,movement_type:input.movement_type,
    location:input.location,subject_type:input.subject_type,factory_name:input.factory_name,employee_name:input.employee_name,employee_function:input.employee_function,reason:input.reason,
    responsibility:input.responsibility,comments:input.comments,interview_report:input.interview_report,status:"pending",
    record_kind:nextKind,confront_state:nextConfront,source_occurrence_id:old.record_kind==="turn_a_confront"?old.source_occurrence_id:null,
    revision:Number(old.revision||1)+1,validation_comment:null,validated_by:null,validated_at:null,cancelled_at:null,updated_at:new Date().toISOString(),
  };
  const {data:updated,error:updateError}=await db.from("bo_occurrences").update(update).eq("id",id).eq("status",old.status).select("id,bo_number,status,revision,submitted_at").maybeSingle();
  if(updateError)throw updateError;if(!updated)throw new Error("O B.O. foi alterado enquanto você editava. Atualize o histórico e tente novamente.");
  const {error:deleteError}=await db.from("bo_occurrence_items").delete().eq("occurrence_id",id);if(deleteError)throw deleteError;
  const {error:itemError}=await db.from("bo_occurrence_items").insert(itemRecords(id,input,catalog));
  if(itemError){
    const restore=(old.items||[]).map(({id:_id,created_at:_created,...item}:any)=>item);
    if(restore.length)await db.from("bo_occurrence_items").insert(restore);
    throw itemError;
  }
  return updated;
}

async function cancelOccurrence(conferencer:any,body:any){
  const id=Number(body?.id);if(!Number.isInteger(id)||id<=0)throw new Error("B.O. inválido.");
  const {data:old,error:oe}=await db.from("bo_occurrences").select("id,record_kind,source_occurrence_id,confront_state").eq("id",id).eq("conferencer_id",conferencer.id).maybeSingle();
  if(oe)throw oe;if(!old)throw new Error("B.O. não encontrado.");
  if(old.record_kind==="turn_c_origin"&&old.confront_state==="completed")throw new Error("O registro do Turno C já foi confrontado e deve permanecer no histórico.");
  const now=new Date().toISOString();
  const {data,error}=await db.from("bo_occurrences").update({status:"cancelled",cancelled_at:now,updated_at:now})
    .eq("id",id).eq("conferencer_id",conferencer.id).in("status",["pending","returned"])
    .select("id,bo_number,status,cancelled_at,record_kind,source_occurrence_id").maybeSingle();
  if(error)throw error;if(!data)throw new Error("Este B.O. não pode mais ser excluído.");
  if(old.record_kind==="turn_a_confront"&&old.source_occurrence_id){
    await db.from("bo_occurrences").update({confront_state:"awaiting",updated_at:now}).eq("id",old.source_occurrence_id).eq("record_kind","turn_c_origin");
  }
  return data;
}

async function dashboard(body:any){
  let query=db.from("bo_occurrences").select(occurrenceSelect).order("occurrence_date",{ascending:false}).order("id",{ascending:false}).limit(500);
  const status=String(body?.status||"all");if(["pending","validated","returned","cancelled"].includes(status))query=query.eq("status",status);
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(body?.from||"")))query=query.gte("occurrence_date",body.from);
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(body?.to||"")))query=query.lte("occurrence_date",body.to);
  const {data,error}=await query;if(error)throw error;
  const search=normalizeMatch(body?.search||"");
  const rows=search?(data||[]).filter((row:any)=>normalizeMatch([row.bo_number,row.subject_type,row.factory_name,row.employee_name,row.employee_function,row.reason,row.location,row.conferencer?.display_name,...(row.items||[]).flatMap((x:any)=>[x.sku_code,x.sku_name])].join(" ")).includes(search)):(data||[]);
  const counts={pending:0,validated:0,returned:0};for(const row of data||[]){if(row.record_kind==="turn_c_origin")continue;if(row.status in counts)(counts as any)[row.status]++;}
  return{occurrences:await hydrateSources(rows),counts};
}

async function reviewOccurrence(user:any,body:any){
  const id=Number(body?.id),decision=String(body?.decision||"");
  if(!Number.isInteger(id)||id<=0||!["validated","returned"].includes(decision))throw new Error("Decisão inválida.");
  const {data:row,error:re}=await db.from("bo_occurrences").select("id,record_kind").eq("id",id).maybeSingle();
  if(re)throw re;if(!row)throw new Error("B.O. não encontrado.");
  if(row.record_kind==="turn_c_origin")throw new Error("O B.O. do Turno C é registro de origem. Valide apenas o confronto oficial do Turno A.");
  const comment=cleanText(body?.comment,2000);
  if(decision==="returned"&&!comment)throw new Error("Informe o motivo da devolução.");
  const values={status:decision,validation_comment:comment||null,validated_by:user.id,validated_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const {data,error}=await db.from("bo_occurrences").update(values).eq("id",id).eq("status","pending").select("id,bo_number,status").maybeSingle();
  if(error)throw error;if(!data)throw new Error("O B.O. já foi tratado ou não existe.");return data;
}

async function bulkValidateOccurrences(user:any,body:any){
  const ids=[...new Set((Array.isArray(body?.ids)?body.ids:[]).map((x:any)=>Number(x)).filter((id:number)=>Number.isInteger(id)&&id>0))].slice(0,500);
  if(!ids.length)throw new Error("Selecione ao menos um B.O. para validar.");
  const now=new Date().toISOString();
  const values={status:"validated",validation_comment:null,validated_by:user.id,validated_at:now,updated_at:now};
  const {data,error}=await db.from("bo_occurrences")
    .update(values)
    .in("id",ids)
    .eq("status","pending")
    .neq("record_kind","turn_c_origin")
    .select("id,bo_number,status");
  if(error)throw error;
  const validated=data||[];
  return{validated,validated_count:validated.length,skipped_count:Math.max(0,ids.length-validated.length)};
}

async function validatedForExport(body:any){
  const all:any[]=[];
  for(let from=0;;from+=500){
    let query=db.from("bo_occurrences").select(occurrenceSelect).eq("status","validated").neq("record_kind","turn_c_origin").order("occurrence_date",{ascending:true}).order("id",{ascending:true}).range(from,from+499);
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(body?.from||"")))query=query.gte("occurrence_date",body.from);
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(body?.to||"")))query=query.lte("occurrence_date",body.to);
    const {data,error}=await query;if(error)throw error;all.push(...(data||[]));if((data||[]).length<500)break;
  }
  const pa:any[]=[],daily:any[]=[];
  for(const row of all)for(const item of row.items||[]){
    const qty=Number(item.total_qty||0),factor=item.factor_hecto==null||item.factor_hecto_commercial==null?null:Number(item.factor_hecto)*Number(item.factor_hecto_commercial),cost=item.average_cost==null?null:Number(item.average_cost);
    const validator=row.validator?.display_name||row.validator?.username||"";
    const subjectType=row.subject_type||"Funcionário";
    const subjectName=subjectType==="Funcionário"?row.employee_name:(subjectType==="Fábrica"?(row.factory_name||"Fábrica"):"Armazém");
    const subjectFunction=subjectType==="Funcionário"?row.employee_function:"";
    pa.push({
      "Data":row.occurrence_date,
      "Responsável":subjectName,
      "Código":item.sku_code,
      "Descrição do produto":item.sku_name,
      "Qtde":qty,
      "Motivo":row.reason,
      "Situação":situationFromReason(row.reason),
      "Área/ Local":row.location,
      "Conferente":row.conferencer?.display_name||"",
      "Turno":row.shift,
    });
    daily.push({
      "Código":item.sku_code,"Produto":item.sku_name,"Situação":situationFromReason(row.reason),"Quantidade":qty,
      "Responsável":subjectName,"Função":subjectFunction,"Área":row.location,"Turno":row.shift,
      "B.O.":row.bo_number,"Data":row.occurrence_date,"Motivo":row.reason,
    });
  }
  return{pa,daily,occurrence_count:all.length,item_count:pa.length};
}

async function issuePins(rows:any[]){
  const issued=await Promise.all(rows.map(async row=>{const pin=randomPin();return{row,pin,record:await pinRecord(pin)};}));
  for(const entry of issued){
    const {error}=await db.from("bo_conferencers").update({...entry.record,pin_admin_value:entry.pin}).eq("id",entry.row.id);if(error)throw error;
    await db.from("bo_conferencer_sessions").delete().eq("conferencer_id",entry.row.id);
  }
  return issued.map(x=>({id:x.row.id,display_name:x.row.display_name,pin:x.pin}));
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:responseHeaders(req)});
  if(req.method!=="POST")return json(req,{error:"Método não permitido."},405);
  try{
    const body=await readBody(req),action=String(body?.action||"");

    if(action==="conferencers"){
      const {data,error}=await db.from("bo_conferencers").select("id,display_name,pin_hash").eq("active",true).order("display_name");if(error)throw error;
      return json(req,{conferencers:(data||[]).map((x:any)=>({id:x.id,display_name:x.display_name,pin_ready:!!x.pin_hash}))});
    }
    if(action==="pin_login"){
      const id=cleanText(body?.conferencer_id,60),pin=cleanText(body?.pin,12);
      const {data:row}=await db.from("bo_conferencers").select("id,display_name,pin_salt,pin_hash,pin_admin_value,failed_attempts,locked_until,active").eq("id",id).eq("active",true).maybeSingle();
      const locked=!!row?.locked_until&&Date.parse(row.locked_until)>Date.now();
      const valid=!locked&&/^\d{6}$/.test(pin)&&(
        (row?.pin_admin_value&&constantTimeEqual(pin,String(row.pin_admin_value))) ||
        await verifyPin(pin,row).catch(()=>false)
      );
      if(!row||!valid){
        if(row&&!locked){const attempts=Number(row.failed_attempts||0)+1;await db.from("bo_conferencers").update({failed_attempts:attempts,locked_until:attempts>=MAX_PIN_ATTEMPTS?new Date(Date.now()+LOCK_MINUTES*60000).toISOString():null,updated_at:new Date().toISOString()}).eq("id",row.id);}
        return json(req,{error:locked?"Acesso temporariamente bloqueado. Aguarde 15 minutos.":"Conferente ou PIN inválido."},locked?429:401);
      }
      await db.from("bo_conferencers").update({failed_attempts:0,locked_until:null,updated_at:new Date().toISOString()}).eq("id",row.id);
      await db.from("bo_conferencer_sessions").delete().eq("conferencer_id",row.id).lt("expires_at",new Date().toISOString());
      const token=randomToken(),expiresAt=new Date(Date.now()+PIN_SESSION_HOURS*3600000).toISOString();
      const {error}=await db.from("bo_conferencer_sessions").insert({conferencer_id:row.id,token_hash:await sha256(token),expires_at:expiresAt});if(error)throw error;
      return json(req,{token,expires_at:expiresAt,conferencer:{id:row.id,display_name:row.display_name}});
    }

    if(["bo_session","catalog_search","employee_search","submit","my_occurrences","confront_queue","confront_submit","resubmit","update_occurrence","delete_occurrence","bo_logout"].includes(action)){
      const conferencer=await requireBoSession(req);if(!conferencer)return json(req,{error:"PIN expirado. Identifique-se novamente."},401);
      if(action==="bo_session")return json(req,{conferencer:{id:conferencer.id,display_name:conferencer.display_name}});
      if(action==="bo_logout"){await db.from("bo_conferencer_sessions").delete().eq("id",conferencer.session_id);return json(req,{ok:true});}
      if(action==="catalog_search"){
        const search=safeSearch(body?.query);if(!search)return json(req,{items:[]});
        const fields="sku_code,sku_name,factor_hecto,factor_hecto_commercial,average_cost";
        const requests:any[]=[db.from("product_catalog").select(fields).ilike("sku_name",`%${search}%`).limit(15)];
        if(/^\d+$/.test(search))requests.unshift(db.from("product_catalog").select(fields).ilike("sku_code",`${search}%`).limit(15));
        const results=await Promise.all(requests);for(const result of results)if(result.error)throw result.error;
        const seen=new Set(),items:any[]=[];for(const result of results)for(const item of result.data||[]){if(!seen.has(item.sku_code)){seen.add(item.sku_code);items.push(item);if(items.length===20)break;}}
        return json(req,{items});
      }
      if(action==="employee_search"){
        const search=safeSearch(body?.query);if(search.length<2)return json(req,{employees:[]});
        const {data,error}=await db.from("bo_employee_directory").select("employee_name,job_title,shift").eq("active",true).ilike("employee_name",`%${search}%`).order("employee_name").limit(15);if(error)throw error;
        return json(req,{employees:data||[]});
      }
      if(action==="submit")return json(req,{occurrence:await createOccurrence(conferencer,body)},201);
      if(action==="my_occurrences")return json(req,{occurrences:await myOccurrences(conferencer)});
      if(action==="confront_queue")return json(req,{occurrences:await confrontQueue()});
      if(action==="confront_submit")return json(req,{occurrence:await createConfrontation(conferencer,body)},201);
      if(action==="resubmit"||action==="update_occurrence")return json(req,{occurrence:await updateOccurrence(conferencer,body)});
      if(action==="delete_occurrence")return json(req,{occurrence:await cancelOccurrence(conferencer,body)});
    }

    const user=await requireAppUser(req);if(!user)return json(req,{error:"Sessão do painel inválida ou expirada."},401);
    if(action==="permissions")return json(req,{can_validate:isValidator(user),can_manage_pins:user.role==="admin",can_delete:user.role==="admin",user:{display_name:user.display_name,role:user.role}});
    if(action==="admin_delete_occurrence"){
      if(user.role!=="admin")return json(req,{error:"Somente administradores podem excluir B.O.s."},403);
      const id=Number(body?.id);if(!Number.isInteger(id)||id<=0)throw new Error("B.O. inválido.");
      const {data,error}=await db.rpc("admin_delete_bo_occurrence",{p_id:id,p_deleted_by:user.id});if(error)throw error;
      return json(req,{ok:true,reference:data});
    }
    if(!isValidator(user))return json(req,{error:"Sem autorização para acessar o Controle de B.O."},403);
    if(action==="dashboard")return json(req,await dashboard(body));
    if(action==="review")return json(req,{occurrence:await reviewOccurrence(user,body)});
    if(action==="bulk_validate")return json(req,await bulkValidateOccurrences(user,body));
    if(action==="export")return json(req,await validatedForExport(body));
    if(action==="pin_status"){
      if(user.role!=="admin")return json(req,{error:"Somente administradores gerenciam PINs."},403);
      const {data,error}=await db.from("bo_conferencers").select("id,display_name,pin_hash,pin_admin_value,pin_updated_at,active").order("display_name");if(error)throw error;
      return json(req,{conferencers:(data||[]).map((x:any)=>({id:x.id,display_name:x.display_name,pin_ready:!!x.pin_hash,pin:x.pin_admin_value||null,pin_updated_at:x.pin_updated_at,active:x.active}))});
    }
    if(action==="generate_missing_pins"){
      if(user.role!=="admin")return json(req,{error:"Somente administradores gerenciam PINs."},403);
      const {data,error}=await db.from("bo_conferencers").select("id,display_name").eq("active",true).is("pin_hash",null).order("display_name");if(error)throw error;
      return json(req,{issued:await issuePins(data||[])});
    }
    if(action==="reset_pin"){
      if(user.role!=="admin")return json(req,{error:"Somente administradores gerenciam PINs."},403);
      const id=cleanText(body?.id,60);const {data,error}=await db.from("bo_conferencers").select("id,display_name").eq("id",id).eq("active",true).maybeSingle();if(error)throw error;if(!data)throw new Error("Conferente não encontrado.");
      return json(req,{issued:(await issuePins([data]))[0]});
    }
    return json(req,{error:"Ação inválida."},400);
  }catch(error){
    console.error(error);
    const message=error instanceof Error?error.message:(typeof (error as any)?.message==="string"?(error as any).message:"Erro interno no B.O. Digital.");
    const code=typeof (error as any)?.code==="string"?(error as any).code:null;
    return json(req,{error:message,code},500);
  }
});
