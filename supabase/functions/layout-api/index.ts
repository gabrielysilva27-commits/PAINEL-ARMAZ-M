import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const METHOD_VERSION="picking-layout-physical-v6";
const SLOTS=12;
const FLOW_SKU_CAPACITY=24;

const CAIXARIA=[
  {id:"CX1",capacity:12,label:"Antarctica 1L",codes:["1743"]},
  {id:"CX2",capacity:12,label:"Antarctica 600",codes:["2538"]},
  {id:"CX3",capacity:12,label:"Brahma 600",codes:["988"]},
  {id:"CX4",capacity:12,label:"Antarctica 300",codes:["13203"]},
  {id:"CX5",capacity:12,label:"Brahma 1L",codes:["1695"]},
  {id:"CX6",capacity:12,label:"Brahma 300",codes:["13201"]},
  {id:"CX7",capacity:12,label:"Brahma 300",codes:["13201"]},
];
const FRONT=[
  {id:"PF1",capacity:6,label:"Brahma Latão 473"},
  {id:"PF2",capacity:6,label:"Guaravita 290ml"},
];
const MAIN=[
  {id:"R1",capacity:13,label:"Águas",preferred:"water",zone:"water"},
  {id:"R2",capacity:12,label:"GT / GVTN · PET 500",preferred:"pet500",zone:"small_pet"},
  {id:"R3",capacity:12,label:"PET 200ml",preferred:"pet200",zone:"small_pet"},
  {id:"R4",capacity:12,label:"Lata 350 / 269",preferred:"can350",zone:"cans"},
  {id:"R5",capacity:12,label:"Lata 473",preferred:"can473",zone:"cans"},
  {id:"R6",capacity:12,label:"Long Neck",preferred:"longneck",zone:"glass"},
  {id:"R7",capacity:12,label:"OW + CX / 600ml",preferred:"owcx",zone:"glass"},
  {id:"R8",capacity:13,label:"PET 1L / 1,5L",preferred:"pet1_15",zone:"large_pet"},
  {id:"R9",capacity:13,label:"PET 2L / 3L",preferred:"pet2_3",zone:"large_pet"},
];
const ZONES=[
  {id:"water",label:"Águas",streets:["R1"]},
  {id:"small_pet",label:"PET pequeno",streets:["R2","R3"]},
  {id:"cans",label:"Latas",streets:["R4","R5"]},
  {id:"glass",label:"Vidro / OW",streets:["R6","R7"]},
  {id:"large_pet",label:"PET grande",streets:["R8","R9"]},
];
const TOTAL_STREETS=CAIXARIA.length+FRONT.length+MAIN.length;
const TOTAL_SLOTS=[...CAIXARIA,...FRONT,...MAIN].reduce((s,x)=>s+Number(x.capacity||SLOTS),0);

function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function requireSession(req:Request){const token=req.headers.get("x-session-token")||"";if(!token)return null;const tokenHash=await sha256(token);const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).maybeSingle();if(!s)return null;const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();return u||null;}
function normalizeMonth(v:string){if(!/^\d{4}-\d{2}$/.test(v))throw new Error("Mês inválido");return `${v}-01`;}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0;}
function upper(v:any){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();}
function stripPack(v:any){return String(v||"").replace(/^\s*\d+\s*-\s*/,"").trim();}
function curveOrder(c:string){return c==="A"?0:c==="B"?1:2;}
function spillOrder(a:any,b:any){const ca=a.curve_class==="C"?0:a.curve_class==="B"?1:2;const cb=b.curve_class==="C"?0:b.curve_class==="B"?1:2;return ca-cb||n(a.volume_hl)-n(b.volume_hl)||b.rank-a.rank;}
function isBarrel(x:any){const s=upper(`${x.sku_name||""} ${x.packaging||""}`);return s.includes("BARRIL")||s.includes(" KEG")||s.startsWith("KEG");}
function isBag(x:any){const s=upper(`${x.sku_name||""} ${x.packaging||""}`);return s.includes("BAG IN BOX")||s.includes(" SACO")||s.startsWith("SACO")||s.includes(" - SACO");}
function isBrahmaLatao(x:any){const name=upper(x.sku_name),pack=upper(stripPack(x.packaging));return pack.includes("LATA 473")&&name.includes("BRAHMA CHOPP")&&!name.includes("DUPLO MALTE");}
function isGuaravitaFront(x:any){const name=upper(x.sku_name),pack=upper(stripPack(x.packaging));return x.sku_code==="22209"||(name.includes("GUARAVITA")&&pack.includes("COPO")&&pack.includes("290"));}
function isWater(x:any){const s=upper(`${x.sku_name||""} ${stripPack(x.packaging)}`);return s.includes("MINALBA")||s.includes("PUREZA VITAL")||s.includes("AGUA MINERAL");}

function preferredLane(x:any){
  const name=upper(x.sku_name),pack=upper(stripPack(x.packaging));
  if(!pack)return null;
  if(isWater(x))return "water";
  if(name.includes("GATORADE")||name.includes("GUARAVITON")||pack.includes("PET 500"))return "pet500";
  if(pack.includes("PET 200"))return "pet200";
  if(pack.includes("LATA 473"))return "can473";
  if(pack.includes("LATA 355")||pack.includes("LATA 350")||pack.includes("LATA SLEEK 350")||pack.includes("LATA 269"))return "can350";
  if(pack.includes("LONG-NECK")||pack.includes("LONG NECK")||pack.includes("ONE-WAY 330")||pack.includes("ONE WAY 330")||pack.includes("ONE WAY 210")||pack.includes("ONE-WAY 210"))return "longneck";
  if(pack.includes("GARRAFA INTEIRA")||pack.includes("GFA VD 300")||pack.includes("GARRAFA VD 300")||pack.includes("ONE-WAY 600")||pack.includes("ONE WAY 600"))return "owcx";
  if(pack.includes("PET 1,5")||pack.includes("PET 1500")||pack.includes("PET 1L")||pack==="PET 1"||pack.startsWith("PET 1 ")||pack.includes("PLASTICO 1L"))return "pet1_15";
  if(pack.includes("PET 2")||pack.includes("PET 3L")||pack.includes("PET 600"))return "pet2_3";
  return null;
}
function zoneForLane(lane:string|null){return MAIN.find(s=>s.preferred===lane)?.zone||null;}
function familyLabel(x:any){
  const lane=preferredLane(x);
  if(lane==="water")return "Águas";
  if(lane==="pet500")return "PET 500 · GT/GVTN";
  if(lane==="pet200")return "PET 200ml";
  if(lane==="can350")return "Lata 350/269";
  if(lane==="can473")return "Lata 473";
  if(lane==="longneck")return "Long Neck";
  if(lane==="owcx")return "OW + CX / 600ml";
  if(lane==="pet1_15")return "PET 1L/1,5L";
  if(lane==="pet2_3")return "PET 2L/3L";
  return stripPack(x.packaging)||"Revisar família";
}

async function marketplaceSet(){const {data,error}=await db.from("abc_marketplace_products").select("sku_code").eq("active",true);if(error)throw error;return new Set((data||[]).map((x:any)=>String(x.sku_code)));}
function recalcCurve(rows:any[]){const data=rows.filter(x=>x.sku_code&&n(x.volume_hl)>0).sort((a,b)=>n(b.volume_hl)-n(a.volume_hl)||String(a.sku_code).localeCompare(String(b.sku_code)));const total=data.reduce((s,x)=>s+n(x.volume_hl),0);let cum=0;return data.map((x,i)=>{const w=total?n(x.volume_hl)/total:0;cum+=w;const cls=i===0?"A":cum<=.70?"A":cum<=.90?"B":"C";return {...x,rank:i+1,weight_pct:w*100,pareto_pct:cum*100,curve_class:cls,zone:cls==="A"?"Frente":cls==="B"?"Meio":"Fundo",family_label:familyLabel(x),assigned_slots:0};});}
async function filterEligible(rows:any[]){const mkp=await marketplaceSet();const excluded={marketplace:0,barris:0,bags:0};const out=[];for(const x of rows){const code=String(x.sku_code||"");if(mkp.has(code)){excluded.marketplace++;continue;}if(isBarrel(x)){excluded.barris++;continue;}if(isBag(x)){excluded.bags++;continue;}out.push(x);}return {rows:recalcCurve(out),excluded};}

function makeSlot(x:any,pos:number,streetId:string){return {position:pos,street_id:streetId,sku_code:x.sku_code,sku_name:x.sku_name,curve_class:x.curve_class,family_label:x.family_label||familyLabel(x),volume_hl:n(x.volume_hl),rank:x.rank};}
function fullFixedStreet(pool:any[],street:any){const cap=street.capacity||SLOTS;const x=pool[0];const slots=Array(cap).fill(null);if(x)for(let i=0;i<cap;i++)slots[i]=makeSlot(x,i+1,street.id);return {...street,capacity:cap,used:x?cap:0,slots,description:street.label,skus:x?[{sku_code:x.sku_code,count:cap}]:[]};}
function fillDedicatedStreet(pool:any[],street:any){
  const cap=street.capacity;const sorted=[...pool].sort((a,b)=>curveOrder(a.curve_class)-curveOrder(b.curve_class)||n(b.volume_hl)-n(a.volume_hl)||a.rank-b.rank);
  const unique=sorted.slice(0,cap);const overflow=sorted.slice(cap);const counts=new Map<string,number>();for(const x of unique)counts.set(x.sku_code,1);
  const tokens=[...unique];while(tokens.length<cap&&unique.length){let best=unique[0],score=-1;for(const x of unique){const c=counts.get(x.sku_code)||0;const s=n(x.volume_hl)/(c+1);if(s>score){score=s;best=x;}}counts.set(best.sku_code,(counts.get(best.sku_code)||0)+1);tokens.push(best);}
  tokens.sort((a,b)=>curveOrder(a.curve_class)-curveOrder(b.curve_class)||n(b.volume_hl)-n(a.volume_hl));const slots=Array(cap).fill(null);tokens.forEach((x,i)=>slots[i]=makeSlot(x,i+1,street.id));
  return {street:{...street,used:tokens.length,slots,description:street.label,skus:[...counts.entries()].map(([sku_code,count])=>({sku_code,count}))},placed:new Set(unique.map(x=>x.sku_code)),overflow};
}
function fillMainStreet(street:any,unique:any[],spillFrom:string[]=[]){
  const cap=street.capacity;const base=[...unique].sort((a,b)=>curveOrder(a.curve_class)-curveOrder(b.curve_class)||n(b.volume_hl)-n(a.volume_hl)||a.rank-b.rank);
  const counts=new Map<string,number>();for(const x of base.slice(0,cap))counts.set(x.sku_code,1);const tokens=base.slice(0,cap);
  while(tokens.length<cap&&base.length){let best=base[0],score=-1;for(const x of base){const c=counts.get(x.sku_code)||0;const curveBoost=x.curve_class==="A"?3:x.curve_class==="B"?1.35:.45;const s=(n(x.volume_hl)*curveBoost)/(c+1);if(s>score){score=s;best=x;}}counts.set(best.sku_code,(counts.get(best.sku_code)||0)+1);tokens.push(best);}
  tokens.sort((a,b)=>curveOrder(a.curve_class)-curveOrder(b.curve_class)||n(b.volume_hl)-n(a.volume_hl)||a.rank-b.rank);const slots=Array(cap).fill(null);tokens.slice(0,cap).forEach((x,i)=>slots[i]=makeSlot(x,i+1,street.id));
  const desc=spillFrom.length?`${street.label} (+ ${[...new Set(spillFrom)].join("/")})`:street.label;
  return {...street,used:Math.min(tokens.length,cap),slots,description:desc,skus:[...counts.entries()].map(([sku_code,count])=>({sku_code,count}))};
}
function streetForPreferred(preferred:string){return MAIN.find(s=>s.preferred===preferred);}
function zoneCapacity(zoneId:string){const z=ZONES.find(z=>z.id===zoneId);return (z?.streets||[]).reduce((sum,id)=>sum+(MAIN.find(s=>s.id===id)?.capacity||0),0);}

function allocateZone(zoneId:string,items:any[]){
  const zone=ZONES.find(z=>z.id===zoneId)!;const laneMap=new Map<string,any[]>();for(const id of zone.streets)laneMap.set(id,[]);
  for(const x of items){const st=streetForPreferred(preferredLane(x)||"");if(st&&laneMap.has(st.id))laneMap.get(st.id)!.push(x);}
  const spillNotes=new Map<string,string[]>();for(const id of zone.streets)spillNotes.set(id,[]);
  if(zone.streets.length>1){
    for(const id of zone.streets){const st=MAIN.find(s=>s.id===id)!;const arr=laneMap.get(id)!;if(arr.length<=st.capacity)continue;
      const spill=arr.sort(spillOrder).splice(0,arr.length-st.capacity);
      for(const x of spill){const target=zone.streets.map(tid=>MAIN.find(s=>s.id===tid)!).filter(t=>t.id!==id).sort((a,b)=>(b.capacity-laneMap.get(b.id)!.length)-(a.capacity-laneMap.get(a.id)!.length))[0];if(target&&laneMap.get(target.id)!.length<target.capacity){laneMap.get(target.id)!.push(x);spillNotes.get(target.id)!.push(st.label);}else{arr.push(x);}}
    }
  }
  const streets=zone.streets.map(id=>fillMainStreet(MAIN.find(s=>s.id===id)!,laneMap.get(id)!,spillNotes.get(id)!));
  const placed=new Set<string>();for(const s of streets)for(const slot of s.slots)if(slot)placed.add(slot.sku_code);
  return {streets,placed,spill_count:[...spillNotes.values()].reduce((s,a)=>s+a.length,0)};
}

function buildPhysicalPlan(items:any[],excluded:any={}){
  const rows=items.map(x=>({...x,assigned_slots:0,family_label:x.family_label||familyLabel(x)}));const byCode=new Map(rows.map(x=>[x.sku_code,x]));const reserved=new Set<string>();const issues:string[]=[];
  const caixaria=CAIXARIA.map(st=>{const pool=st.codes.map(c=>byCode.get(c)).filter(Boolean);for(const x of pool)reserved.add(x.sku_code);return fullFixedStreet(pool,st);});

  const brahmaPool=rows.filter(x=>!reserved.has(x.sku_code)&&isBrahmaLatao(x));const pf1=fillDedicatedStreet(brahmaPool,FRONT[0]);for(const c of pf1.placed)reserved.add(c);
  const guaravitaPool=rows.filter(x=>!reserved.has(x.sku_code)&&isGuaravitaFront(x));const pf2=fillDedicatedStreet(guaravitaPool,FRONT[1]);for(const c of pf2.placed)reserved.add(c);
  const front=[pf1.street,pf2.street];

  const available=rows.filter(x=>!reserved.has(x.sku_code));
  const classified=available.filter(x=>preferredLane(x));
  const unclassified=available.filter(x=>!preferredLane(x));
  const noCatalog=unclassified.filter(x=>!String(x.packaging||"").trim());
  const knownOtherC=unclassified.filter(x=>String(x.packaging||"").trim()&&x.curve_class==="C");
  const knownOtherHigh=unclassified.filter(x=>String(x.packaging||"").trim()&&x.curve_class!=="C");
  if(noCatalog.length)issues.push(`${noCatalog.length} SKU(s) sem família/embalagem no 01.11`);
  if(knownOtherHigh.length)issues.push(`${knownOtherHigh.length} SKU(s) A/B sem rua física compatível`);

  const flowChosen:any[]=[];const flowSet=new Set<string>();
  for(const zone of ZONES){const zitems=classified.filter(x=>zoneForLane(preferredLane(x))===zone.id);const excess=Math.max(0,zitems.length-zoneCapacity(zone.id));if(!excess)continue;const cs=zitems.filter(x=>x.curve_class==="C").sort((a,b)=>n(a.volume_hl)-n(b.volume_hl)||b.rank-a.rank);if(cs.length<excess)issues.push(`${zone.label}: ${zitems.length} SKUs para ${zoneCapacity(zone.id)} vagas e não há Curva C suficiente para aliviar a zona`);for(const x of cs.slice(0,Math.min(excess,cs.length))){if(!flowSet.has(x.sku_code)){flowSet.add(x.sku_code);flowChosen.push(x);}}}
  for(const x of knownOtherC.sort((a,b)=>n(a.volume_hl)-n(b.volume_hl)||b.rank-a.rank)){if(flowChosen.length>=FLOW_SKU_CAPACITY)break;flowSet.add(x.sku_code);flowChosen.push(x);}
  const cPool=classified.filter(x=>x.curve_class==="C"&&!flowSet.has(x.sku_code)).sort((a,b)=>n(a.volume_hl)-n(b.volume_hl)||b.rank-a.rank);
  for(const x of cPool){if(flowChosen.length>=FLOW_SKU_CAPACITY)break;flowSet.add(x.sku_code);flowChosen.push(x);}
  if(flowChosen.length>FLOW_SKU_CAPACITY)issues.push(`Flow Rack exige ${flowChosen.length} SKUs para capacidade de ${FLOW_SKU_CAPACITY}`);

  const mainCandidates=classified.filter(x=>!flowSet.has(x.sku_code));const mainById=new Map<string,any>();let spillCount=0;const placedMain=new Set<string>();
  for(const zone of ZONES){const zitems=mainCandidates.filter(x=>zoneForLane(preferredLane(x))===zone.id);if(zitems.length>zoneCapacity(zone.id))issues.push(`${zone.label}: ${zitems.length} SKUs após Flow Rack para ${zoneCapacity(zone.id)} vagas`);const alloc=allocateZone(zone.id,zitems);spillCount+=alloc.spill_count;for(const st of alloc.streets)mainById.set(st.id,st);for(const c of alloc.placed)placedMain.add(c);}
  const main=MAIN.map(st=>mainById.get(st.id)||fillMainStreet(st,[]));

  const overflow:any[]=[];
  for(const x of noCatalog)overflow.push({...x,reason:"Revisar 01.11 / Marketplace"});
  for(const x of knownOtherHigh)overflow.push({...x,reason:"Família sem rua compatível"});
  for(const x of mainCandidates)if(!placedMain.has(x.sku_code))overflow.push({...x,reason:"Capacidade física da família"});
  for(const x of knownOtherC)if(!flowSet.has(x.sku_code))overflow.push({...x,reason:"Flow Rack sem capacidade"});
  for(const x of pf1.overflow)if(!placedMain.has(x.sku_code)&&!flowSet.has(x.sku_code))overflow.push({...x,reason:"Frente Brahma cheia; revisar Lata 473"});
  for(const x of pf2.overflow)if(!placedMain.has(x.sku_code)&&!flowSet.has(x.sku_code))overflow.push({...x,reason:"Frente Guaravita cheia"});

  const allStreets=[...caixaria,...front,...main];const occurrence=new Map<string,number>();for(const st of allStreets)for(const s of st.slots)if(s)occurrence.set(s.sku_code,(occurrence.get(s.sku_code)||0)+1);for(const x of flowChosen)occurrence.set(x.sku_code,Math.max(1,occurrence.get(x.sku_code)||0));for(const x of rows)x.assigned_slots=occurrence.get(x.sku_code)||0;
  const flowItems=flowChosen.slice(0,FLOW_SKU_CAPACITY).sort((a,b)=>n(a.volume_hl)-n(b.volume_hl)||b.rank-a.rank).map(x=>({sku_code:x.sku_code,sku_name:x.sku_name,curve_class:x.curve_class,family_label:x.family_label,volume_hl:x.volume_hl,rank:x.rank,assigned_slots:1}));
  const uniqueOverflow=[...new Map(overflow.map(x=>[x.sku_code,x])).values()];
  if(uniqueOverflow.length&&!issues.length)issues.push(`${uniqueOverflow.length} SKU(s) sem vaga física compatível`);
  const feasible=issues.length===0&&uniqueOverflow.length===0;
  const audit={feasible,eligible_skus:rows.length,excluded,flow_skus:flowItems.length,flow_capacity:FLOW_SKU_CAPACITY,overflow_skus:uniqueOverflow.length,cross_lane_moves:spillCount,issues};
  return {items:rows,plan:{method_version:METHOD_VERSION,total_streets:TOTAL_STREETS,total_slots:TOTAL_SLOTS,used_slots:allStreets.reduce((s,x)=>s+x.used,0),caixaria,front,main,flow:{items:flowItems,sku_capacity:FLOW_SKU_CAPACITY,pallets:12},overflow:uniqueOverflow,audit,feasible,principles:["Rua simples R1 exclusiva de Águas","Dupla de 13 vagas reservada a PET 1L/1,5L e PET 2L/3L","Duplas de 12 agrupam PET pequeno, Latas e Vidro/OW","Marketplace, barris e BAGs não entram no Picking","Flow Rack recebe somente a cauda extrema da Curva C","Todo SKU elegível recebe 1 vaga antes de duplicar alto giro","Excesso de uma rua pode usar a rua irmã da mesma dupla antes de ser considerado inviável"]}};
}

async function getCatalogMap(codes:string[]){const map=new Map<string,any>();for(let i=0;i<codes.length;i+=150){const {data,error}=await db.from("product_catalog").select("sku_code,sku_name,packaging,family_siv,factor_hecto_commercial,boxes_per_pallet,subtype").in("sku_code",codes.slice(i,i+150));if(error)throw error;for(const r of data||[])map.set(String(r.sku_code),r);}return map;}
async function buildFromOcp(ocpItems:any[]){const merged=new Map<string,any>();for(const r of ocpItems||[]){const code=String(r.sku_code||"").trim(),boxes=n(r.volume_boxes??r.boxes);if(!code||boxes<=0)continue;const p=merged.get(code)||{sku_code:code,sku_name:String(r.sku_name||""),volume_boxes:0};p.volume_boxes+=boxes;if(!p.sku_name&&r.sku_name)p.sku_name=String(r.sku_name);merged.set(code,p);}const catalog=await getCatalogMap([...merged.keys()]);const mkp=await marketplaceSet();const raw:any[]=[];const missing:string[]=[];const excluded={marketplace:0,barris:0,bags:0};for(const r of merged.values()){const c=catalog.get(r.sku_code);const temp={...r,sku_name:c?.sku_name||r.sku_name,packaging:c?.packaging||null,family_siv:c?.family_siv||null};if(mkp.has(r.sku_code)){excluded.marketplace++;continue;}if(isBarrel(temp)){excluded.barris++;continue;}if(isBag(temp)){excluded.bags++;continue;}const factor=n(c?.factor_hecto_commercial);if(!c||factor<=0){missing.push(r.sku_code);continue;}raw.push({...temp,volume_hl:r.volume_boxes*factor});}if(missing.length)throw new Error(`01.11 sem cadastro/fator para ${missing.slice(0,15).join(", ")}${missing.length>15?"…":""}`);return {rows:recalcCurve(raw),excluded};}
async function persistMonth(month:string,sourceFile:string,userId:string,items:any[],excluded:any){const ref=normalizeMonth(month),physical=buildPhysicalPlan(items,excluded);const {error:merr}=await db.from("picking_layout_months").upsert({reference_month:ref,source_file:sourceFile,status:"imported",method_version:METHOD_VERSION,generated_at:new Date().toISOString(),generated_by:userId,updated_at:new Date().toISOString()},{onConflict:"reference_month"});if(merr)throw merr;const {error:derr}=await db.from("picking_layout_items").delete().eq("reference_month",ref);if(derr)throw derr;for(let i=0;i<physical.items.length;i+=150){const batch=physical.items.slice(i,i+150).map(x=>({reference_month:ref,rank:x.rank,sku_code:x.sku_code,sku_name:x.sku_name,packaging:x.packaging,family_siv:x.family_siv,volume_boxes:x.volume_boxes,volume_hl:x.volume_hl,weight_pct:x.weight_pct,pareto_pct:x.pareto_pct,curve_class:x.curve_class,assigned_slots:x.assigned_slots,zone:x.zone}));const {error}=await db.from("picking_layout_items").insert(batch);if(error)throw error;}return physical;}
async function loadMonth(month:string){const ref=normalizeMonth(month);const {data:stored,error:serr}=await db.from("picking_layout_items").select("rank,sku_code,sku_name,packaging,family_siv,volume_boxes,volume_hl,weight_pct,pareto_pct,curve_class,assigned_slots,zone").eq("reference_month",ref).order("rank");if(serr)throw serr;let base:any[]=[];let source="none";if(stored?.length){base=stored;source="layout";}else{const {data:abc,error:aerr}=await db.from("abc_items").select("rank,sku_code,sku_name,volume_caixas,volume_hl,weight_pct,pareto_pct,curve_class").eq("reference_month",ref).eq("area","Picking").order("rank");if(aerr)throw aerr;if(!abc?.length)return {items:[],source,plan:buildPhysicalPlan([]).plan};const catalog=await getCatalogMap(abc.map((x:any)=>String(x.sku_code)));base=abc.map((x:any)=>{const c=catalog.get(String(x.sku_code));return {sku_code:String(x.sku_code),sku_name:x.sku_name,packaging:c?.packaging||null,family_siv:c?.family_siv||null,volume_boxes:n(x.volume_caixas),volume_hl:n(x.volume_hl)};});source="abc";}const filtered=await filterEligible(base);const physical=buildPhysicalPlan(filtered.rows,filtered.excluded);return {items:physical.items,source,plan:physical.plan};}

Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Método não permitido"},405);try{const body=await req.json();const user=await requireSession(req);if(!user)return json({error:"Sessão inválida ou expirada"},401);const action=String(body?.action||"");
  if(action==="months"){const [{data:l,error:le},{data:a,error:ae}]=await Promise.all([db.from("picking_layout_months").select("reference_month,source_file,status,generated_at,method_version").order("reference_month"),db.from("abc_months").select("reference_month,status").eq("status","imported").order("reference_month")]);if(le)throw le;if(ae)throw ae;const map=new Map<string,any>();for(const x of a||[])map.set(String(x.reference_month).slice(0,10),{reference_month:x.reference_month,status:"imported",source:"abc"});for(const x of l||[])map.set(String(x.reference_month).slice(0,10),{...x,source:"layout"});return json({months:[...map.values()].sort((x,y)=>String(x.reference_month).localeCompare(String(y.reference_month))),total_slots:TOTAL_SLOTS,street_count:TOTAL_STREETS,slots_per_street:SLOTS,method_version:METHOD_VERSION});}
  if(action==="get"){const out=await loadMonth(String(body.month||""));return json({month:normalizeMonth(String(body.month||"")),total_slots:TOTAL_SLOTS,street_count:TOTAL_STREETS,slots_per_street:SLOTS,method_version:METHOD_VERSION,...out});}
  if(action==="catalog_status"){const {count,error}=await db.from("product_catalog").select("sku_code",{count:"exact",head:true});if(error)throw error;return json({count:count||0});}
  if(action==="catalog_import"){if(user.role!=="admin")return json({error:"Sem autorização"},403);const items=Array.isArray(body.items)?body.items:[];if(!items.length)return json({error:"Nenhum produto recebido"},400);for(let i=0;i<items.length;i+=200){const batch=items.slice(i,i+200).map((x:any)=>({sku_code:String(x.sku_code||"").trim(),sku_name:String(x.sku_name||""),packaging:x.packaging||null,family_siv:x.family_siv||null,factor_hecto_commercial:n(x.factor_hecto_commercial)||null,boxes_per_pallet:n(x.boxes_per_pallet)||null,subtype:x.subtype||null,source_file:String(body.source_file||"01.11"),updated_at:new Date().toISOString()})).filter((x:any)=>x.sku_code);const {error}=await db.from("product_catalog").upsert(batch,{onConflict:"sku_code"});if(error)throw error;}return json({ok:true,count:items.length});}
  if(action==="import"){if(user.role!=="admin")return json({error:"Sem autorização"},403);if(Array.isArray(body.catalog_items)&&body.catalog_items.length){for(let i=0;i<body.catalog_items.length;i+=200){const batch=body.catalog_items.slice(i,i+200).map((x:any)=>({sku_code:String(x.sku_code||"").trim(),sku_name:String(x.sku_name||""),packaging:x.packaging||null,family_siv:x.family_siv||null,factor_hecto_commercial:n(x.factor_hecto_commercial)||null,boxes_per_pallet:n(x.boxes_per_pallet)||null,subtype:x.subtype||null,source_file:String(body.catalog_file||"01.11"),updated_at:new Date().toISOString()})).filter((x:any)=>x.sku_code);const {error}=await db.from("product_catalog").upsert(batch,{onConflict:"sku_code"});if(error)throw error;}}
    const built=await buildFromOcp(body.ocp_items||[]);if(!built.rows.length)return json({error:"Nenhum SKU elegível encontrado no OCP"},400);const physical=await persistMonth(String(body.month||""),String(body.source_file||"03.02.36.01"),user.id,built.rows,built.excluded);return json({ok:true,items:physical.items.length,used_slots:physical.plan.used_slots,total_slots:TOTAL_SLOTS,street_count:TOTAL_STREETS,plan:physical.plan});}
  return json({error:"Ação inválida"},400);
}catch(e){console.error(e);return json({error:e instanceof Error?e.message:String(e)},500);}});
