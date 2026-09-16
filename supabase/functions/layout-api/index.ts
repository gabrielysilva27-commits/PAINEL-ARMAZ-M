import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

const SLOTS=12;
const CAIXARIA=[
  {id:"CX1",label:"Antarctica 1L",codes:["1743"]},
  {id:"CX2",label:"Antarctica 600",codes:["2538"]},
  {id:"CX3",label:"Brahma 600",codes:["988"]},
  {id:"CX4",label:"Antarctica 300",codes:["13203"]},
  {id:"CX5",label:"Brahma 1L",codes:["1695"]},
  {id:"CX6",label:"Brahma 300",codes:["13201"]},
  {id:"CX7",label:"Brahma 300",codes:["13201"]},
];
const FRONT=[
  {id:"PF1",capacity:6,label:"Brahma Latão 473",kind:"brahma473"},
  {id:"PF2",capacity:6,label:"Guaravita 290ml",kind:"guaravita"},
];
const MAIN=[
  {id:"R01",capacity:13,label:"PET 2L",kind:"pet2"},
  {id:"R02",capacity:13,label:"3L + 600ml / OW + CX",kind:"mixed"},
  {id:"R03",label:"PET 1L",kind:"pet1"},
  {id:"R04",label:"Long Neck",kind:"longneck"},
  {id:"R05",label:"Lata 473",kind:"lata473"},
  {id:"R06",label:"Lata 350",kind:"lata350"},
  {id:"R07",label:"PET 200ml",kind:"pet200"},
  {id:"R08",label:"Gatorade",kind:"gatorade"},
  {id:"R09",capacity:13,label:"Águas",kind:"water"},
];
const MAIN_BLOCKS=[
  {id:"P1",type:"double",streets:["R01","R02"]},
  {id:"P2",type:"double",streets:["R03","R04"]},
  {id:"P3",type:"double",streets:["R05","R06"]},
  {id:"P4",type:"double",streets:["R07","R08"]},
  {id:"P5",type:"single",streets:["R09"]},
];
const TOTAL_STREETS=CAIXARIA.length+FRONT.length+MAIN.length;
const TOTAL_SLOTS=[...CAIXARIA,...FRONT,...MAIN].reduce((sum,street)=>sum+('capacity' in street?Number(street.capacity):SLOTS),0);
const METHOD_VERSION="picking-layout-physical-v4";

function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function requireSession(req:Request){const token=req.headers.get("x-session-token")||"";if(!token)return null;const tokenHash=await sha256(token);const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();return u||null;}
function normalizeMonth(v:string){if(!/^\d{4}-\d{2}$/.test(v))throw new Error("Mês inválido");return `${v}-01`;}
function cleanNum(v:any){const n=Number(v);return Number.isFinite(n)?n:0;}
function stripPack(v:any){return String(v||"").replace(/^\s*\d+\s*-\s*/,"").trim();}
function upper(v:any){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();}
function familyLabel(packaging:any,family:any,skuName:any=""){
  const raw=upper(stripPack(packaging));const name=upper(skuName);
  if(name.includes("GATORADE"))return "Gatorade";
  if(name.includes("MINALBA")||name.includes("AGUA MINERAL"))return "Águas";
  if(raw.includes("LATA 473"))return "Lata 473ml";
  if(raw.includes("LATA 355")||raw.includes("LATA 350")||raw.includes("LATA SLEEK 350")||raw.includes("LATA 269"))return "Latas 269–350ml";
  if(raw.includes("PET 2"))return "PET 2L";
  if(raw.includes("PET 1,5")||raw.includes("PET 1500"))return "PET 1,5L";
  if(raw.includes("PET 1")||raw.includes("PLASTICO 1L"))return "PET 1L";
  if(raw.includes("PET 600"))return "PET 600ml";
  if(raw.includes("PET 500"))return "PET 500ml";
  if(raw.includes("PET 200"))return "PET 200ml";
  if(raw.includes("LONG-NECK")||raw.includes("LONG NECK"))return "Long Neck";
  if(raw.includes("GARRAFA INTEIRA"))return "Retornável 600ml";
  if(raw.includes("RET.1000")||raw.includes("RET 1000"))return "Retornável 1L";
  if(raw.includes("GFA VD 300")||raw.includes("GARRAFA VD 300"))return "Retornável 300ml";
  if(raw.includes("SACO")||name.includes("BAG IN BOX"))return "Bag in Box";
  if(raw)return stripPack(packaging);
  const f=String(family||"").trim();return f?`Família ${f}`:"Outros";
}
function curveOrder(c:string){return c==="A"?0:c==="B"?1:2;}
function physicalKind(x:any){
  const name=upper(x.sku_name),pack=upper(stripPack(x.packaging));
  if(name.includes("GATORADE"))return "gatorade";
  if(name.includes("MINALBA")||name.includes("AGUA MINERAL"))return "water";
  if(pack.includes("PET 2"))return "pet2";
  if(pack.includes("PET 1")&&!pack.includes("1,5")&&!pack.includes("1500")||pack.includes("PLASTICO 1L"))return "pet1";
  if(pack.includes("LONG-NECK")||pack.includes("LONG NECK"))return "longneck";
  if(pack.includes("LATA 473"))return "lata473";
  if(pack.includes("LATA 355")||pack.includes("LATA 350")||pack.includes("LATA SLEEK 350")||pack.includes("LATA 269"))return "lata350";
  if(pack.includes("PET 200"))return "pet200";
  if(pack.includes("SACO")||name.includes("BAG IN BOX"))return "flow_bags";
  if(name.includes("COROTE"))return "flow_corote";
  if(pack.includes("COPO")||name.includes("DESCART"))return "flow_descartaveis";
  if(pack.includes("GARRAFA INTEIRA")||pack.includes("RET.1000")||pack.includes("RET 1000")||pack.includes("GFA VD 300")||pack.includes("GARRAFA VD 300"))return "flow_returnable";
  return "mixed";
}
function isBrahmaLatao(x:any){const name=upper(x.sku_name),pack=upper(stripPack(x.packaging));return pack.includes("LATA 473")&&name.includes("BRAHMA CHOPP")&&!name.includes("DUPLO MALTE");}
function isGuaravitaFront(x:any){const name=upper(x.sku_name),pack=upper(stripPack(x.packaging));return x.sku_code==="22209"||(name.includes("GUARAVITA NAT")&&name.includes("C/24")&&pack.includes("COPO PLASTICO 290"));}

function calculateCurve(rows:any[]){
  const data=rows.map(r=>({sku_code:String(r.sku_code||"").trim(),sku_name:String(r.sku_name||"").trim(),packaging:r.packaging||null,family_siv:r.family_siv||null,volume_boxes:cleanNum(r.volume_boxes),volume_hl:cleanNum(r.volume_hl)})).filter(r=>r.sku_code&&r.volume_hl>0).sort((a,b)=>b.volume_hl-a.volume_hl||a.sku_code.localeCompare(b.sku_code));
  const total=data.reduce((s,r)=>s+r.volume_hl,0);let cum=0;
  return data.map((r,i)=>{const w=total?r.volume_hl/total:0;cum+=w;let cls:string;if(i===0)cls="A";else cls=cum<=.70?"A":cum<=.90?"B":"C";return {...r,rank:i+1,weight_pct:w*100,pareto_pct:cum*100,curve_class:cls,zone:cls==="A"?"Frente":cls==="B"?"Meio":"Fundo",assigned_slots:0,family_label:familyLabel(r.packaging,r.family_siv,r.sku_name)};});
}
function makeSlot(item:any,position:number,streetId:string){return {position,street_id:streetId,sku_code:item.sku_code,sku_name:item.sku_name,curve_class:item.curve_class,family_label:item.family_label||familyLabel(item.packaging,item.family_siv,item.sku_name),volume_hl:item.volume_hl,rank:item.rank};}
function fillStreet(pool:any[],street:any,forceFull=false){
  const capacity=street.capacity||SLOTS;
  const sorted=[...pool].sort((a,b)=>curveOrder(a.curve_class)-curveOrder(b.curve_class)||b.volume_hl-a.volume_hl||a.rank-b.rank);
  if(!sorted.length)return {...street,capacity,used:0,slots:Array(capacity).fill(null),skus:[]};
  const counts=new Map<string,number>();
  for(const x of sorted.slice(0,capacity))counts.set(x.sku_code,1);
  let used=[...counts.values()].reduce((a,b)=>a+b,0);
  const target=forceFull?capacity:capacity;
  while(used<target){const eligible=sorted.filter(x=>counts.has(x.sku_code));if(!eligible.length)break;let best=eligible[0];let bestScore=-1;for(const x of eligible){const current=counts.get(x.sku_code)||0;const score=(x.volume_hl||0)/(current+1);if(score>bestScore){best=x;bestScore=score;}}counts.set(best.sku_code,(counts.get(best.sku_code)||0)+1);used++;if(!forceFull&&sorted.length>capacity)break;}
  const tokens:any[]=[];for(const x of sorted){const n=counts.get(x.sku_code)||0;for(let i=0;i<n;i++)tokens.push(x);}
  tokens.sort((a,b)=>curveOrder(a.curve_class)-curveOrder(b.curve_class)||b.volume_hl-a.volume_hl||a.rank-b.rank);
  const slots=Array(capacity).fill(null);tokens.slice(0,capacity).forEach((x,i)=>slots[i]=makeSlot(x,i+1,street.id));
  return {...street,capacity,used:tokens.length,slots,skus:[...counts.entries()].map(([sku_code,count])=>({sku_code,count}))};
}
function buildPhysicalPlan(items:any[]){
  const rows=items.map(x=>({...x,family_label:x.family_label||familyLabel(x.packaging,x.family_siv,x.sku_name),assigned_slots:0}));
  const byCode=new Map(rows.map(x=>[x.sku_code,x]));
  const reserved=new Set<string>();

  const caixaria=CAIXARIA.map(st=>{const pool=st.codes.map(c=>byCode.get(c)).filter(Boolean);for(const x of pool)reserved.add(x.sku_code);return fillStreet(pool,st,true);});

  const brahma=rows.filter(x=>!reserved.has(x.sku_code)&&isBrahmaLatao(x));brahma.forEach(x=>reserved.add(x.sku_code));
  const guaravita=rows.filter(x=>!reserved.has(x.sku_code)&&isGuaravitaFront(x));guaravita.forEach(x=>reserved.add(x.sku_code));
  const front=[fillStreet(brahma,FRONT[0],true),fillStreet(guaravita,FRONT[1],true)];

  const main:any[]=[];const overflow:any[]=[];
  for(const st of MAIN){
    const pool=rows.filter(x=>!reserved.has(x.sku_code)&&physicalKind(x)===st.kind).sort((a,b)=>curveOrder(a.curve_class)-curveOrder(b.curve_class)||b.volume_hl-a.volume_hl||a.rank-b.rank);
    const capacity='capacity' in st?Number(st.capacity):SLOTS;
    const chosen=pool.slice(0,capacity);chosen.forEach(x=>reserved.add(x.sku_code));overflow.push(...pool.slice(capacity));
    main.push(fillStreet(chosen,st,false));
  }

  const unmatched=rows.filter(x=>!reserved.has(x.sku_code)&&!overflow.some(o=>o.sku_code===x.sku_code));overflow.push(...unmatched);
  const flow={returnable:[] as any[],corote:[] as any[],bags:[] as any[],disposables:[] as any[],support:[] as any[]};
  for(const x of overflow.sort((a,b)=>curveOrder(a.curve_class)-curveOrder(b.curve_class)||a.rank-b.rank)){
    const k=physicalKind(x);const row={sku_code:x.sku_code,sku_name:x.sku_name,curve_class:x.curve_class,family_label:x.family_label,volume_hl:x.volume_hl,rank:x.rank};
    if(k==="flow_returnable")flow.returnable.push(row);else if(k==="flow_corote")flow.corote.push(row);else if(k==="flow_bags")flow.bags.push(row);else if(k==="flow_descartaveis")flow.disposables.push(row);else flow.support.push(row);
  }

  const allStreets=[...caixaria,...front,...main];
  const occurrence=new Map<string,number>();for(const st of allStreets)for(const s of st.slots)if(s)occurrence.set(s.sku_code,(occurrence.get(s.sku_code)||0)+1);
  for(const x of rows)x.assigned_slots=occurrence.get(x.sku_code)||0;
  const blocks=MAIN_BLOCKS.map(b=>({...b,streets:b.streets.map(id=>main.find(s=>s.id===id))}));
  return {items:rows,plan:{method_version:METHOD_VERSION,slots_per_street:SLOTS,total_streets:TOTAL_STREETS,total_slots:TOTAL_SLOTS,used_slots:allStreets.reduce((s,x)=>s+x.used,0),caixaria,front,blocks,main,flow,principles:["Caixaria fixa sem corredor interno","Duas ruas frontais de alto giro","Família/embalagem define a rua","Curva A ocupa a frente da própria rua; B o meio; C o fundo","Excedentes seguem para flow rack/apoio, sem desmontar o desenho físico"]}};
}

async function getCatalogMap(codes:string[]){const map=new Map<string,any>();for(let i=0;i<codes.length;i+=150){const chunk=codes.slice(i,i+150);const {data,error}=await db.from("product_catalog").select("sku_code,sku_name,packaging,family_siv,factor_hecto_commercial,boxes_per_pallet,subtype").in("sku_code",chunk);if(error)throw error;for(const r of data||[])map.set(String(r.sku_code),r);}return map;}
async function buildFromOcp(ocpItems:any[]){const merged=new Map<string,any>();for(const r of ocpItems||[]){const code=String(r.sku_code||"").trim();const boxes=cleanNum(r.volume_boxes??r.boxes);if(!code||boxes<=0)continue;const p=merged.get(code)||{sku_code:code,sku_name:String(r.sku_name||""),volume_boxes:0};p.volume_boxes+=boxes;if(!p.sku_name&&r.sku_name)p.sku_name=String(r.sku_name);merged.set(code,p);}const codes=[...merged.keys()];const catalog=await getCatalogMap(codes);const missing:string[]=[];const rows:any[]=[];for(const r of merged.values()){const c=catalog.get(r.sku_code);const factor=cleanNum(c?.factor_hecto_commercial);if(!c||factor<=0){missing.push(r.sku_code);continue;}rows.push({sku_code:r.sku_code,sku_name:c.sku_name||r.sku_name,packaging:c.packaging,family_siv:c.family_siv,volume_boxes:r.volume_boxes,volume_hl:r.volume_boxes*factor});}if(missing.length)throw new Error(`01.11 sem cadastro/fator para ${missing.slice(0,15).join(", ")}${missing.length>15?"…":""}`);return calculateCurve(rows);}
async function persistMonth(month:string,sourceFile:string,userId:string,items:any[]){const ref=normalizeMonth(month);const physical=buildPhysicalPlan(items);const {error:merr}=await db.from("picking_layout_months").upsert({reference_month:ref,source_file:sourceFile,status:"imported",method_version:METHOD_VERSION,generated_at:new Date().toISOString(),generated_by:userId,updated_at:new Date().toISOString()},{onConflict:"reference_month"});if(merr)throw merr;const {error:derr}=await db.from("picking_layout_items").delete().eq("reference_month",ref);if(derr)throw derr;for(let i=0;i<physical.items.length;i+=150){const batch=physical.items.slice(i,i+150).map(x=>({reference_month:ref,rank:x.rank,sku_code:x.sku_code,sku_name:x.sku_name,packaging:x.packaging,family_siv:x.family_siv,volume_boxes:x.volume_boxes,volume_hl:x.volume_hl,weight_pct:x.weight_pct,pareto_pct:x.pareto_pct,curve_class:x.curve_class,assigned_slots:x.assigned_slots,zone:x.zone}));const {error}=await db.from("picking_layout_items").insert(batch);if(error)throw error;}return physical;}
async function loadMonth(month:string){const ref=normalizeMonth(month);const {data:stored,error:serr}=await db.from("picking_layout_items").select("rank,sku_code,sku_name,packaging,family_siv,volume_boxes,volume_hl,weight_pct,pareto_pct,curve_class,assigned_slots,zone").eq("reference_month",ref).order("rank");if(serr)throw serr;let rows:any[]=[];let source="none";if(stored?.length){rows=stored.map(x=>({...x,family_label:familyLabel(x.packaging,x.family_siv,x.sku_name)}));source="layout";}else{const {data:abc,error:aerr}=await db.from("abc_items").select("rank,sku_code,sku_name,volume_caixas,volume_hl,weight_pct,pareto_pct,curve_class").eq("reference_month",ref).eq("area","Picking").order("rank");if(aerr)throw aerr;if(!abc?.length)return {items:[],source,plan:buildPhysicalPlan([]).plan};const catalog=await getCatalogMap(abc.map(x=>String(x.sku_code)));rows=abc.map((x:any)=>{const c=catalog.get(String(x.sku_code));return {rank:x.rank,sku_code:String(x.sku_code),sku_name:x.sku_name,packaging:c?.packaging||null,family_siv:c?.family_siv||null,volume_boxes:cleanNum(x.volume_caixas),volume_hl:cleanNum(x.volume_hl),weight_pct:cleanNum(x.weight_pct),pareto_pct:cleanNum(x.pareto_pct),curve_class:x.curve_class,zone:x.curve_class==="A"?"Frente":x.curve_class==="B"?"Meio":"Fundo",assigned_slots:0,family_label:familyLabel(c?.packaging,c?.family_siv,x.sku_name)};});source="abc";}const physical=buildPhysicalPlan(rows);return {items:physical.items,source,plan:physical.plan};}

Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Método não permitido"},405);try{const body=await req.json();const user=await requireSession(req);if(!user)return json({error:"Sessão inválida ou expirada"},401);const action=String(body?.action||"");
if(action==="months"){const [{data:l,error:le},{data:a,error:ae}]=await Promise.all([db.from("picking_layout_months").select("reference_month,source_file,status,generated_at,method_version").order("reference_month"),db.from("abc_months").select("reference_month,status").eq("status","imported").order("reference_month")]);if(le)throw le;if(ae)throw ae;const map=new Map<string,any>();for(const x of a||[])map.set(String(x.reference_month).slice(0,10),{reference_month:x.reference_month,status:"imported",source:"abc"});for(const x of l||[])map.set(String(x.reference_month).slice(0,10),{...x,source:"layout"});return json({months:[...map.values()].sort((x,y)=>String(x.reference_month).localeCompare(String(y.reference_month))),total_slots:TOTAL_SLOTS,street_count:TOTAL_STREETS,slots_per_street:SLOTS,method_version:METHOD_VERSION});}
if(action==="get"){const out=await loadMonth(String(body.month||""));return json({month:normalizeMonth(String(body.month||"")),total_slots:TOTAL_SLOTS,street_count:TOTAL_STREETS,slots_per_street:SLOTS,method_version:METHOD_VERSION,...out});}
if(action==="catalog_status"){const {count,error}=await db.from("product_catalog").select("sku_code",{count:"exact",head:true});if(error)throw error;return json({count:count||0});}
if(action==="catalog_import"){if(user.role!=="admin")return json({error:"Sem autorização"},403);const items=Array.isArray(body.items)?body.items:[];if(!items.length)return json({error:"Nenhum produto recebido"},400);for(let i=0;i<items.length;i+=200){const batch=items.slice(i,i+200).map((x:any)=>({sku_code:String(x.sku_code||"").trim(),sku_name:String(x.sku_name||""),packaging:x.packaging||null,family_siv:x.family_siv||null,factor_hecto_commercial:cleanNum(x.factor_hecto_commercial)||null,boxes_per_pallet:cleanNum(x.boxes_per_pallet)||null,subtype:x.subtype||null,source_file:String(body.source_file||"01.11"),updated_at:new Date().toISOString()})).filter((x:any)=>x.sku_code);const {error}=await db.from("product_catalog").upsert(batch,{onConflict:"sku_code"});if(error)throw error;}return json({ok:true,count:items.length});}
if(action==="import"){if(user.role!=="admin")return json({error:"Sem autorização"},403);if(Array.isArray(body.catalog_items)&&body.catalog_items.length){for(let i=0;i<body.catalog_items.length;i+=200){const batch=body.catalog_items.slice(i,i+200).map((x:any)=>({sku_code:String(x.sku_code||"").trim(),sku_name:String(x.sku_name||""),packaging:x.packaging||null,family_siv:x.family_siv||null,factor_hecto_commercial:cleanNum(x.factor_hecto_commercial)||null,boxes_per_pallet:cleanNum(x.boxes_per_pallet)||null,subtype:x.subtype||null,source_file:String(body.catalog_file||"01.11"),updated_at:new Date().toISOString()})).filter((x:any)=>x.sku_code);const {error}=await db.from("product_catalog").upsert(batch,{onConflict:"sku_code"});if(error)throw error;}}
const items=await buildFromOcp(body.ocp_items||[]);if(!items.length)return json({error:"Nenhum SKU válido encontrado no OCP"},400);const physical=await persistMonth(String(body.month||""),String(body.source_file||"03.02.36.01"),user.id,items);return json({ok:true,items:physical.items.length,used_slots:physical.plan.used_slots,total_slots:TOTAL_SLOTS,street_count:TOTAL_STREETS,plan:physical.plan});}
return json({error:"Ação inválida"},400);}catch(e){console.error(e);return json({error:e instanceof Error?e.message:String(e)},500);}});
