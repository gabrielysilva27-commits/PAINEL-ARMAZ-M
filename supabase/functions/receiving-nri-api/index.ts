
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const ORIGIN="https://painel-armaz-m.gabrielysilva27.workers.dev";
const enc=new TextEncoder();
function headers(req:Request){const o=req.headers.get("origin");const a=o===ORIGIN||o?.startsWith("http://localhost:")||o?.startsWith("http://127.0.0.1:")?o:ORIGIN;return{"Access-Control-Allow-Origin":a,"Access-Control-Allow-Headers":"content-type,x-session-token,x-bo-token,x-gate-token,x-agent-token","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"}}
const json=(req:Request,b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:headers(req)});
async function hash(t:string){const b=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(t)));return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
async function body(req:Request){const x=await req.json().catch(()=>({}));if(!x||typeof x!=="object"||Array.isArray(x))throw new Error("Solicitação inválida.");return x}
const clean=(v:any,n=250)=>String(v??"").replace(/\s+/g," ").trim().slice(0,n);
function compareAgentVersions(a:any,b:any){
  const pa=String(a||"0").split(".").map((x:string)=>Number(x)||0),pb=String(b||"0").split(".").map((x:string)=>Number(x)||0);
  for(let i=0;i<Math.max(pa.length,pb.length,3);i++){const x=pa[i]||0,y=pb[i]||0;if(x!==y)return x>y?1:-1}return 0
}

const code=(v:any)=>{let x=clean(v,40).replace(/^'+/,"").replace(/\.0+$/,"");if(/^\d+$/.test(x))x=String(Number(x));return x}
function isoDate(v:any){const s=clean(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error("Data inválida.");return s}
function num(v:any,label:string,min=0){const n=Number(v);if(!Number.isFinite(n)||n<min)throw new Error(label+" inválida.");return Math.round(n*1000)/1000}
function int(v:any,label:string,min=1){const n=Number(v);if(!Number.isInteger(n)||n<min)throw new Error(label+" inválido.");return n}
const FACTORIES=["NOVA RIO","MACACU","PIRAI","JPA","MKP"] as const;
const DRIVERS=["COELHO","RONALDO","MESSIAS","ANDERSON","RODRIGO","KAYQUE","DEIVID","NETO","V.HUGO","MKP"] as const;
const TRUCK_PLATES:any={"246":"LSZ-9355","271":"LMZ-4G31","229":"KYI-8259","160":"KZJ-4694","231":"LSN-7312","264":"KZM-9D84","203":"LRN-7589","225":"LSE-4160","210":"LRW-5314","289":"RIX-8E72","298":"RKK-8G53","312":"TTZ5E13","MKTP":"MKTP"};
function receiptName(r:any){return [r.truck_number,r.factory_name,r.driver_name].filter(Boolean).join(" · ")}
function receiptCode(){const d=new Date().toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"}).replace(/-/g,"");const a=crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0,5);return "REC-"+d+"-"+a}
function dayDiff(a:string,b:string){return Math.floor((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000)}
function minusDays(d:string,n:number){const x=new Date(d+"T12:00:00Z");x.setUTCDate(x.getUTCDate()-n);return x.toISOString().slice(0,10)}
async function appUser(req:Request){const t=req.headers.get("x-session-token")||"";if(!t)return null;const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",await hash(t)).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();return u||null}
async function confUser(req:Request){const t=req.headers.get("x-bo-token")||"";if(!t)return null;const {data:s}=await db.from("bo_conferencer_sessions").select("id,conferencer_id,expires_at").eq("token_hash",await hash(t)).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;const {data:u}=await db.from("bo_conferencers").select("id,display_name,active").eq("id",s.conferencer_id).eq("active",true).maybeSingle();return u||null}
async function gateUser(req:Request){const t=req.headers.get("x-gate-token")||"";if(!t)return null;const {data:s}=await db.from("receiving_gate_sessions").select("id,gate_user_id,expires_at").eq("token_hash",await hash(t)).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s?.gate_user_id)return null;const {data:u}=await db.from("receiving_gate_users").select("id,display_name,active").eq("id",s.gate_user_id).eq("active",true).maybeSingle();return u||null}
function randomPin(){const a=crypto.getRandomValues(new Uint32Array(1))[0]%10000;return String(a).padStart(4,"0")}

const receiptSelect="id,receipt_code,truck_number,arrival_date,arrival_time,nf_imperio,nf_ambev,map_number,order_number,factory_name,fleet,plate,shift,driver_name,gate_reception,portaria_comments,status,pull_status,unload_status,unload_operator_id,unload_started_at,unload_completed_at,unload_completion_source,unload_operator:receiving_forklift_operators(display_name),conference_started_at,conference_completed_at,revision,created_at,updated_at,conference_by,gate_created_by,gate_updated_by,gate_creator:receiving_gate_users!receiving_nri_receipts_gate_created_by_fkey(display_name),gate_updater:receiving_gate_users!receiving_nri_receipts_gate_updated_by_fkey(display_name),conferencer:bo_conferencers(display_name),items:receiving_nri_items(id,nri_number,line_no,sku_code,sku_name,unit_text,physical_qty,pallet_count,pallet_capacity,layer_qty,expiry_date,curve_class,shelf_life_days,shelf_life_status,load_until_date,comments,system_qty,comparison_diff,comparison_status)";
const blindReceiptSelect="id,receipt_code,truck_number,arrival_date,arrival_time,nf_imperio,nf_ambev,map_number,order_number,factory_name,fleet,plate,shift,driver_name,gate_reception,portaria_comments,status,unload_status,unload_operator_id,unload_started_at,unload_completed_at,unload_completion_source,unload_operator:receiving_forklift_operators(display_name),conference_started_at,conference_completed_at,revision,conference_by,gate_created_by,gate_creator:receiving_gate_users!receiving_nri_receipts_gate_created_by_fkey(display_name),conferencer:bo_conferencers(display_name),items:receiving_nri_items(id,nri_number,line_no,sku_code,sku_name,unit_text,physical_qty,pallet_count,pallet_capacity,layer_qty,expiry_date,curve_class,shelf_life_days,shelf_life_status,load_until_date,comments)";

async function catalog(q:any){
  const s=clean(q,80);if(!s)return[];
  let rq=db.from("product_catalog").select("sku_code,sku_name,boxes_per_pallet").limit(20);
  rq=/^\d+$/.test(s)?rq.ilike("sku_code",s+"%"):rq.ilike("sku_name","%"+s+"%");
  const {data:products,error}=await rq;if(error)throw error;
  const codes=(products||[]).map((x:any)=>String(x.sku_code));
  if(!codes.length)return[];
  const [{data:params},{data:abc}]=await Promise.all([
    db.from("receiving_nri_product_params").select("sku_code,pallet_capacity,layer_qty,curve_class").in("sku_code",codes),
    db.from("abc_items").select("sku_code,curve_class,reference_month").in("sku_code",codes).order("reference_month",{ascending:false})
  ]);
  const pm=new Map((params||[]).map((x:any)=>[String(x.sku_code),x]));
  const priority:any={A:1,B:2,C:3};const am=new Map();
  for(const x of abc||[]){const k=String(x.sku_code);const old=am.get(k);if(!old||String(x.reference_month)>old.reference_month||(String(x.reference_month)===old.reference_month&&priority[x.curve_class]<priority[old.curve_class]))am.set(k,x)}
  return (products||[]).map((p:any)=>{const x=pm.get(String(p.sku_code))||{};const a=am.get(String(p.sku_code))||{};return{sku_code:String(p.sku_code),sku_name:p.sku_name,pallet_capacity:x.pallet_capacity??p.boxes_per_pallet??null,layer_qty:x.layer_qty??null,curve_class:x.curve_class??a.curve_class??null}})
}

function validateHeader(x:any){
  const truck=clean(x.truck_number,60).toUpperCase(),factory=clean(x.factory_name,100).toUpperCase(),driver=clean(x.driver_name,120).toUpperCase();
  if(!TRUCK_PLATES[truck])throw new Error("Selecione uma carreta cadastrada.");
  if(!FACTORIES.includes(factory as any))throw new Error("Selecione uma fábrica cadastrada.");
  if(!DRIVERS.includes(driver as any))throw new Error("Selecione um carreteiro cadastrado.");
  return{truck_number:truck,arrival_date:isoDate(x.arrival_date),arrival_time:clean(x.arrival_time,5),nf_imperio:clean(x.nf_imperio,60)||null,nf_ambev:clean(x.nf_ambev,60)||null,map_number:clean(x.map_number,60)||null,order_number:clean(x.order_number,60)||null,factory_name:factory,fleet:null,plate:TRUCK_PLATES[truck],shift:null,driver_name:driver,gate_reception:null,portaria_comments:null}
}
async function enrichItems(receipt:any,src:any[]){
  if(!Array.isArray(src)||!src.length||src.length>80)throw new Error("Inclua de 1 a 80 produtos.");
  const out=[];for(let i=0;i<src.length;i++){
    const x=src[i],sku=code(x.sku_code);if(!sku)throw new Error("Informe o código do produto "+(i+1)+".");
    const found=(await catalog(sku)).find((p:any)=>p.sku_code===sku);if(!found)throw new Error("Código "+sku+" não encontrado no 01.11.");
    const expiry=isoDate(x.expiry_date),days=dayDiff(receipt.arrival_date,expiry);
    const cap=x.pallet_capacity===""||x.pallet_capacity==null?found.pallet_capacity:num(x.pallet_capacity,"Capacidade do palete",0);
    const layer=x.layer_qty===""||x.layer_qty==null?found.layer_qty:num(x.layer_qty,"Lastro",0);
    const curve=clean(x.curve_class,3)||found.curve_class||null;
    const unit=(clean(x.unit_text,10)||"P").toUpperCase();if(!["P","CX"].includes(unit))throw new Error("Selecione P (Palete) ou CX (Caixa) no produto "+(i+1)+".");
    const qty=int(x.physical_qty??x.pallet_count,"Quantidade",1);
    out.push({line_no:i+1,sku_code:sku,sku_name:found.sku_name,unit_text:unit,physical_qty:qty,pallet_count:unit==="P"?qty:1,pallet_capacity:cap??null,layer_qty:layer??null,expiry_date:expiry,curve_class:curve,shelf_life_days:days,shelf_life_status:days>=40?"OK":"NOK",load_until_date:minusDays(expiry,30),comments:clean(x.comments,1000)||null,updated_at:new Date().toISOString()})
  }return out
}
async function saveItems(receipt:any,items:any[]){
  const enriched=await enrichItems(receipt,items);
  const {data:existing}=await db.from("receiving_nri_items").select("id,line_no,nri_number").eq("receipt_id",receipt.id);
  const byLine=new Map((existing||[]).map((x:any)=>[Number(x.line_no),x]));
  for(const x of enriched){const old=byLine.get(x.line_no);if(old){const {error}=await db.from("receiving_nri_items").update(x).eq("id",old.id);if(error)throw error;byLine.delete(x.line_no)}else{const {error}=await db.from("receiving_nri_items").insert({receipt_id:receipt.id,...x});if(error)throw error}}
  const leftovers=[...byLine.values()].map((x:any)=>x.id);if(leftovers.length){const {error}=await db.from("receiving_nri_items").delete().in("id",leftovers);if(error)throw error}
}
async function listReceipts(body:any,blind=false){
  let q=db.from("receiving_nri_receipts").select(blind?blindReceiptSelect:receiptSelect).order("arrival_date",{ascending:false}).order("id",{ascending:false}).limit(300);
  const status=clean(body.status,40);if(status&&status!=="all")q=q.eq("status",status);
  const pull=clean(body.pull_status,40);if(pull&&pull!=="all")q=q.eq("pull_status",pull);
  const {data,error}=await q;if(error)throw error;
  const rows=data||[],ids=rows.map((r:any)=>r.id);
  const originalSet=new Set<number>();
  if(ids.length){
    const {data:logs,error:le}=await db.from("receiving_nri_print_log").select("receipt_id,print_type").in("receipt_id",ids).eq("print_type","original");
    if(le)throw le;for(const x of logs||[])originalSet.add(Number(x.receipt_id));
  }
  const s=clean(body.search,100).toLocaleLowerCase("pt-BR");
  return rows.filter((r:any)=>!s||[r.receipt_code,r.truck_number,r.factory_name,r.driver_name,r.plate,r.order_number,r.map_number,...(r.items||[]).flatMap((i:any)=>[i.sku_code,i.sku_name])].join(" ").toLocaleLowerCase("pt-BR").includes(s)).map((r:any)=>({...r,display_name:receiptName(r),print_status:r.status!=="conference_completed"?"not_ready":originalSet.has(Number(r.id))?"printed":"pending_print",nri_count:(r.items||[]).reduce((sum:number,i:any)=>sum+(String(i.unit_text||"P").toUpperCase()==="P"?Number(i.physical_qty||i.pallet_count||0):1),0)}))
}
async function counts(){
  const {data,error}=await db.from("receiving_nri_receipts").select("id,status,pull_status,unload_status");if(error)throw error;
  const completed=(data||[]).filter((r:any)=>r.status==="conference_completed").map((r:any)=>Number(r.id));
  const printed=new Set<number>(),sheets=new Map<number,number>();
  if(completed.length){
    const [{data:logs,error:le},{data:items,error:ie}]=await Promise.all([
      db.from("receiving_nri_print_log").select("receipt_id").in("receipt_id",completed).eq("print_type","original"),
      db.from("receiving_nri_items").select("receipt_id,unit_text,physical_qty,pallet_count").in("receipt_id",completed)
    ]);
    if(le)throw le;if(ie)throw ie;
    for(const x of logs||[])printed.add(Number(x.receipt_id));
    for(const x of items||[]){const id=Number(x.receipt_id),unit=String(x.unit_text||"P").toUpperCase(),qty=unit==="P"?Number(x.physical_qty||x.pallet_count||0):1;sheets.set(id,(sheets.get(id)||0)+qty)}
  }
  const c:any={awaiting_conference:0,in_conference:0,conference_completed:0,awaiting_unload:0,unloading:0,unload_completed:0,print_pending:0,printed:printed.size,pull_pending:0,pull_matched:0,pull_divergent:0};
  for(const r of data||[]){if(c[r.status]!=null)c[r.status]++;if(r.unload_status==="pending")c.awaiting_unload++;if(r.unload_status==="in_progress")c.unloading++;if(r.unload_status==="completed")c.unload_completed++;if(r.status==="conference_completed"&&(sheets.get(Number(r.id))||0)>0&&!printed.has(Number(r.id)))c.print_pending++;if(r.status==="conference_completed"&&r.pull_status==="pending")c.pull_pending++;if(r.pull_status==="matched")c.pull_matched++;if(r.pull_status==="divergent")c.pull_divergent++}return c
}


function normDoc(v:any){const s=String(v??"").replace(/\D/g,"").replace(/^0+/,"");return s||"0"}
function supplierForFactory(v:any){
  const f=clean(v,100).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  return ({"NOVA RIO":"20310","PIRAI":"20448","MACACU":"20809"} as any)[f]||null
}
async function import020501(u:any,b:any){
  const rows=Array.isArray(b.rows)?b.rows:[];if(!rows.length)throw new Error("O relatório 02.05.01 não possui linhas para importar.");
  if(rows.length>5000)throw new Error("Relatório muito grande para esta importação.");
  const cleanRows:any[]=[];const docsBySupplier=new Map<string,Set<string>>();
  for(const x of rows){
    const supplier=clean(x.supplier_code,30),invoice=normDoc(x.invoice_number),sku=code(x.sku_code),qty=num(x.system_qty,"Quantidade do sistema",0);
    if(!supplier||!/^\d+$/.test(supplier)||!invoice||!sku)continue;
    const reportDate=clean(x.report_date,10)||null;
    cleanRows.push({supplier_code:supplier,invoice_number:invoice,sku_code:sku,sku_name:clean(x.sku_name,220)||null,report_unit:clean(x.report_unit,20)||null,system_qty:qty,operation_codes:clean(x.operation_codes,80)||null,report_date:reportDate,source_file:clean(b.source_file,180)||"02.05.01.xlsx",imported_at:new Date().toISOString(),imported_by:u?.id||null});
    if(!docsBySupplier.has(supplier))docsBySupplier.set(supplier,new Set());docsBySupplier.get(supplier)!.add(invoice);
  }
  if(!cleanRows.length)throw new Error("Nenhuma linha válida foi encontrada no relatório.");
  for(const [supplier,docs] of docsBySupplier){
    const arr=[...docs];for(let i=0;i<arr.length;i+=150){const {error}=await db.from("receiving_system_020501").delete().eq("supplier_code",supplier).in("invoice_number",arr.slice(i,i+150));if(error)throw error}
  }
  for(let i=0;i<cleanRows.length;i+=400){const {error}=await db.from("receiving_system_020501").insert(cleanRows.slice(i,i+400));if(error)throw error}
  const documentCount=[...docsBySupplier.values()].reduce((n,s)=>n+s.size,0);
  const {error:le}=await db.from("receiving_system_020501_import_log").insert({source_file:clean(b.source_file,180)||"02.05.01.xlsx",raw_rows:Number(b.raw_rows)||rows.length,aggregated_rows:cleanRows.length,documents:documentCount,imported_by:u?.id||null});if(le)throw le;
  return{raw_rows:Number(b.raw_rows)||rows.length,aggregated_rows:cleanRows.length,documents:documentCount}
}
async function system020501Status(){
  const [{data:last,error:le},{count,error:ce}]=await Promise.all([
    db.from("receiving_system_020501_import_log").select("source_file,raw_rows,aggregated_rows,documents,imported_at").order("imported_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("receiving_system_020501").select("sku_code",{count:"exact",head:true})
  ]);if(le)throw le;if(ce)throw ce;return{last_import:last||null,rows:count||0}
}
async function autoComparePull(receiptId:number,u:any){
  const {data:r,error:re}=await db.from("receiving_nri_receipts").select(receiptSelect).eq("id",receiptId).maybeSingle();if(re)throw re;if(!r)throw new Error("Recebimento não encontrado.");if(r.status!=="conference_completed")throw new Error("A conferência física precisa estar finalizada.");
  const invoiceCandidates=[normDoc(r.nf_ambev),normDoc(r.nf_imperio)].filter((x,i,a)=>x&&x!=="0"&&a.indexOf(x)===i);
  if(!invoiceCandidates.length)return{receipt:{...r,display_name:receiptName(r)},match_status:"invoice_missing",message:"A Portaria não informou uma NF para cruzar com o 02.05.01.",rows:[]};
  const supplier=supplierForFactory(r.factory_name);
  let q=db.from("receiving_system_020501").select("*").in("invoice_number",invoiceCandidates);if(supplier)q=q.eq("supplier_code",supplier);
  const {data:sys,error:se}=await q;if(se)throw se;
  const all=sys||[];
  let chosenInvoice:string|null=null,chosenSupplier:string|null=supplier;
  if(supplier){
    for(const inv of invoiceCandidates){if(all.some((x:any)=>x.invoice_number===inv)){chosenInvoice=inv;break}}
  }else{
    for(const inv of invoiceCandidates){
      const rows=all.filter((x:any)=>x.invoice_number===inv),suppliers=[...new Set(rows.map((x:any)=>x.supplier_code))];
      if(rows.length&&suppliers.length===1){chosenInvoice=inv;chosenSupplier=String(suppliers[0]);break}
      if(rows.length&&suppliers.length>1)return{receipt:{...r,display_name:receiptName(r)},match_status:"ambiguous_invoice",message:"A NF "+inv+" aparece para mais de um fornecedor no 02.05.01. Informe o código da fábrica antes de automatizar este caso.",rows:[]}
    }
  }
  if(!chosenInvoice){
    await db.from("receiving_nri_receipts").update({pull_status:"pending",updated_by:u?.id||null,updated_at:new Date().toISOString()}).eq("id",receiptId);
    return{receipt:{...r,display_name:receiptName(r)},match_status:"invoice_not_found",supplier_code:supplier,invoice_number:invoiceCandidates[0],message:"NF não encontrada na base importada do 02.05.01.",rows:[]}
  }
  const sysRows=all.filter((x:any)=>x.invoice_number===chosenInvoice&&(!chosenSupplier||x.supplier_code===chosenSupplier));
  const physGroups=new Map<string,any>();
  for(const x of r.items||[]){
    const sku=String(x.sku_code),g=physGroups.get(sku)||{sku_code:sku,sku_name:x.sku_name,p_qty:0,cx_qty:0,item_ids:[],pallet_capacity:Number(x.pallet_capacity||0)};
    const unit=String(x.unit_text||"P").toUpperCase(),qty=Number(x.physical_qty||0);if(unit==="P")g.p_qty+=qty;else g.cx_qty+=qty;
    if(!g.pallet_capacity&&x.pallet_capacity)g.pallet_capacity=Number(x.pallet_capacity);g.item_ids.push(x.id);physGroups.set(sku,g)
  }
  const sysMap=new Map(sysRows.map((x:any)=>[String(x.sku_code),x]));
  const skus=[...new Set([...physGroups.keys(),...sysMap.keys()])];
  const [pcRes,paramRes]=await Promise.all([
    skus.length?db.from("product_catalog").select("sku_code,sku_name,boxes_per_pallet").in("sku_code",skus):Promise.resolve({data:[],error:null}),
    skus.length?db.from("receiving_nri_product_params").select("sku_code,pallet_capacity").in("sku_code",skus):Promise.resolve({data:[],error:null})
  ]);
  if((pcRes as any).error)throw (pcRes as any).error;if((paramRes as any).error)throw (paramRes as any).error;
  const pc=new Map(((pcRes as any).data||[]).map((x:any)=>[String(x.sku_code),x])),params=new Map(((paramRes as any).data||[]).map((x:any)=>[String(x.sku_code),x]));
  const out:any[]=[];let anyDivergent=false,anyPending=false;
  for(const sku of skus){
    const pg=physGroups.get(sku)||{sku_code:sku,sku_name:null,p_qty:0,cx_qty:0,item_ids:[],pallet_capacity:0},sr=sysMap.get(sku),cat=pc.get(sku),par=params.get(sku);
    const physicalCap=Number(pg.pallet_capacity||par?.pallet_capacity||0),systemFactor=Number(cat?.boxes_per_pallet||0);
    const physicalPalletEq=physicalCap>0?pg.p_qty+(pg.cx_qty/physicalCap):(pg.cx_qty>0?null:pg.p_qty);
    const systemRaw=sr?Number(sr.system_qty||0):null,systemPalletEq=sr&&systemFactor>0?systemRaw/systemFactor:null;
    let status="matched",diff:any=null;
    if(!sr){status="physical_only";anyDivergent=true}
    else if(physicalPalletEq==null||systemPalletEq==null){status="no_capacity";anyPending=true}
    else{diff=Math.round((physicalPalletEq-systemPalletEq)*10000)/10000;if(Math.abs(diff)>=0.0001){status=pg.item_ids.length?"divergent":"system_only";anyDivergent=true}}
    const physicalParts=[];if(pg.p_qty)physicalParts.push(pg.p_qty+" P");if(pg.cx_qty)physicalParts.push(pg.cx_qty+" CX");if(!physicalParts.length)physicalParts.push("0");
    out.push({sku_code:sku,sku_name:pg.sku_name||sr?.sku_name||cat?.sku_name||"",physical_text:physicalParts.join(" + "),physical_pallet_eq:physicalPalletEq,system_raw_qty:systemRaw,system_unit:sr?.report_unit||null,system_pallet_eq:systemPalletEq,difference_pallet_eq:diff,status,operation_codes:sr?.operation_codes||null,boxes_per_pallet:systemFactor||null,pallet_capacity:physicalCap||null});
    for(const itemId of pg.item_ids){await db.from("receiving_nri_items").update({system_qty:systemPalletEq,comparison_diff:diff,comparison_status:status==="matched"?"matched":status==="no_capacity"?"pending":"divergent",system_updated_by:u?.id||null,system_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",itemId)}
  }
  const pull=anyPending?"in_progress":anyDivergent?"divergent":"matched";
  const {data:updated,error:ue}=await db.from("receiving_nri_receipts").update({pull_status:pull,updated_by:u?.id||null,updated_at:new Date().toISOString()}).eq("id",receiptId).select(receiptSelect).single();if(ue)throw ue;
  return{receipt:{...updated,display_name:receiptName(updated)},match_status:"matched_invoice",supplier_code:chosenSupplier,invoice_number:chosenInvoice,rows:out}
}


async function pullAgentAuth(req:Request){
  const t=req.headers.get("x-agent-token")||"";if(!t)return null;
  const h=await hash(t);
  const {data,error}=await db.from("receiving_pull_agent_nodes").select("*").eq("token_hash",h).eq("active",true).maybeSingle();
  if(error)throw error;return data||null
}
function todayBr(){return new Date().toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"})}
async function oldestPullDate(){
  const {data,error}=await db.from("receiving_nri_receipts").select("arrival_date").eq("status","conference_completed").in("pull_status",["pending","in_progress","divergent"]).order("arrival_date",{ascending:true}).limit(1).maybeSingle();
  if(error)throw error;return data?.arrival_date||todayBr()
}
async function compareRange(dateFrom:string,dateTo:string){
  const {data,error}=await db.from("receiving_nri_receipts").select("id").eq("status","conference_completed").gte("arrival_date",dateFrom).lte("arrival_date",dateTo).limit(500);
  if(error)throw error;let compared=0;
  for(const r of data||[]){try{await autoComparePull(Number(r.id),null);compared++}catch(_e){}}
  return compared
}
function agentOnline(lastSeen:any){if(!lastSeen)return false;const t=Date.parse(String(lastSeen));return Number.isFinite(t)&&(Date.now()-t)<180000}
function futureIso(minutes:number){return new Date(Date.now()+minutes*60000).toISOString()}
async function getAgentStatus(){
  const {data:settings,error}=await db.from("receiving_pull_agent").select("*").eq("id",1).single();if(error)throw error;
  const latestRelease=await latestAgentRelease();
  const {data:nodes,error:ne}=await db.from("receiving_pull_agent_nodes").select("*").eq("logical_agent_id",1).order("slot_code");if(ne)throw ne;
  const {data:lastRun,error:re}=await db.from("receiving_pull_agent_runs").select("*,node:receiving_pull_agent_nodes(display_name,slot_code,hostname)").order("started_at",{ascending:false}).limit(1).maybeSingle();if(re)throw re;
  const {data:pending,error:pe}=await db.from("receiving_pull_sync_requests").select("id,status,request_type,requested_at,date_from,date_to,claimed_by_node_id,lease_expires_at").in("status",["pending","running"]).order("requested_at",{ascending:true}).limit(5);if(pe)throw pe;
  const safeNodes=(nodes||[]).map((n:any)=>{const x={...n,token_ready:!!n.token_hash,online:agentOnline(n.last_seen_at)};delete x.token_hash;return x});
  const anySync=safeNodes.some((n:any)=>n.status==="syncing"&&n.online),anyOnline=safeNodes.some((n:any)=>n.online&&n.calibration_ready),anyError=safeNodes.some((n:any)=>n.status==="error"),anyToken=safeNodes.some((n:any)=>n.token_ready),anyCal=safeNodes.some((n:any)=>n.calibration_ready);
  const overall=anySync?"syncing":anyOnline?"online":anyError?"error":anyToken&&!anyCal?"calibration_required":"offline";
  const recentError=safeNodes.find((n:any)=>n.last_error)?.last_error||null;
  const safe={...settings,status:overall,online:safeNodes.some((n:any)=>n.online),token_ready:anyToken,calibration_ready:anyCal,nodes:safeNodes,last_run:lastRun||null,pending_requests:pending||[],last_error:recentError,latest_agent_version:latestRelease?.version||null};delete safe.token_hash;return safe
}
async function touchAgentNode(node:any,b:any,forceStatus?:string){
  const now=new Date().toISOString(),hostname=clean(b.hostname,120)||node.hostname||null,version=clean(b.agent_version,40)||node.agent_version||null,ready=!!b.calibration_ready;
  const cooling=node.cooldown_until&&Date.parse(node.cooldown_until)>Date.now();
  const status=forceStatus||(ready?(cooling?"error":"online"):"calibration_required");
  const caps=Array.isArray(b.capabilities)?b.capabilities.map((x:any)=>clean(x,80)).filter(Boolean).slice(0,50):(node.capabilities||[]);
  const patch:any={hostname,agent_version:version,updater_version:clean(b.updater_version,20)||node.updater_version||null,capabilities:caps,calibration_ready:ready,last_seen_at:now,status,updated_at:now};
  if(!cooling&&status!=="error"){patch.cooldown_until=null;if(node.last_error)patch.last_error=null}
  const {data,error}=await db.from("receiving_pull_agent_nodes").update(patch).eq("id",node.id).select("*").single();if(error)throw error;return data
}
async function latestAgentRelease(){
  const {data,error}=await db.from("receiving_pull_agent_releases").select("*").eq("status","active").order("published_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;return data||null
}
async function agentUpdateManifest(node:any,b:any){
  node=await touchAgentNode(node,b);
  const now=new Date().toISOString(),release=await latestAgentRelease(),current=clean(b.agent_version,40)||node.agent_version||"0.0.0",updater=clean(b.updater_version,20)||node.updater_version||"0";
  if(!release){
    await db.from("receiving_pull_agent_nodes").update({last_update_checked_at:now,update_status:"current",update_target_version:null,update_error:null,updated_at:now}).eq("id",node.id);
    return{update_available:false,latest_version:current}
  }
  if(compareAgentVersions(current,release.version)>=0){
    await db.from("receiving_pull_agent_nodes").update({last_update_checked_at:now,update_status:"current",update_target_version:release.version,update_error:null,last_update_at:node.last_update_at||now,updated_at:now}).eq("id",node.id);
    return{update_available:false,latest_version:release.version}
  }
  if(compareAgentVersions(updater,release.min_updater_version)<0){
    const msg="Atualizador local antigo demais para instalar "+release.version+".";
    await db.from("receiving_pull_agent_nodes").update({last_update_checked_at:now,update_status:"manual_required",update_target_version:release.version,update_error:msg,updated_at:now}).eq("id",node.id);
    return{update_available:false,manual_required:true,latest_version:release.version,error:msg}
  }
  await db.from("receiving_pull_agent_nodes").update({last_update_checked_at:now,update_status:"available",update_target_version:release.version,update_error:null,updated_at:now}).eq("id",node.id);
  return{update_available:true,release:{version:release.version,commit_sha:release.commit_sha,files:release.manifest,notes:release.notes||null}}
}
async function agentUpdateState(node:any,b:any){
  const allowed=["downloading","staged","applying","updated","failed","current","available"],status=clean(b.update_status,30);
  if(!allowed.includes(status))throw new Error("Status de atualização inválido.");
  const now=new Date().toISOString(),patch:any={update_status:status,last_update_checked_at:now,updated_at:now};
  const target=clean(b.update_target_version,40);if(target)patch.update_target_version=target;
  patch.update_error=status==="failed"?(clean(b.update_error,1000)||"Falha na atualização."):null;
  if(status==="updated"||status==="current")patch.last_update_at=now;
  const version=clean(b.agent_version,40);if(version)patch.agent_version=version;
  const updater=clean(b.updater_version,20);if(updater)patch.updater_version=updater;
  if(Array.isArray(b.capabilities))patch.capabilities=b.capabilities.map((x:any)=>clean(x,80)).filter(Boolean).slice(0,50);
  const {data,error}=await db.from("receiving_pull_agent_nodes").update(patch).eq("id",node.id).select("*").single();if(error)throw error;
  return{ok:true,node:{id:data.id,slot_code:data.slot_code,agent_version:data.agent_version,update_status:data.update_status,update_target_version:data.update_target_version}}
}
async function agentUpdateFile(node:any,b:any){
  const version=clean(b.version,40),target=clean(b.target,240).replace(/\\/g,"/");
  if(!version||!target||target.includes("..")||!target.match(/^(app|driver)\//))throw new Error("Arquivo de atualização inválido.");
  const {data:release,error:re}=await db.from("receiving_pull_agent_releases").select("version,status").eq("version",version).eq("status","active").maybeSingle();if(re)throw re;
  if(!release)throw new Error("Versão de atualização não está ativa.");
  const {data:file,error}=await db.from("receiving_pull_agent_release_files").select("target,sha256,content_base64,content_type").eq("version",version).eq("target",target).maybeSingle();if(error)throw error;
  if(!file)throw new Error("Arquivo não encontrado na versão "+version+".");
  await db.from("receiving_pull_agent_nodes").update({last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",node.id);
  return{version,target:file.target,sha256:file.sha256,content_type:file.content_type,content_base64:file.content_base64}
}


async function recoverExpiredAgentJob(){
  const now=new Date().toISOString();
  const {data:r,error}=await db.from("receiving_pull_sync_requests").select("*").eq("status","running").lt("lease_expires_at",now).order("started_at",{ascending:true}).limit(1).maybeSingle();if(error)throw error;if(!r)return;
  await db.from("receiving_pull_agent_runs").update({status:"failed",completed_at:now,message:"Execução interrompida: o computador perdeu o lease da sincronização."}).eq("request_id",r.id).eq("status","running");
  if(r.claimed_by_node_id)await db.from("receiving_pull_agent_nodes").update({status:"error",last_error:"Sincronização interrompida por perda de contato.",cooldown_until:futureIso(5),updated_at:now}).eq("id",r.claimed_by_node_id);
  await db.from("receiving_pull_sync_requests").update({status:"pending",started_at:null,completed_at:null,claimed_by_node_id:null,lease_expires_at:null,message:"Liberada para outro computador após perda de contato."}).eq("id",r.id).eq("status","running")
}
async function claimAgentJob(node:any,b:any){
  node=await touchAgentNode(node,b);
  if(!node.calibration_ready)return null;
  if(node.cooldown_until&&Date.parse(node.cooldown_until)>Date.now())return null;
  await recoverExpiredAgentJob();
  const {data:running,error:re}=await db.from("receiving_pull_sync_requests").select("id").eq("status","running").gt("lease_expires_at",new Date().toISOString()).limit(1).maybeSingle();if(re)throw re;if(running)return null;

  let {data:req,error}=await db.from("receiving_pull_sync_requests").select("*").eq("status","pending").order("requested_at",{ascending:true}).limit(1).maybeSingle();if(error)throw error;
  if(!req){
    const {data:settings,error:se}=await db.from("receiving_pull_agent").select("last_sync_completed_at,sync_interval_minutes").eq("id",1).single();if(se)throw se;
    const last=settings.last_sync_completed_at?Date.parse(settings.last_sync_completed_at):0,interval=Math.max(5,Number(settings.sync_interval_minutes||10))*60000;
    if(last&&Date.now()-last<interval)return null;
    const inserted=await db.from("receiving_pull_sync_requests").insert({request_type:"scheduled",status:"pending"}).select("*").maybeSingle();
    if(inserted.error){
      const again=await db.from("receiving_pull_sync_requests").select("*").eq("status","pending").order("requested_at",{ascending:true}).limit(1).maybeSingle();
      if(again.error)throw again.error;req=again.data;
      if(!req)return null;
    }else req=inserted.data;
  }

  const now=new Date().toISOString(),dateFrom=req.date_from||await oldestPullDate(),dateTo=req.date_to||todayBr(),lease=futureIso(30);
  const {data:claimed,error:ce}=await db.from("receiving_pull_sync_requests").update({status:"running",started_at:now,date_from:dateFrom,date_to:dateTo,message:null,claimed_by_node_id:node.id,lease_expires_at:lease}).eq("id",req.id).eq("status","pending").is("claimed_by_node_id",null).select("*").maybeSingle();if(ce)throw ce;if(!claimed)return null;
  const {data:run,error:rune}=await db.from("receiving_pull_agent_runs").insert({request_id:claimed.id,agent_node_id:node.id,date_from:dateFrom,date_to:dateTo,status:"running",hostname:node.hostname,agent_version:node.agent_version}).select("*").single();if(rune)throw rune;
  await db.from("receiving_pull_agent_nodes").update({status:"syncing",last_sync_started_at:now,last_seen_at:now,last_error:null,cooldown_until:null,updated_at:now}).eq("id",node.id);
  await db.from("receiving_pull_agent").update({status:"syncing",last_sync_started_at:now,last_sync_from:dateFrom,last_sync_to:dateTo,updated_at:now}).eq("id",1);
  return{request_id:claimed.id,run_id:run.id,date_from:dateFrom,date_to:dateTo,warehouse:"1",deposit:"1",operation_from:"251",operation_to:"314",report:"020501",worker:{id:node.id,slot_code:node.slot_code,display_name:node.display_name,hostname:node.hostname}}
}
async function heartbeatAgentJob(node:any,b:any){
  const requestId=Number(b.request_id),runId=Number(b.run_id);if(!Number.isInteger(requestId)||!Number.isInteger(runId))throw new Error("Execução do agente inválida.");
  const now=new Date().toISOString(),lease=futureIso(30);
  const {data:req,error}=await db.from("receiving_pull_sync_requests").update({lease_expires_at:lease}).eq("id",requestId).eq("status","running").eq("claimed_by_node_id",node.id).select("id").maybeSingle();if(error)throw error;if(!req)throw new Error("Esta sincronização não pertence mais a este computador.");
  await db.from("receiving_pull_agent_runs").update({message:"Execução ativa."}).eq("id",runId).eq("agent_node_id",node.id).eq("status","running");
  await db.from("receiving_pull_agent_nodes").update({status:"syncing",last_seen_at:now,updated_at:now}).eq("id",node.id);
  return{ok:true,lease_expires_at:lease}
}
async function finishAgentJob(node:any,b:any){
  const requestId=Number(b.request_id),runId=Number(b.run_id);if(!Number.isInteger(requestId)||!Number.isInteger(runId))throw new Error("Execução do agente inválida.");
  const {data:req,error:qe}=await db.from("receiving_pull_sync_requests").select("*").eq("id",requestId).eq("status","running").eq("claimed_by_node_id",node.id).maybeSingle();if(qe)throw qe;if(!req)throw new Error("Esta sincronização não pertence mais a este computador.");
  const {data:run,error:rve}=await db.from("receiving_pull_agent_runs").select("id").eq("id",runId).eq("agent_node_id",node.id).eq("status","running").maybeSingle();if(rve)throw rve;if(!run)throw new Error("Execução do agente não encontrada.");
  const imp=await import020501(null,b),compared=await compareRange(clean(b.date_from,10),clean(b.date_to,10));
  const now=new Date().toISOString(),source=clean(b.source_file,180)||"020501.csv";
  await db.from("receiving_pull_sync_requests").update({status:"completed",completed_at:now,message:"Sincronização concluída por "+node.display_name+".",source_file:source,raw_rows:imp.raw_rows,aggregated_rows:imp.aggregated_rows,documents:imp.documents,lease_expires_at:null}).eq("id",requestId).eq("claimed_by_node_id",node.id);
  await db.from("receiving_pull_agent_runs").update({status:"completed",completed_at:now,source_file:source,raw_rows:imp.raw_rows,aggregated_rows:imp.aggregated_rows,documents:imp.documents,compared_receipts:compared,message:"Sincronização concluída."}).eq("id",runId).eq("agent_node_id",node.id);
  await db.from("receiving_pull_agent_nodes").update({status:"online",last_seen_at:now,last_sync_completed_at:now,last_error:null,cooldown_until:null,updated_at:now}).eq("id",node.id);
  await db.from("receiving_pull_agent").update({status:"online",last_sync_completed_at:now,last_sync_from:clean(b.date_from,10),last_sync_to:clean(b.date_to,10),last_error:null,updated_at:now}).eq("id",1);
  return{...imp,compared_receipts:compared,worker:{slot_code:node.slot_code,display_name:node.display_name,hostname:node.hostname}}
}
async function failAgentJob(node:any,b:any){
  const requestId=Number(b.request_id),runId=Number(b.run_id),msg=clean(b.error,1000)||"Falha não informada.",now=new Date().toISOString();
  const {data:req}=await db.from("receiving_pull_sync_requests").select("id").eq("id",requestId).eq("status","running").eq("claimed_by_node_id",node.id).maybeSingle();
  if(req)await db.from("receiving_pull_sync_requests").update({status:"pending",started_at:null,completed_at:null,claimed_by_node_id:null,lease_expires_at:null,message:"Falha em "+node.display_name+": "+msg+" Aguardando outro computador."}).eq("id",requestId);
  if(Number.isInteger(runId))await db.from("receiving_pull_agent_runs").update({status:"failed",completed_at:now,message:msg}).eq("id",runId).eq("agent_node_id",node.id);
  await db.from("receiving_pull_agent_nodes").update({status:"error",last_seen_at:now,last_error:msg,cooldown_until:futureIso(5),updated_at:now}).eq("id",node.id);
  return{ok:true,requeued:!!req}
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});if(req.method!=="POST")return json(req,{error:"Método não permitido."},405);
 try{
  const b=await body(req),a=clean(b.action,60);
  if(["agent_poll","agent_ping","agent_heartbeat","agent_complete","agent_fail","agent_update_manifest","agent_update_state","agent_update_file"].includes(a)){
    const node=await pullAgentAuth(req);if(!node)return json(req,{error:"Agente Puxada não autorizado."},401);
    if(a==="agent_ping"){const updated=await touchAgentNode(node,b);return json(req,{node:{id:updated.id,slot_code:updated.slot_code,display_name:updated.display_name,hostname:updated.hostname,status:updated.status,calibration_ready:updated.calibration_ready},agent:await getAgentStatus()})}
    if(a==="agent_poll")return json(req,{job:await claimAgentJob(node,b),agent:await getAgentStatus()});
    if(a==="agent_heartbeat")return json(req,{result:await heartbeatAgentJob(node,b)});
    if(a==="agent_complete")return json(req,{result:await finishAgentJob(node,b)});
    if(a==="agent_fail")return json(req,{result:await failAgentJob(node,b)});
    if(a==="agent_update_manifest")return json(req,await agentUpdateManifest(node,b));
    if(a==="agent_update_state")return json(req,{result:await agentUpdateState(node,b)});
    if(a==="agent_update_file")return json(req,await agentUpdateFile(node,b));
  }

  if(a==="gate_users"){
    const {data,error}=await db.from("receiving_gate_users").select("id,display_name").eq("active",true).order("display_name");if(error)throw error;
    return json(req,{users:data||[]});
  }
  if(a==="gate_login"){
    const userId=clean(b.user_id,80),pin=clean(b.pin,10);if(!userId)throw new Error("Selecione seu nome.");if(!/^\d{4}$/.test(pin))throw new Error("Informe o PIN de 4 dígitos.");
    const {data:g,error}=await db.from("receiving_gate_users").select("id,display_name,pin_hash,active").eq("id",userId).maybeSingle();if(error)throw error;
    if(!g||!g.active||!g.pin_hash||await hash(pin)!==g.pin_hash)return json(req,{error:"Nome ou PIN da Portaria inválido."},401);
    const token=crypto.randomUUID()+crypto.randomUUID();const tokenHash=await hash(token);const expires=new Date(Date.now()+12*60*60*1000).toISOString();
    await db.from("receiving_gate_sessions").delete().lt("expires_at",new Date().toISOString());
    const {error:se}=await db.from("receiving_gate_sessions").insert({token_hash:tokenHash,gate_user_id:g.id,expires_at:expires});if(se)throw se;
    return json(req,{token,gate:{id:g.id,display_name:g.display_name},expires_at:expires});
  }
  if(["gate_session","gate_logout","gate_list_receipts","gate_create_receipt","gate_update_receipt"].includes(a)){
    const g=await gateUser(req);if(!g)return json(req,{error:"Sessão da Portaria inválida ou expirada."},401);
    if(a==="gate_session")return json(req,{gate:g});
    if(a==="gate_logout"){const t=req.headers.get("x-gate-token")||"";if(t)await db.from("receiving_gate_sessions").delete().eq("token_hash",await hash(t));return json(req,{ok:true})}
    if(a==="gate_list_receipts"){
      const today=new Date().toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"});
      const {data,error}=await db.from("receiving_nri_receipts").select(receiptSelect).gte("arrival_date",b.all? "2000-01-01":today).order("arrival_date",{ascending:false}).order("id",{ascending:false}).limit(100);
      if(error)throw error;return json(req,{receipts:(data||[]).map((r:any)=>({...r,display_name:receiptName(r)}))});
    }
    if(a==="gate_create_receipt"){
      const x=validateHeader(b.receipt||{});if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.arrival_time))throw new Error("Hora de chegada inválida.");
      const row={receipt_code:receiptCode(),...x,gate_reception:g.display_name,status:"awaiting_conference",pull_status:"pending",gate_created_by:g.id,gate_updated_by:g.id};
      const {data,error}=await db.from("receiving_nri_receipts").insert(row).select(receiptSelect).single();if(error)throw error;
      return json(req,{receipt:{...data,display_name:receiptName(data)}},201);
    }
    if(a==="gate_update_receipt"){
      const id=Number(b.id),x=validateHeader(b.receipt||{});if(!Number.isInteger(id)||id<=0)throw new Error("Recebimento inválido.");
      const {data:old}=await db.from("receiving_nri_receipts").select("status,unload_started_at").eq("id",id).maybeSingle();if(!old)throw new Error("Recebimento não encontrado.");
      if(old.status!=="awaiting_conference"||old.unload_started_at)throw new Error("A Portaria não pode alterar a carreta depois que o empilhador iniciou a descarga.");
      const {data,error}=await db.from("receiving_nri_receipts").update({...x,gate_reception:g.display_name,gate_updated_by:g.id,updated_at:new Date().toISOString()}).eq("id",id).select(receiptSelect).single();if(error)throw error;
      return json(req,{receipt:{...data,display_name:receiptName(data)}});
    }
  }

  if(["conference_queue","conference_start","conference_reopen","catalog_search","conference_save","conference_finalize","conference_history","conference_print_history","conference_log_print"].includes(a)){
    const u=await confUser(req);if(!u)return json(req,{error:"Sessão do conferente inválida ou expirada."},401);
    if(a==="catalog_search")return json(req,{items:await catalog(b.query)});
    if(a==="conference_queue"){const all=await listReceipts({status:"all"},true);return json(req,{receipts:all.filter((r:any)=>(r.status==="awaiting_conference"&&!!r.unload_started_at)||(r.status==="in_conference"&&r.conference_by===u.id))})}
    if(a==="conference_history"){const all=await listReceipts({status:"all"},true);return json(req,{receipts:all.filter((r:any)=>r.conference_by===u.id).slice(0,100)})}
    if(a==="conference_print_history"){
      const id=Number(b.id);if(!Number.isInteger(id)||id<=0)throw new Error("Recebimento inválido.");
      const {data:r}=await db.from("receiving_nri_receipts").select("id,status,conference_by").eq("id",id).maybeSingle();
      if(!r||r.conference_by!==u.id)throw new Error("Este recebimento não pertence à sua conferência.");
      const {data,error}=await db.from("receiving_nri_print_log").select("id,item_id,print_type,copies,printed_at").eq("receipt_id",id).order("printed_at",{ascending:false});
      if(error)throw error;return json(req,{logs:data||[]});
    }
    if(a==="conference_log_print"){
      const id=Number(b.id),type=clean(b.print_type,20);if(!["original","second_copy"].includes(type))throw new Error("Tipo de impressão inválido.");
      const {data:r}=await db.from("receiving_nri_receipts").select("id,status,conference_by").eq("id",id).maybeSingle();
      if(!r||r.status!=="conference_completed"||r.conference_by!==u.id)throw new Error("A impressão só é liberada ao conferente responsável após finalizar a conferência.");
      const {data:prior,error:priorError}=await db.from("receiving_nri_print_log").select("id,print_type").eq("receipt_id",id);if(priorError)throw priorError;
      const hasOriginal=(prior||[]).some((x:any)=>x.print_type==="original");
      if(type==="original"&&hasOriginal)throw new Error("A impressão original já foi registrada. Use 2ª via.");
      if(type==="second_copy"&&!hasOriginal)throw new Error("A 2ª via só é liberada após a impressão original.");
      const items=Array.isArray(b.items)?b.items:[];if(!items.length)throw new Error("Nenhuma NRI para imprimir.");
      for(const x of items){const copies=int(x.copies,"Cópias",1);const itemId=Number(x.item_id);const {data:item}=await db.from("receiving_nri_items").select("id").eq("id",itemId).eq("receipt_id",id).maybeSingle();if(!item)throw new Error("Item de NRI inválido.");const {error}=await db.from("receiving_nri_print_log").insert({receipt_id:id,item_id:itemId,print_type:type,copies,printed_by_conferencer:u.id});if(error)throw error}
      return json(req,{ok:true});
    }
    const id=Number(b.id);if(!Number.isInteger(id)||id<=0)throw new Error("Recebimento inválido.");
    const {data:r,error}=await db.from("receiving_nri_receipts").select(blindReceiptSelect).eq("id",id).maybeSingle();if(error)throw error;if(!r)throw new Error("Recebimento não encontrado.");
    if(a==="conference_reopen"){
      if(r.conference_by!==u.id)throw new Error("Este recebimento não pertence à sua conferência.");
      const {error:reopenError}=await db.rpc("receiving_reopen_conference",{p_receipt_id:id,p_conferencer_id:u.id});if(reopenError)throw reopenError;
      const {data:x,error:xe}=await db.from("receiving_nri_receipts").select(blindReceiptSelect).eq("id",id).single();if(xe)throw xe;
      return json(req,{receipt:{...x,display_name:receiptName(x)}});
    }
    if(a==="conference_start"){
      if(r.status==="awaiting_conference"){
        if(!r.unload_started_at)throw new Error("A conferência só é liberada depois que o empilhador iniciar a descarga.");
        const now=new Date().toISOString();const {data:x,error:e}=await db.from("receiving_nri_receipts").update({status:"in_conference",conference_by:u.id,conference_started_at:now,updated_at:now}).eq("id",id).eq("status","awaiting_conference").not("unload_started_at","is",null).select(blindReceiptSelect).maybeSingle();if(e)throw e;if(!x)throw new Error("A carreta já foi assumida por outro conferente.");return json(req,{receipt:{...x,display_name:receiptName(x)}})}
      if(r.status==="in_conference"&&r.conference_by===u.id)return json(req,{receipt:{...r,display_name:receiptName(r)}});throw new Error("Esta carreta não está disponível para você.");
    }
    if(r.status!=="in_conference"||r.conference_by!==u.id)throw new Error("Esta conferência não está aberta para você.");
    if(a==="conference_save"){await saveItems(r,b.items);return json(req,{ok:true})}
    if(a==="conference_finalize"){await saveItems(r,b.items);const {count}=await db.from("receiving_nri_items").select("id",{count:"exact",head:true}).eq("receipt_id",id);if(!count)throw new Error("Inclua pelo menos um produto.");const now=new Date().toISOString();const autoFinish=!!r.unload_started_at&&r.unload_status!=="completed";const patch:any={status:"conference_completed",conference_completed_at:now,revision:Number(r.revision||1)+1,updated_at:now};if(autoFinish){patch.unload_status="completed";patch.unload_completed_at=now;patch.unload_completion_source="conference_finalize"}const {data:x,error:e}=await db.from("receiving_nri_receipts").update(patch).eq("id",id).select(blindReceiptSelect).single();if(e)throw e;if(autoFinish&&r.unload_operator_id)await db.from("receiving_unload_events").insert({receipt_id:id,operator_id:r.unload_operator_id,event_type:"AUTO_FINISH",details:{source:"conference_finalize"}});return json(req,{receipt:{...x,display_name:receiptName(x)}})}
  }

  const u=await appUser(req);if(!u)return json(req,{error:"Sessão do Painel inválida ou expirada."},401);
  if(a==="admin_delete_access")return json(req,{can_delete:u.role==="admin",user:{display_name:u.display_name,role:u.role}});
  if(a==="admin_delete_receipt"){
    if(u.role!=="admin")return json(req,{error:"Somente administradores podem excluir recebimentos."},403);
    const id=Number(b.id);if(!Number.isInteger(id)||id<=0)throw new Error("Recebimento inválido.");
    const {data,error}=await db.rpc("admin_delete_receiving_receipt",{p_id:id,p_deleted_by:u.id});if(error)throw error;
    return json(req,{ok:true,reference:data});
  }
  if(a==="gate_pin_status"){
    if(u.role!=="admin")return json(req,{error:"Acesso restrito à administração."},403);
    const {data,error}=await db.from("receiving_gate_users").select("id,display_name,pin_hash,active,updated_at").order("display_name");if(error)throw error;
    return json(req,{users:(data||[]).map((x:any)=>({id:x.id,display_name:x.display_name,pin_ready:!!x.pin_hash,active:x.active,updated_at:x.updated_at}))});
  }
  if(a==="gate_generate_pin"||a==="gate_reset_pin"){
    if(u.role!=="admin")return json(req,{error:"Acesso restrito à administração."},403);
    const userId=clean(b.id,80);if(!userId)throw new Error("Usuário da Portaria inválido.");
    const {data:old,error:oe}=await db.from("receiving_gate_users").select("id,display_name,pin_hash").eq("id",userId).single();if(oe)throw oe;
    if(a==="gate_generate_pin"&&old.pin_hash)return json(req,{issued:null});
    const pin=randomPin();const {error}=await db.from("receiving_gate_users").update({pin_hash:await hash(pin),updated_at:new Date().toISOString()}).eq("id",userId);if(error)throw error;
    await db.from("receiving_gate_sessions").delete().eq("gate_user_id",userId);
    return json(req,{issued:{id:old.id,display_name:old.display_name,pin}});
  }
  if(a==="system_020501_import")return json(req,{import:await import020501(u,b)});
  if(a==="system_020501_status")return json(req,{status:await system020501Status()});
  if(a==="pull_auto_compare"){const id=Number(b.id);if(!Number.isInteger(id)||id<=0)throw new Error("Recebimento inválido.");return json(req,{comparison:await autoComparePull(id,u)})}

  if(a==="agent_status")return json(req,{agent:await getAgentStatus()});
  if(a==="agent_request_sync"){
    const {data:existing}=await db.from("receiving_pull_sync_requests").select("*").in("status",["pending","running"]).order("requested_at",{ascending:true}).limit(1).maybeSingle();
    if(existing)return json(req,{request:existing,already_pending:true});
    const {data:req,error}=await db.from("receiving_pull_sync_requests").insert({request_type:"manual",status:"pending",requested_by:u.id,date_from:clean(b.date_from,10)||null,date_to:clean(b.date_to,10)||null}).select("*").single();if(error)throw error;
    return json(req,{request:req,already_pending:false});
  }
  if(a==="agent_generate_token"||a==="agent_reset_token"){
    if(u.role!=="admin")return json(req,{error:"Acesso restrito à administração."},403);
    const nodeId=clean(b.node_id,80),slot=clean(b.slot_code,20).toUpperCase();if(!nodeId&&!slot)throw new Error("Selecione o computador do agente.");
    let q=db.from("receiving_pull_agent_nodes").select("*");q=nodeId?q.eq("id",nodeId):q.eq("slot_code",slot);
    const {data:node,error:ae}=await q.maybeSingle();if(ae)throw ae;if(!node)throw new Error("Computador do agente não encontrado.");
    if(a==="agent_generate_token"&&node.token_hash)return json(req,{issued:null,node:{id:node.id,slot_code:node.slot_code,display_name:node.display_name}});
    const token="pa_"+crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
    const {error}=await db.from("receiving_pull_agent_nodes").update({token_hash:await hash(token),status:"offline",hostname:null,agent_version:null,calibration_ready:false,last_seen_at:null,last_error:null,cooldown_until:null,updated_at:new Date().toISOString()}).eq("id",node.id);if(error)throw error;
    return json(req,{issued:{node_id:node.id,slot_code:node.slot_code,display_name:node.display_name,token}});
  }
  if(a==="agent_set_interval"){
    if(u.role!=="admin")return json(req,{error:"Acesso restrito à administração."},403);
    const minutes=int(b.minutes,"Intervalo",5);if(minutes>120)throw new Error("O intervalo máximo é 120 minutos.");
    const {error}=await db.from("receiving_pull_agent").update({sync_interval_minutes:minutes,updated_at:new Date().toISOString()}).eq("id",1);if(error)throw error;return json(req,{ok:true})
  }
  if(a==="counts")return json(req,{counts:await counts()});
  if(a==="list_receipts")return json(req,{receipts:await listReceipts(b,false),counts:await counts()});
  if(a==="catalog_search")return json(req,{items:await catalog(b.query)});
  if(a==="create_receipt"){
    const x=validateHeader(b.receipt||{});if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.arrival_time))throw new Error("Hora de chegada inválida.");
    const row={receipt_code:receiptCode(),...x,status:"awaiting_conference",pull_status:"pending",created_by:u.id,updated_by:u?.id||null};
    const {data,error}=await db.from("receiving_nri_receipts").insert(row).select(receiptSelect).single();if(error)throw error;return json(req,{receipt:{...data,display_name:receiptName(data)}},201)
  }
  if(a==="update_receipt"){
    const id=Number(b.id),x=validateHeader(b.receipt||{});const {data:old}=await db.from("receiving_nri_receipts").select("status,unload_started_at").eq("id",id).maybeSingle();if(!old)throw new Error("Recebimento não encontrado.");if(old.status==="conference_completed"||old.unload_started_at)throw new Error("Dados da Portaria ficam bloqueados após o início da descarga.");const {data,error}=await db.from("receiving_nri_receipts").update({...x,updated_by:u?.id||null,updated_at:new Date().toISOString()}).eq("id",id).select(receiptSelect).single();if(error)throw error;return json(req,{receipt:{...data,display_name:receiptName(data)}})
  }
  if(a==="cancel_receipt"){const id=Number(b.id);const {data,error}=await db.from("receiving_nri_receipts").update({status:"cancelled",updated_by:u?.id||null,updated_at:new Date().toISOString()}).eq("id",id).neq("status","conference_completed").select("id,receipt_code,status").maybeSingle();if(error)throw error;if(!data)throw new Error("Recebimento concluído não pode ser cancelado.");return json(req,{receipt:data})}
  if(a==="receipt_detail"){const id=Number(b.id);const {data,error}=await db.from("receiving_nri_receipts").select(receiptSelect).eq("id",id).maybeSingle();if(error)throw error;if(!data)throw new Error("Recebimento não encontrado.");return json(req,{receipt:{...data,display_name:receiptName(data)}})}
  if(a==="pull_save"){
    const id=Number(b.id);const {data:r}=await db.from("receiving_nri_receipts").select("id,status").eq("id",id).maybeSingle();if(!r||r.status!=="conference_completed")throw new Error("A conferência física precisa estar finalizada.");
    const rows=Array.isArray(b.items)?b.items:[];if(!rows.length)throw new Error("Informe os dados do sistema.");
    let divergent=false,pending=false;for(const x of rows){const itemId=Number(x.id),sq=x.system_qty===""||x.system_qty==null?null:num(x.system_qty,"Quantidade do sistema",0);if(sq==null){pending=true;continue}const {data:item}=await db.from("receiving_nri_items").select("physical_qty").eq("id",itemId).eq("receipt_id",id).maybeSingle();if(!item)continue;const diff=Math.round((Number(item.physical_qty)-sq)*1000)/1000,status=Math.abs(diff)<0.0001?"matched":"divergent";if(status==="divergent")divergent=true;const {error}=await db.from("receiving_nri_items").update({system_qty:sq,comparison_diff:diff,comparison_status:status,system_updated_by:u?.id||null,system_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",itemId);if(error)throw error}
    const pull=pending?"in_progress":divergent?"divergent":"matched";const {data,error}=await db.from("receiving_nri_receipts").update({pull_status:pull,updated_by:u?.id||null,updated_at:new Date().toISOString()}).eq("id",id).select(receiptSelect).single();if(error)throw error;return json(req,{receipt:{...data,display_name:receiptName(data)}})
  }
  if(a==="log_print"){
    const id=Number(b.id),type=clean(b.print_type,20);if(!["original","second_copy"].includes(type))throw new Error("Tipo de impressão inválido.");const {data:r}=await db.from("receiving_nri_receipts").select("id,status,conference_by").eq("id",id).maybeSingle();if(!r||r.status!=="conference_completed")throw new Error("A impressão só é liberada após a conferência autenticada.");
    const items=Array.isArray(b.items)?b.items:[];for(const x of items){const copies=int(x.copies,"Cópias",1);const {error}=await db.from("receiving_nri_print_log").insert({receipt_id:id,item_id:Number(x.item_id)||null,print_type:type,copies,printed_by_app_user:u.id,printed_by_conferencer:r.conference_by});if(error)throw error}return json(req,{ok:true})
  }
  if(a==="print_history"){const id=Number(b.id);const {data,error}=await db.from("receiving_nri_print_log").select("id,item_id,print_type,copies,printed_at,app:app_users(display_name),conferencer:bo_conferencers(display_name)").eq("receipt_id",id).order("printed_at",{ascending:false});if(error)throw error;return json(req,{logs:data||[]})}
  return json(req,{error:"Ação inválida."},400)
 }catch(e){console.error(e);return json(req,{error:e instanceof Error?e.message:"Erro interno."},500)}
});