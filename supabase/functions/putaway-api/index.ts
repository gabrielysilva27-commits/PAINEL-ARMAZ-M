import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const db=createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {auth:{persistSession:false}}
);

const ORIGIN="https://painel-armaz-m.gabrielysilva27.workers.dev";
const enc=new TextEncoder();
function headers(req:Request){
  const o=req.headers.get("origin");
  const a=o===ORIGIN||o?.startsWith("http://localhost:")||o?.startsWith("http://127.0.0.1:")?o:ORIGIN;
  return {
    "Access-Control-Allow-Origin":a,
    "Access-Control-Allow-Headers":"content-type,x-session-token,x-bo-token,x-forklift-token",
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Vary":"Origin"
  };
}
const json=(req:Request,b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:headers(req)});
async function hash(t:string){
  const b=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(t)));
  return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
async function appUser(req:Request){
  const t=req.headers.get("x-session-token")||"";
  if(!t)return null;
  const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",await hash(t)).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!s)return null;
  const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();
  return u||null;
}
async function confUser(req:Request){
  const t=req.headers.get("x-bo-token")||"";
  if(!t)return null;
  const {data:s}=await db.from("bo_conferencer_sessions").select("id,conferencer_id,expires_at").eq("token_hash",await hash(t)).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!s)return null;
  const {data:u}=await db.from("bo_conferencers").select("id,display_name,active").eq("id",s.conferencer_id).eq("active",true).maybeSingle();
  return u||null;
}
async function forkliftUser(req:Request){
  const t=req.headers.get("x-forklift-token")||"";
  if(!t)return null;
  const {data:s}=await db.from("receiving_forklift_sessions").select("id,operator_id,expires_at").eq("token_hash",await hash(t)).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!s)return null;
  const {data:u}=await db.from("receiving_forklift_operators").select("id,display_name,active").eq("id",s.operator_id).eq("active",true).maybeSingle();
  return u||null;
}
function randomPin(){
  const a=crypto.getRandomValues(new Uint32Array(1))[0]%10000;
  return String(a).padStart(4,"0");
}
const clean=(v:any,n=250)=>String(v??"").replace(/\s+/g," ").trim().slice(0,n);
const compact=(v:any)=>clean(v,80).toUpperCase().replace(/^([A-Z]+)0+(\d)/,"$1$2").replace(/[^A-Z0-9]/g,"");
const todayBR=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const monthOf=(d:any)=>String(d||todayBR()).slice(0,7);
const AREAS=["Regulador","Marketplace","Câmara Fria"];
const CLASSES=["A","B","C"];
function orderCode(receipt:any){
  const base=String(receipt.receipt_code||receipt.id).replace(/^REC-/,"");
  return "OG-"+base;
}
function areaLabel(a:string){return a==="Regulador"?"Estoque Geral":a}

async function latestSnapshot(){
  const {data,error}=await db.from("stock_snapshots").select("*").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;
  return data;
}
async function receiptFull(id:number){
  const {data,error}=await db.from("receiving_nri_receipts")
    .select("id,receipt_code,truck_number,arrival_date,arrival_time,nf_imperio,nf_ambev,order_number,factory_name,plate,driver_name,status,conference_by,conference_completed_at,conferencer:bo_conferencers(display_name),items:receiving_nri_items(id,nri_number,line_no,sku_code,sku_name,unit_text,physical_qty,pallet_count,pallet_capacity,layer_qty,expiry_date,curve_class,load_until_date)")
    .eq("id",id).maybeSingle();
  if(error)throw error;
  if(!data)throw new Error("Recebimento não encontrado.");
  return data;
}
function addCandidate(map:Map<string,any>,address:any,x:any,y:any,source:string){
  const key=compact(address);if(!key)return;
  let item=map.get(key);
  if(!item){item={key,address:String(address),points:[],sources:new Set<string>()};map.set(key,item)}
  if(Number.isFinite(Number(x))&&Number.isFinite(Number(y)))item.points.push({x:Number(x),y:Number(y)});
  if(source)item.sources.add(source);
}
function physicalCandidates(snapshot:any,area:string){
  const payload=snapshot?.payload||{},map=new Map<string,any>();
  const anchors=payload.maps?.[area]?.anchors||[];
  for(const a of anchors){
    addCandidate(map,a.address,Number(a.col)+(Number(a.width||1)-1)/2,Number(a.row)+(Number(a.height||1)-1)/2,"map");
  }
  if(area==="Regulador"){
    [
      ["A37-A",93.5,61],["A37-B",93.5,62],
      ["B36-A",96.5,61],["B36-B",96.5,62],
      ["E64",12.5,45.5]
    ].forEach((x:any[])=>addCandidate(map,x[0],x[1],x[2],"supplement"));
  }
  const rackPts=new Map<string,any[]>();
  if(area==="Marketplace"){
    for(const a of anchors){
      const m=String(a.address||"").match(/^(M\d+)-/i);if(!m)continue;
      const k=m[1].toUpperCase();if(!rackPts.has(k))rackPts.set(k,[]);
      rackPts.get(k)!.push({x:Number(a.col)+(Number(a.width||1)-1)/2,y:Number(a.row)+(Number(a.height||1)-1)/2});
    }
  }
  const seen=new Set<string>();
  for(const r of payload.rows||[]){
    if(r.area!==area||!r.address)continue;
    const key=compact(r.address);if(seen.has(key))continue;seen.add(key);
    if(map.has(key)){addCandidate(map,r.address,null,null,"base");continue}
    if(area==="Marketplace"){
      const m=String(r.address).match(/^(M\d+)-/i),pts=m?rackPts.get(m[1].toUpperCase()):null;
      if(pts?.length){
        addCandidate(map,r.address,pts.reduce((s,p)=>s+p.x,0)/pts.length,pts.reduce((s,p)=>s+p.y,0)/pts.length,"rack");
        continue;
      }
    }
    addCandidate(map,r.address,null,null,"base");
  }
  return [...map.values()].map((item:any)=>{
    const pts=item.points||[];
    return {
      key:item.key,address:item.address,
      x:pts.length?pts.reduce((s:number,p:any)=>s+p.x,0)/pts.length:null,
      y:pts.length?pts.reduce((s:number,p:any)=>s+p.y,0)/pts.length:null
    };
  });
}
function priority(snapshot:any,area:string,candidates:any[]){
  const monitored=snapshot?.payload?.targets?.[area]?.monitored||[];
  const byKey=new Map(candidates.map(c=>[c.key,c])),keys=new Set<string>(),points:any[]=[];
  for(const m of monitored){
    const key=compact(m.address);keys.add(key);
    const c:any=byKey.get(key);if(c&&Number.isFinite(c.x)&&Number.isFinite(c.y))points.push({x:c.x,y:c.y});
  }
  return {keys,points};
}
function rankCandidates(snapshot:any,area:string,candidates:any[]){
  const p=priority(snapshot,area,candidates);
  const items=candidates.map((c:any,index:number)=>{
    const hot=p.keys.has(c.key);let score:number;
    if(area==="Marketplace"&&Number.isFinite(c.y)){
      const d=p.points.length&&Number.isFinite(c.x)?Math.min(...p.points.map((q:any)=>Math.hypot(c.x-q.x,c.y-q.y))):99;
      score=(hot?0:1000)+d*10-c.y;
    }else if(p.points.length&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&area!=="Câmara Fria"){
      score=(hot?0:1000)+Math.min(...p.points.map((q:any)=>Math.hypot(c.x-q.x,c.y-q.y)));
    }else if(Number.isFinite(c.x)&&Number.isFinite(c.y)){
      score=c.y+c.x/1000;
    }else score=100000+index;
    return {...c,score};
  });
  items.sort((a:any,b:any)=>a.score-b.score||(a.x||9999)-(b.x||9999)||String(a.address).localeCompare(String(b.address),"pt-BR",{numeric:true}));
  return items;
}
function allocateZones(total:number,skuCounts:any,demand:any){
  const base:any={};for(const c of CLASSES)base[c]=Math.max(Number(skuCounts[c]||0),Number(demand[c]||0));
  const sum=CLASSES.reduce((s,c)=>s+base[c],0);if(!sum||!total)return {A:0,B:0,C:total||0};
  const raw:any={},alloc:any={};
  for(const c of CLASSES){raw[c]=total*base[c]/sum;alloc[c]=Math.floor(raw[c]);if(base[c]>0&&alloc[c]===0)alloc[c]=1}
  let used=CLASSES.reduce((s,c)=>s+alloc[c],0);
  while(used>total){
    const r=[...CLASSES].reverse().filter(c=>alloc[c]>(base[c]>0?1:0));if(!r.length)break;
    r.sort((a,b)=>(alloc[b]-raw[b])-(alloc[a]-raw[a]));alloc[r[0]]--;used--;
  }
  while(used<total){
    const r=[...CLASSES].sort((a,b)=>(raw[b]-Math.floor(raw[b]))-(raw[a]-Math.floor(raw[a]))||CLASSES.indexOf(a)-CLASSES.indexOf(b));
    alloc[r[(used-total+r.length*1000)%r.length]]++;used++;
  }
  return alloc;
}
function stockState(snapshot:any,area:string,curveMap:Map<string,string>){
  const grouped=new Map<string,any[]>(),demand:any={A:0,B:0,C:0};
  for(const r of snapshot?.payload?.rows||[]){
    if(r.area!==area)continue;const key=compact(r.address);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key)!.push(r);
  }
  const loc=new Map<string,any>();
  for(const [key,rows] of grouped){
    const occupied=rows.filter((r:any)=>r.sku_code&&Number(r.pallets??1)!==0);
    const classes=[...new Set(occupied.map((r:any)=>curveMap.get(String(r.sku_code||""))).filter(Boolean))] as string[];
    const highest=CLASSES.find(c=>classes.includes(c));if(highest)demand[highest]++;
    loc.set(key,{rows,occupied,classes});
  }
  return {loc,demand};
}
function buildAreaPlan(snapshot:any,area:string,curves:any[]){
  const curveMap=new Map<string,string>(),skuCounts:any={A:0,B:0,C:0};
  for(const x of curves){if(CLASSES.includes(x.curve_class)){curveMap.set(String(x.sku_code),x.curve_class);skuCounts[x.curve_class]++}}
  const candidates=rankCandidates(snapshot,area,physicalCandidates(snapshot,area));
  const state=stockState(snapshot,area,curveMap);
  const allocation:any=allocateZones(candidates.length,skuCounts,state.demand);
  const zoneByKey=new Map<string,string>();let cursor=0;
  for(const c of CLASSES){const n=Number(allocation[c]||0);for(const p of candidates.slice(cursor,cursor+n))zoneByKey.set(p.key,c);cursor+=n}
  return {curveMap,candidates,state,allocation,zoneByKey};
}
function isEmpty(plan:any,key:string){
  const x=plan.state.loc.get(key);
  return !x||!x.occupied.length;
}
function sameSkuOnly(plan:any,key:string,sku:string){
  const x=plan.state.loc.get(key);if(!x||!x.occupied.length)return false;
  return x.occupied.every((r:any)=>String(r.sku_code||"")===sku);
}
function storageMode(area:string,address:string){
  const a=String(address||"").trim().toUpperCase();
  return /-[A-Z]+$/.test(a)?"rack":"street";
}
async function activeReservations(){
  const {data,error}=await db.from("receiving_putaway_tasks")
    .select("id,area,sku_code,suggested_address,actual_address,status")
    .in("status",["planned","stored_pending_validation","rejected"]);
  if(error)throw error;
  const map=new Map<string,Set<string>>();
  for(const x of data||[]){
    const a=x.actual_address||x.suggested_address;if(!x.area||!a)continue;
    const key=x.area+":"+compact(a);
    if(!map.has(key))map.set(key,new Set<string>());
    map.get(key)!.add(String(x.sku_code||""));
  }
  return map;
}
function reservationAllows(reserved:Map<string,Set<string>>,key:string,sku:string,mode:string){
  const skus=reserved.get(key);
  if(!skus||!skus.size)return true;
  return mode==="street"&&skus.size===1&&skus.has(sku);
}
function reserveAddress(reserved:Map<string,Set<string>>,key:string,sku:string){
  if(!reserved.has(key))reserved.set(key,new Set<string>());
  reserved.get(key)!.add(sku);
}
function chooseAddress(plan:any,area:string,curve:string,sku:string,reserved:Map<string,Set<string>>){
  const fallback:any={A:["A","B","C"],B:["B","C","A"],C:["C","B","A"]};
  const preferredModes=curve==="C"?["rack","street"]:["street","rack"];

  for(const zone of fallback[curve]||["C","B","A"]){
    for(const mode of preferredModes){
      if(mode==="street"){
        for(const c of plan.candidates){
          if(plan.zoneByKey.get(c.key)!==zone||storageMode(area,c.address)!=="street")continue;
          const rk=area+":"+c.key;
          if(!reservationAllows(reserved,rk,sku,"street"))continue;
          const reservedSkus=reserved.get(rk);
          const sameReserved=!!reservedSkus?.has(sku);
          if(sameSkuOnly(plan,c.key,sku)||sameReserved){
            reserveAddress(reserved,rk,sku);
            return {
              address:c.address,zone,status:zone===curve?"exact":"fallback",
              reason:(zone===curve?"Rua na zona ideal":"Rua em zona alternativa ("+zone+")")+"; consolidar os paletes do mesmo SKU no mesmo endereço."
            };
          }
        }
      }

      for(const c of plan.candidates){
        if(plan.zoneByKey.get(c.key)!==zone||storageMode(area,c.address)!==mode)continue;
        const rk=area+":"+c.key;
        if(!reservationAllows(reserved,rk,sku,mode))continue;
        if(!isEmpty(plan,c.key))continue;
        reserveAddress(reserved,rk,sku);
        return {
          address:c.address,zone,status:zone===curve?"exact":"fallback",
          reason:mode==="street"
            ? (zone===curve?"Rua vazia na zona ideal da Curva "+curve:"Zona "+curve+" sem rua disponível; usada rua na zona "+zone)+". Os demais paletes do mesmo SKU devem permanecer nesta rua."
            : (zone===curve?"Vaga de estante na zona ideal da Curva "+curve:"Zona "+curve+" sem vaga; usada vaga de estante na zona "+zone)+". Estante: 1 palete por vaga."
        };
      }
    }
  }
  return {address:null,zone:null,status:"manual",reason:"Sem rua ou vaga compatível disponível para sugestão automática."};
}
async function curvesForMonth(month:string){
  const {data,error}=await db.from("abc_items").select("area,sku_code,curve_class").eq("reference_month",month+"-01").in("area",AREAS);
  if(error)throw error;
  const byArea=new Map<string,any[]>();for(const a of AREAS)byArea.set(a,[]);
  for(const x of data||[])byArea.get(x.area)?.push(x);
  return byArea;
}
function occupiedAreas(snapshot:any,sku:string){
  const set=new Set<string>();
  for(const r of snapshot?.payload?.rows||[])if(AREAS.includes(r.area)&&String(r.sku_code||"")===sku&&Number(r.pallets??1)!==0)set.add(r.area);
  return [...set];
}
function resolveArea(receipt:any,sku:string,byArea:Map<string,any[]> ,snapshot:any){
  const curveAreas=AREAS.filter(a=>(byArea.get(a)||[]).some((x:any)=>String(x.sku_code)===sku));
  const stockAreas=occupiedAreas(snapshot,sku);
  if(String(receipt.factory_name||"").toUpperCase()==="MKP")return {area:"Marketplace",source:"origem MKP"};
  if(curveAreas.length===1)return {area:curveAreas[0],source:"Curva ABC exclusiva da área"};
  if(stockAreas.length===1)return {area:stockAreas[0],source:"SKU atualmente armazenado apenas nesta área"};
  if(curveAreas.includes("Câmara Fria")&&stockAreas.includes("Câmara Fria"))return {area:"Câmara Fria",source:"Histórico físico + Curva ABC"};
  if(stockAreas.includes("Regulador"))return {area:"Regulador",source:"Histórico físico predominante"};
  if(curveAreas.includes("Regulador"))return {area:"Regulador",source:"Curva ABC da área"};
  if(curveAreas.includes("Marketplace"))return {area:"Marketplace",source:"Curva ABC da área"};
  if(curveAreas.includes("Câmara Fria"))return {area:"Câmara Fria",source:"Curva ABC da área"};
  return {area:"Regulador",source:"Fallback operacional; revisar área"};
}
async function logEvent(orderId:number,taskId:string|null,type:string,actorType:string,actorId:any,actorName:any,details:any={}){
  await db.from("receiving_putaway_events").insert({
    order_id:orderId,task_id:taskId,event_type:type,actor_type:actorType,
    actor_id:actorId?String(actorId):null,actor_name:actorName||null,details
  });
}
async function orderBundle(orderId:number){
  const {data:order,error}=await db.from("receiving_putaway_orders")
    .select("*,receipt:receiving_nri_receipts(id,receipt_code,truck_number,arrival_date,arrival_time,nf_imperio,nf_ambev,order_number,factory_name,plate,driver_name,status,conference_by,conference_completed_at,conferencer:bo_conferencers(display_name))")
    .eq("id",orderId).single();
  if(error)throw error;
  const {data:tasks,error:te}=await db.from("receiving_putaway_tasks").select("*").eq("order_id",orderId).order("created_at").order("pallet_seq");
  if(te)throw te;
  return {...order,tasks:tasks||[],public_url:ORIGIN+"/recebimento/guarda.html?token="+order.public_token};
}
async function rebuildTasks(order:any,receipt:any,snapshot:any,actor:any){
  const {count:started}=await db.from("receiving_putaway_tasks").select("id",{count:"exact",head:true}).eq("order_id",order.id).in("status",["stored_pending_validation","validated"]);
  if((started||0)>0)return orderBundle(order.id);
  await db.from("receiving_putaway_tasks").delete().eq("order_id",order.id);
  const month=monthOf(receipt.arrival_date),byArea=await curvesForMonth(month),plans=new Map<string,any>();
  for(const area of AREAS)plans.set(area,buildAreaPlan(snapshot,area,byArea.get(area)||[]));
  const reserved=await activeReservations();
  const tasks:any[]=[];
  for(const item of (receipt.items||[]).sort((a:any,b:any)=>a.line_no-b.line_no)){
    const sku=String(item.sku_code),resolved=resolveArea(receipt,sku,byArea,snapshot),area=resolved.area;
    const plan=plans.get(area),curve=plan?.curveMap.get(sku)||null;
    const count=String(item.unit_text||"P").toUpperCase()==="P"?Math.max(1,Number(item.pallet_count||item.physical_qty||1)):1;
    const eq=String(item.unit_text||"P").toUpperCase()==="P"?1:(Number(item.pallet_capacity)>0?Number(item.physical_qty||0)/Number(item.pallet_capacity):1);
    for(let seq=1;seq<=count;seq++){
      const suggestion=curve?chooseAddress(plan,area,curve,sku,reserved):{address:null,zone:null,status:"manual",reason:"SKU sem Curva ABC cadastrada para "+areaLabel(area)+" em "+month+"."};
      tasks.push({
        order_id:order.id,item_id:item.id,pallet_seq:seq,sku_code:sku,sku_name:item.sku_name,
        unit_text:item.unit_text||"P",physical_qty:item.physical_qty,pallet_equivalent:eq,
        expiry_date:item.expiry_date,area,area_source:resolved.source,curve_class:curve,
        suggested_address:suggestion.address,suggested_zone:suggestion.zone,suggestion_status:suggestion.status,
        suggestion_reason:suggestion.reason,status:"planned"
      });
    }
  }
  if(tasks.length){
    const {error}=await db.from("receiving_putaway_tasks").insert(tasks);if(error)throw error;
  }
  await db.from("receiving_putaway_orders").update({source_snapshot_id:snapshot.id,status:"planned",updated_at:new Date().toISOString()}).eq("id",order.id);
  await logEvent(order.id,null,"PLAN_GENERATED",actor.type,actor.id,actor.name,{tasks:tasks.length,snapshot_id:snapshot.id,month});
  return orderBundle(order.id);
}
async function getOrCreate(receiptId:number,actor:any){
  const receipt=await receiptFull(receiptId);
  if(receipt.status!=="conference_completed")throw new Error("A Ordem de Guarda só é liberada após finalizar a conferência.");
  if(actor.type==="CONFERENTE"&&receipt.conference_by!==actor.id)throw new Error("Somente o conferente responsável pode abrir esta Ordem de Guarda.");
  const snapshot=await latestSnapshot();if(!snapshot)throw new Error("Nenhuma Base Ruas ativa para calcular o endereçamento.");
  let {data:order,error}=await db.from("receiving_putaway_orders").select("*").eq("receipt_id",receiptId).maybeSingle();
  if(error)throw error;
  if(!order){
    const ins=await db.from("receiving_putaway_orders").insert({
      receipt_id:receiptId,order_code:orderCode(receipt),status:"planned",source_snapshot_id:snapshot.id,
      created_by_conferencer:receipt.conference_by||null
    }).select("*").single();
    if(ins.error)throw ins.error;order=ins.data;
  }
  const {data:tasks}=await db.from("receiving_putaway_tasks").select("item_id,pallet_seq,status").eq("order_id",order.id);
  const expected=(receipt.items||[]).reduce((sum:number,x:any)=>sum+(String(x.unit_text||"P").toUpperCase()==="P"?Math.max(1,Number(x.pallet_count||x.physical_qty||1)):1),0);
  if(!tasks?.length||tasks.length!==expected)return rebuildTasks(order,receipt,snapshot,actor);
  return orderBundle(order.id);
}
async function refreshOrder(orderId:number,actor:any){
  const bundle=await orderBundle(orderId),receipt=await receiptFull(bundle.receipt_id);
  if(actor.type==="CONFERENTE"&&receipt.conference_by!==actor.id)throw new Error("Ordem de outro conferente.");
  const snapshot=await latestSnapshot();if(!snapshot)throw new Error("Nenhuma Base Ruas ativa.");
  return rebuildTasks(bundle,receipt,snapshot,actor);
}
async function updateOrderStatus(orderId:number){
  const {data,error}=await db.from("receiving_putaway_tasks").select("status").eq("order_id",orderId);if(error)throw error;
  const statuses=(data||[]).map((x:any)=>x.status);
  let status="planned",completedAt:any=null;
  if(statuses.length&&statuses.every((s:string)=>s==="validated")){status="completed";completedAt=new Date().toISOString()}
  else if(statuses.some((s:string)=>s==="stored_pending_validation"))status="awaiting_validation";
  else if(statuses.some((s:string)=>s==="validated"||s==="rejected"))status="in_progress";
  const {error:ue}=await db.from("receiving_putaway_orders").update({status,completed_at:completedAt,updated_at:new Date().toISOString()}).eq("id",orderId);if(ue)throw ue;
}
async function publicBundle(token:string){
  const {data:order,error}=await db.from("receiving_putaway_orders")
    .select("id,order_code,status,public_token,receipt_id,receipt:receiving_nri_receipts(receipt_code,truck_number,arrival_date,factory_name,plate,driver_name)")
    .eq("public_token",token).maybeSingle();
  if(error)throw error;if(!order)throw new Error("Ordem de Guarda inválida.");
  const {data:tasks,error:te}=await db.from("receiving_putaway_tasks")
    .select("id,pallet_seq,sku_code,sku_name,unit_text,physical_qty,expiry_date,area,area_source,curve_class,suggested_address,suggested_zone,suggestion_status,suggestion_reason,actual_address,worker_name,worker_note,status,stored_at,validation_note")
    .eq("order_id",order.id).order("created_at").order("pallet_seq");
  if(te)throw te;
  return {...order,tasks:tasks||[]};
}
async function storeTask(token:string,taskId:string,operator:any,address:string,note:string){
  const order=await publicBundle(token);
  if(order.status==="completed"||order.status==="cancelled")throw new Error("Esta Ordem de Guarda já está encerrada.");
  const task=(order.tasks||[]).find((x:any)=>x.id===taskId);if(!task)throw new Error("Palete não pertence a esta Ordem de Guarda.");
  if(task.status==="validated")throw new Error("Este palete já foi validado.");
  address=clean(address,80).toUpperCase();
  if(!address)throw new Error("Informe o endereço onde o palete foi guardado.");
  const snapshot=await latestSnapshot();if(!snapshot)throw new Error("Base Ruas indisponível.");
  const candidates=physicalCandidates(snapshot,task.area);if(!candidates.some(x=>x.key===compact(address)))throw new Error("Endereço "+address+" não pertence ao layout de "+areaLabel(task.area)+".");
  const rows=(snapshot.payload?.rows||[]).filter((r:any)=>r.area===task.area&&compact(r.address)===compact(address)&&r.sku_code&&Number(r.pallets??1)!==0);
  const mode=storageMode(task.area,address);
  if(mode==="rack"&&rows.length)throw new Error("A vaga "+address+" já está ocupada. Estante aceita 1 palete por vaga.");
  if(mode==="street"&&rows.some((r:any)=>String(r.sku_code)!==String(task.sku_code)))throw new Error("A rua "+address+" está ocupada por outro SKU na Base Ruas.");
  const {data:conflict,error:ce}=await db.from("receiving_putaway_tasks")
    .select("id,sku_code,status").eq("area",task.area)
    .or("suggested_address.eq."+address+",actual_address.eq."+address)
    .in("status",["planned","stored_pending_validation"])
    .neq("id",task.id);
  if(ce)throw ce;
  if(conflict?.length){
    if(mode==="rack"||conflict.some((x:any)=>String(x.sku_code)!==String(task.sku_code))){
      throw new Error(mode==="rack"?"A vaga "+address+" já está reservada para outro palete.":"A rua "+address+" está reservada para outro SKU.");
    }
  }
  const {error}=await db.from("receiving_putaway_tasks").update({
    actual_address:address,worker_name:operator.display_name,worker_operator_id:operator.id,worker_note:clean(note,300)||null,
    status:"stored_pending_validation",stored_at:new Date().toISOString(),validation_note:null,updated_at:new Date().toISOString()
  }).eq("id",task.id);
  if(error)throw error;
  await logEvent(order.id,task.id,"STORED","EMPILHADOR",operator.id,operator.display_name,{actual_address:address,suggested_address:task.suggested_address,note:clean(note,300)||null});
  await updateOrderStatus(order.id);
  return publicBundle(token);
}

async function actorCanSeeOrder(actor:any,order:any){
  if(actor.type==="APP")return true;
  const receipt=await receiptFull(order.receipt_id);
  return receipt.conference_by===actor.id;
}
async function applyStock(task:any,order:any,receipt:any,conf:any){
  for(let attempt=0;attempt<2;attempt++){
    const latest=await latestSnapshot();if(!latest)throw new Error("Nenhuma Base Ruas ativa.");
    const payload=structuredClone(latest.payload),address=String(task.actual_address||task.suggested_address||"").toUpperCase();
    if(!address)throw new Error("O palete não possui endereço confirmado.");
    const sameAddress=(payload.rows||[]).filter((r:any)=>r.area===task.area&&compact(r.address)===compact(address));
    const occupied=sameAddress.filter((r:any)=>r.sku_code&&Number(r.pallets??1)!==0);
    const mode=storageMode(task.area,address);
    if(mode==="rack"&&occupied.length)throw new Error(address+" já está ocupado. Estante aceita 1 palete por vaga.");
    if(mode==="street"&&occupied.some((r:any)=>String(r.sku_code)!==String(task.sku_code)))throw new Error(address+" foi ocupado por outro SKU antes da validação.");
    const eq=Math.max(0.0001,Number(task.pallet_equivalent||1));
    let target=occupied.find((r:any)=>String(r.sku_code)===String(task.sku_code)&&String(r.expires_on||"")===String(task.expiry_date||""));
    let change:any;
    if(target){
      const before=Number(target.pallets||0);target.pallets=Number((before+eq).toFixed(4));target.inventory_confirmed=true;
      change={id:target.id,type:"PUTAWAY",area:task.area,address,sku_code:task.sku_code,before_pallets:before,after_pallets:target.pallets};
    }else{
      target=sameAddress.find((r:any)=>!r.sku_code||Number(r.pallets??0)===0);
      const row={
        ...(target||{}),
        id:target?.id||("putaway|"+task.id),
        source_sheet:"Base Ruas",area:task.area,address,
        sku_code:String(task.sku_code),sku_name:task.sku_name,
        received_on:receipt.arrival_date,expires_on:task.expiry_date||null,
        pallets:Number(eq.toFixed(4)),lock:"",inventory_confirmed:true
      };
      if(target)Object.assign(target,row);else payload.rows.push(row);
      change={id:row.id,type:"PUTAWAY",area:task.area,address,sku_code:task.sku_code,before_pallets:0,after_pallets:row.pallets};
    }
    payload.as_of=todayBR();payload.source_name="Ordem de Guarda "+order.order_code+" · "+address;
    const ins=await db.from("stock_snapshots").insert({
      payload,as_of:payload.as_of,source_name:payload.source_name,created_by:null,previous_id:latest.id
    }).select("id,created_at").single();
    if(ins.error){
      if(ins.error.code==="23505"&&attempt===0)continue;
      throw ins.error;
    }
    const snap=ins.data;
    await db.from("stock_audit_log").insert({
      snapshot_id:snap.id,previous_snapshot_id:latest.id,user_id:null,
      actor_type:"CONFERENTE",actor_label:conf.display_name,action:"PUTAWAY",
      changed_count:1,changed_rows:[change],
      note:"Ordem de Guarda "+order.order_code+" · "+address+" · NRI "+task.item_id
    });
    return snap.id;
  }
  throw new Error("O estoque foi atualizado em paralelo. Tente validar novamente.");
}
async function validateTask(orderId:number,taskId:string,conf:any){
  const bundle=await orderBundle(orderId);
  const receipt=await receiptFull(bundle.receipt_id);
  if(receipt.conference_by!==conf.id)throw new Error("Somente o conferente responsável pela NRI pode validar a guarda.");
  const task=(bundle.tasks||[]).find((x:any)=>x.id===taskId);if(!task)throw new Error("Palete não encontrado.");
  if(task.status!=="stored_pending_validation")throw new Error("O palete ainda não foi confirmado pelo empilhador.");
  const snapId=await applyStock(task,bundle,receipt,conf);
  const {error}=await db.from("receiving_putaway_tasks").update({
    status:"validated",validated_by:conf.id,validated_at:new Date().toISOString(),stock_snapshot_id:snapId,validation_note:null,updated_at:new Date().toISOString()
  }).eq("id",task.id);
  if(error)throw error;
  await logEvent(orderId,task.id,"VALIDATED","CONFERENTE",conf.id,conf.display_name,{actual_address:task.actual_address,stock_snapshot_id:snapId});
  await updateOrderStatus(orderId);
  return orderBundle(orderId);
}
async function rejectTask(orderId:number,taskId:string,conf:any,note:string){
  const bundle=await orderBundle(orderId),receipt=await receiptFull(bundle.receipt_id);
  if(receipt.conference_by!==conf.id)throw new Error("Somente o conferente responsável pode rejeitar a guarda.");
  const task=(bundle.tasks||[]).find((x:any)=>x.id===taskId);if(!task)throw new Error("Palete não encontrado.");
  if(task.status!=="stored_pending_validation")throw new Error("Não há confirmação pendente para rejeitar.");
  const {error}=await db.from("receiving_putaway_tasks").update({
    status:"rejected",validation_note:clean(note,300)||"Endereço não validado",updated_at:new Date().toISOString()
  }).eq("id",task.id);if(error)throw error;
  await logEvent(orderId,task.id,"REJECTED","CONFERENTE",conf.id,conf.display_name,{note:clean(note,300)||null});
  await updateOrderStatus(orderId);
  return orderBundle(orderId);
}
async function setTaskArea(orderId:number,taskId:string,area:string,actor:any){
  if(!AREAS.includes(area))throw new Error("Área inválida.");
  const bundle=await orderBundle(orderId);if(!(await actorCanSeeOrder(actor,bundle)))throw new Error("Sem acesso à Ordem de Guarda.");
  const task=(bundle.tasks||[]).find((x:any)=>x.id===taskId);if(!task)throw new Error("Palete não encontrado.");
  if(!["planned","rejected"].includes(task.status))throw new Error("A área não pode ser alterada depois da confirmação do empilhador.");
  const receipt=await receiptFull(bundle.receipt_id),snapshot=await latestSnapshot(),byArea=await curvesForMonth(monthOf(receipt.arrival_date));
  const plan=buildAreaPlan(snapshot,area,byArea.get(area)||[]),curve=plan.curveMap.get(String(task.sku_code))||null,reserved=await activeReservations();
  const suggestion=curve?chooseAddress(plan,area,curve,String(task.sku_code),reserved):{address:null,zone:null,status:"manual",reason:"SKU sem Curva ABC cadastrada para "+areaLabel(area)+"."};
  const {error}=await db.from("receiving_putaway_tasks").update({
    area,area_source:"Área ajustada manualmente",curve_class:curve,suggested_address:suggestion.address,suggested_zone:suggestion.zone,
    suggestion_status:suggestion.status,suggestion_reason:suggestion.reason,actual_address:null,worker_name:null,worker_note:null,stored_at:null,status:"planned",validation_note:null,updated_at:new Date().toISOString()
  }).eq("id",task.id);if(error)throw error;
  await logEvent(orderId,task.id,"AREA_CHANGED",actor.type,actor.id,actor.name,{area,curve_class:curve,suggested_address:suggestion.address});
  await updateOrderStatus(orderId);
  return orderBundle(orderId);
}


function palletEquivalent(items:any[]){
  return Number((items||[]).reduce((sum:number,x:any)=>{
    const unit=String(x.unit_text||"P").toUpperCase();
    if(unit==="P")return sum+Number(x.physical_qty||x.pallet_count||0);
    const cap=Number(x.pallet_capacity||0),qty=Number(x.physical_qty||0);
    return sum+(cap>0?qty/cap:0);
  },0).toFixed(2));
}
async function forkliftUsers(){
  const {data,error}=await db.from("receiving_forklift_operators").select("id,display_name").eq("active",true).order("display_name");
  if(error)throw error;return data||[];
}
async function forkliftLogin(operatorId:string,pin:string){
  if(!operatorId)throw new Error("Selecione seu nome.");
  if(!/^\d{4}$/.test(pin))throw new Error("Informe o PIN de 4 dígitos.");
  const {data:u,error}=await db.from("receiving_forklift_operators").select("id,display_name,pin_hash,active").eq("id",operatorId).maybeSingle();
  if(error)throw error;
  if(!u||!u.active||!u.pin_hash||await hash(pin)!==u.pin_hash)throw new Error("Nome ou PIN do empilhador inválido.");
  const token=crypto.randomUUID()+crypto.randomUUID(),expires=new Date(Date.now()+12*60*60*1000).toISOString();
  await db.from("receiving_forklift_sessions").delete().lt("expires_at",new Date().toISOString());
  const {error:se}=await db.from("receiving_forklift_sessions").insert({token_hash:await hash(token),operator_id:u.id,expires_at:expires});
  if(se)throw se;
  return {token,operator:{id:u.id,display_name:u.display_name},expires_at:expires};
}
async function unloadQueue(operator:any){
  const {data,error}=await db.from("receiving_nri_receipts")
    .select("id,receipt_code,truck_number,arrival_date,arrival_time,nf_imperio,nf_ambev,order_number,factory_name,plate,driver_name,status,unload_status,unload_operator_id,unload_started_at,unload_completed_at,operator:receiving_forklift_operators(display_name)")
    .in("status",["awaiting_conference","in_conference"])
    .order("arrival_date",{ascending:true}).order("arrival_time",{ascending:true}).limit(150);
  if(error)throw error;
  return (data||[]).filter((r:any)=>r.unload_status==="pending"||r.unload_operator_id===operator.id);
}
async function startUnload(receiptId:number,operator:any){
  const now=new Date().toISOString();
  const {data:existing,error:ee}=await db.from("receiving_nri_receipts")
    .select("id,status,unload_status,unload_operator_id,unload_started_at")
    .eq("id",receiptId).maybeSingle();
  if(ee)throw ee;if(!existing)throw new Error("Carreta não encontrada.");
  if(existing.unload_status==="in_progress"&&existing.unload_operator_id===operator.id)return existing;
  if(existing.status!=="awaiting_conference")throw new Error("A conferência desta carreta já foi iniciada.");
  if(existing.unload_status!=="pending")throw new Error("Esta descarga já foi assumida por outro empilhador.");
  const {data,error}=await db.from("receiving_nri_receipts").update({
    unload_status:"in_progress",unload_operator_id:operator.id,unload_started_at:now,unload_completed_at:null,unload_completion_source:null,updated_at:now
  }).eq("id",receiptId).eq("status","awaiting_conference").eq("unload_status","pending")
    .select("id,receipt_code,truck_number,arrival_date,arrival_time,factory_name,plate,driver_name,status,unload_status,unload_operator_id,unload_started_at").maybeSingle();
  if(error)throw error;if(!data)throw new Error("A carreta já foi assumida por outro empilhador.");
  await db.from("receiving_unload_events").insert({receipt_id:receiptId,operator_id:operator.id,event_type:"START",details:{operator:operator.display_name}});
  return data;
}
async function finishUnload(receiptId:number,operator:any){
  const now=new Date().toISOString();
  const {data:r,error:re}=await db.from("receiving_nri_receipts")
    .select("id,status,unload_status,unload_operator_id,unload_started_at,unload_completed_at")
    .eq("id",receiptId).maybeSingle();
  if(re)throw re;if(!r)throw new Error("Carreta não encontrada.");
  if(r.unload_operator_id!==operator.id)throw new Error("Esta descarga pertence a outro empilhador.");
  if(r.unload_status==="completed")return r;
  if(!r.unload_started_at)throw new Error("A descarga ainda não foi iniciada.");
  const {data,error}=await db.from("receiving_nri_receipts").update({
    unload_status:"completed",unload_completed_at:now,unload_completion_source:"forklift",updated_at:now
  }).eq("id",receiptId).eq("unload_operator_id",operator.id)
    .select("id,status,unload_status,unload_operator_id,unload_started_at,unload_completed_at").single();
  if(error)throw error;
  await db.from("receiving_unload_events").insert({receipt_id:receiptId,operator_id:operator.id,event_type:"FINISH",details:{operator:operator.display_name}});
  return data;
}
async function forkliftPutawayOrders(operator:any){
  const {data:receipts,error:re}=await db.from("receiving_nri_receipts").select("id").eq("unload_operator_id",operator.id);
  if(re)throw re;const ids=(receipts||[]).map((x:any)=>x.id);if(!ids.length)return[];
  const {data,error}=await db.from("receiving_putaway_orders")
    .select("id,receipt_id,order_code,status,public_token,created_at,receipt:receiving_nri_receipts(receipt_code,truck_number,arrival_date,factory_name,plate)")
    .in("receipt_id",ids).neq("status","cancelled").order("created_at",{ascending:false});
  if(error)throw error;return data||[];
}
async function productivity(from:string,to:string){
  let q=db.from("receiving_nri_receipts").select(
    "id,receipt_code,arrival_date,status,unload_status,unload_operator_id,unload_started_at,unload_completed_at,operator:receiving_forklift_operators(display_name),items:receiving_nri_items(unit_text,physical_qty,pallet_count,pallet_capacity)"
  ).not("unload_operator_id","is",null).order("arrival_date",{ascending:true});
  if(from)q=q.gte("arrival_date",from);if(to)q=q.lte("arrival_date",to);
  const {data,error}=await q;if(error)throw error;
  const map=new Map<string,any>();
  for(const r of data||[]){
    const id=String(r.unload_operator_id),name=(r.operator as any)?.display_name||"Empilhador";
    if(!map.has(id))map.set(id,{operator_id:id,display_name:name,trucks:0,pallets:0,open:0,total_minutes:0,timed:0});
    const x=map.get(id);
    if(r.unload_status==="completed"){
      x.trucks++;x.pallets+=palletEquivalent(r.items||[]);
      if(r.unload_started_at&&r.unload_completed_at){
        x.total_minutes+=(Date.parse(r.unload_completed_at)-Date.parse(r.unload_started_at))/60000;x.timed++;
      }
    }else{x.open++;}
  }
  return [...map.values()].map(x=>({
    operator_id:x.operator_id,display_name:x.display_name,trucks:x.trucks,
    pallets:Number(x.pallets.toFixed(2)),open:x.open,
    avg_pallets_per_truck:x.trucks?Number((x.pallets/x.trucks).toFixed(2)):0,
    avg_minutes:x.timed?Number((x.total_minutes/x.timed).toFixed(1)):null
  })).sort((a,b)=>b.pallets-a.pallets||b.trucks-a.trucks||a.display_name.localeCompare(b.display_name,"pt-BR"));
}
async function adminOperators(){
  const {data,error}=await db.from("receiving_forklift_operators").select("id,display_name,active,pin_hash,created_at,updated_at").order("display_name");
  if(error)throw error;
  return (data||[]).map((x:any)=>({id:x.id,display_name:x.display_name,active:x.active,pin_ready:!!x.pin_hash,created_at:x.created_at,updated_at:x.updated_at}));
}
async function adminCreateOperator(name:string){
  name=clean(name,100);if(name.length<2)throw new Error("Informe o nome do empilhador.");
  const pin=randomPin();
  const {data,error}=await db.from("receiving_forklift_operators").insert({display_name:name,pin_hash:await hash(pin)}).select("id,display_name,active").single();
  if(error)throw error;return {...data,pin};
}
async function adminResetOperator(id:string){
  const pin=randomPin();
  const {data,error}=await db.from("receiving_forklift_operators").update({pin_hash:await hash(pin),updated_at:new Date().toISOString()}).eq("id",id).select("id,display_name,active").single();
  if(error)throw error;await db.from("receiving_forklift_sessions").delete().eq("operator_id",id);return {...data,pin};
}
async function adminToggleOperator(id:string,active:boolean){
  const {data,error}=await db.from("receiving_forklift_operators").update({active,updated_at:new Date().toISOString()}).eq("id",id).select("id,display_name,active").single();
  if(error)throw error;if(!active)await db.from("receiving_forklift_sessions").delete().eq("operator_id",id);return data;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});
  if(req.method!=="POST")return json(req,{error:"Método não permitido."},405);
  try{
    const b=await req.json().catch(()=>({})),action=clean(b.action,60);

    if(action==="forklift_users")return json(req,{operators:await forkliftUsers()});
    if(action==="forklift_login"){if(!await consumeLoginAttempt("putaway-api",b.operator_id))return json(req,{error:"Muitas tentativas. Aguarde 15 minutos."},429);
      const x=await forkliftLogin(clean(b.operator_id,80),clean(b.pin,10));
      return json(req,x);
    }

    const forklift=await forkliftUser(req);
    if(action==="forklift_session"){
      if(!forklift)return json(req,{error:"Sessão do empilhador inválida ou expirada."},401);
      return json(req,{operator:forklift});
    }
    if(action==="forklift_logout"){
      const t=req.headers.get("x-forklift-token")||"";
      if(t)await db.from("receiving_forklift_sessions").delete().eq("token_hash",await hash(t));
      return json(req,{ok:true});
    }
    if(["forklift_queue","forklift_start_unload","forklift_finish_unload","forklift_orders","forklift_order","forklift_store"].includes(action)){
      if(!forklift)return json(req,{error:"Sessão do empilhador inválida ou expirada."},401);
      if(action==="forklift_queue")return json(req,{receipts:await unloadQueue(forklift)});
      if(action==="forklift_start_unload")return json(req,{receipt:await startUnload(Number(b.receipt_id),forklift)});
      if(action==="forklift_finish_unload")return json(req,{receipt:await finishUnload(Number(b.receipt_id),forklift)});
      if(action==="forklift_orders")return json(req,{orders:await forkliftPutawayOrders(forklift)});
      if(action==="forklift_order"){
        const token=clean(b.token,80);if(!token)throw new Error("Ordem de Guarda inválida.");
        return json(req,{order:await publicBundle(token)});
      }
      if(action==="forklift_store"){
        const token=clean(b.token,80),taskId=clean(b.task_id,80);
        return json(req,{order:await storeTask(token,taskId,forklift,b.actual_address,b.note||"")});
      }
    }

    if(action==="public_order"){
      const token=clean(b.token,80);if(!token)throw new Error("Token da Ordem de Guarda ausente.");
      return json(req,{order:await publicBundle(token)});
    }

    const [app,conf]=await Promise.all([appUser(req),confUser(req)]);
    const actor=app?{type:"APP",id:app.id,name:app.display_name||app.username,role:app.role}:conf?{type:"CONFERENTE",id:conf.id,name:conf.display_name}:null;
    if(!actor)return json(req,{error:"Sessão inválida ou expirada."},401);

    if(action==="forklift_productivity"){
      return json(req,{items:await productivity(clean(b.from,10),clean(b.to,10))});
    }
    if(["forklift_admin_list","forklift_admin_create","forklift_admin_reset_pin","forklift_admin_toggle"].includes(action)){
      if(!app||String(app.role)!=="admin")return json(req,{error:"Acesso restrito à administração."},403);
      if(action==="forklift_admin_list")return json(req,{operators:await adminOperators()});
      if(action==="forklift_admin_create")return json(req,{operator:await adminCreateOperator(b.display_name)});
      if(action==="forklift_admin_reset_pin")return json(req,{operator:await adminResetOperator(clean(b.id,80))});
      if(action==="forklift_admin_toggle")return json(req,{operator:await adminToggleOperator(clean(b.id,80),!!b.active)});
    }

    if(action==="get_or_create"){
      const id=Number(b.receipt_id);if(!Number.isInteger(id)||id<=0)throw new Error("Recebimento inválido.");
      return json(req,{order:await getOrCreate(id,actor)});
    }
    if(action==="order"){
      const id=Number(b.order_id);if(!Number.isInteger(id)||id<=0)throw new Error("Ordem inválida.");
      const order=await orderBundle(id);if(!(await actorCanSeeOrder(actor,order)))return json(req,{error:"Sem acesso à Ordem de Guarda."},403);
      return json(req,{order});
    }
    if(action==="list_orders"){
      let q=db.from("receiving_putaway_orders").select("id,receipt_id,order_code,status,created_at,updated_at,completed_at,receipt:receiving_nri_receipts(receipt_code,truck_number,arrival_date,factory_name,plate,conference_by,unload_operator_id,unload_status,operator:receiving_forklift_operators(display_name),conferencer:bo_conferencers(display_name))").order("created_at",{ascending:false}).limit(150);
      const {data,error}=await q;if(error)throw error;
      let orders=data||[];if(actor.type==="CONFERENTE")orders=orders.filter((x:any)=>x.receipt?.conference_by===actor.id);
      const ids=orders.map((x:any)=>x.id);
      const {data:tasks,error:te}=ids.length?await db.from("receiving_putaway_tasks").select("order_id,status").in("order_id",ids):{data:[],error:null} as any;if(te)throw te;
      const counts=new Map<number,any>();for(const t of tasks||[]){if(!counts.has(t.order_id))counts.set(t.order_id,{total:0,planned:0,pending:0,validated:0,rejected:0});const c=counts.get(t.order_id);c.total++;if(t.status==="planned")c.planned++;if(t.status==="stored_pending_validation")c.pending++;if(t.status==="validated")c.validated++;if(t.status==="rejected")c.rejected++}
      return json(req,{orders:orders.map((x:any)=>({...x,counts:counts.get(x.id)||{total:0,planned:0,pending:0,validated:0,rejected:0}}))});
    }
    if(action==="refresh_plan"){
      const id=Number(b.order_id);const order=await orderBundle(id);if(!(await actorCanSeeOrder(actor,order)))return json(req,{error:"Sem acesso."},403);
      return json(req,{order:await refreshOrder(id,actor)});
    }
    if(action==="set_task_area"){
      const id=Number(b.order_id);return json(req,{order:await setTaskArea(id,clean(b.task_id,80),clean(b.area,40),actor)});
    }
    if(action==="validate_task"){
      if(!conf)return json(req,{error:"A validação final exige o PIN do conferente responsável."},403);
      return json(req,{order:await validateTask(Number(b.order_id),clean(b.task_id,80),conf)});
    }
    if(action==="validate_all"){
      if(!conf)return json(req,{error:"A validação final exige o PIN do conferente responsável."},403);
      let order=await orderBundle(Number(b.order_id));
      const pending=(order.tasks||[]).filter((x:any)=>x.status==="stored_pending_validation");
      const errors:any[]=[];
      for(const task of pending){
        try{order=await validateTask(order.id,task.id,conf)}catch(e){errors.push({task_id:task.id,address:task.actual_address,error:e instanceof Error?e.message:String(e)})}
      }
      return json(req,{order,errors});
    }
    if(action==="reject_task"){
      if(!conf)return json(req,{error:"A rejeição exige o PIN do conferente responsável."},403);
      return json(req,{order:await rejectTask(Number(b.order_id),clean(b.task_id,80),conf,b.note||"")});
    }
    return json(req,{error:"Ação inválida."},400);
  }catch(e){
    console.error(e);
    return json(req,{error:e instanceof Error?e.message:"Erro interno na Ordem de Guarda."},500);
  }
});
async function consumeLoginAttempt(scope:string,identity:unknown){
 const normalized=String(identity??"").trim().toLowerCase().slice(0,200);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(scope+":"+normalized))),b=>b.toString(16).padStart(2,"0")).join("");
 const {data,error}=await db.rpc("consume_login_attempt",{p_key:hash});
 if(error)throw error;return data===true;
}
