import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "https://painel-armaz-m.gabrielysilva27.workers.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256(text: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}
async function requireSession(req: Request) {
  const token = req.headers.get("x-session-token") || "";
  if (!token) return null;
  const tokenHash = await sha256(token);
  const { data: s } = await db.from("app_sessions").select("user_id,expires_at").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!s) return null;
  const { data: u } = await db.from("app_users").select("id,username,display_name,role,active").eq("id", s.user_id).eq("active", true).maybeSingle();
  return u || null;
}

const CLASSES = ["A","B","C"];
const GUARAVITA_SKU = "22209";
const REGULADOR_PICKING_RECT = { minX:74, maxX:99, minY:16, maxY:50 };
const compact = (value: unknown) => String(value || "").trim().toUpperCase().replace(/^([A-Z]+)0+(\d)/,"$1$2").replace(/[^A-Z0-9]/g,"");

// Regra de armazenagem do Estoque Geral:
// A/B/C/G com lado -A/-B são prateleiras.
// Curva A usa rua fechada, exceto Guaravita 22209.
// Curvas B/C usam prateleiras.
// Guaravita 22209 usa prateleira por fragilidade/empilhamento.
const isShelfAddress = (address: unknown) => /^[ABCG]\d{1,3}-[AB]$/i.test(String(address || "").trim());
const storageCompatible = (area:string,address:unknown,sku:unknown,curve:string) => {
  if (area !== "Regulador") return true;
  const shelf = isShelfAddress(address);
  const code = String(sku || "");
  if (code === GUARAVITA_SKU) return shelf;
  if (curve === "A") return !shelf;
  if (curve === "B" || curve === "C") return shelf;
  return true;
};

function addCandidate(map: Map<string, any>, address: string, x: number | null, y: number | null, source?: string) {
  const key = compact(address);
  if (!key) return;
  let item = map.get(key);
  if (!item) {
    item = { key, address: String(address), points: [], sources: new Set<string>() };
    map.set(key, item);
  }
  if (Number.isFinite(x) && Number.isFinite(y)) item.points.push({ x, y });
  if (source) item.sources.add(source);
}
function finalizeCandidates(map: Map<string, any>) {
  return [...map.values()].map((item: any) => {
    const points = item.points || [];
    const x = points.length ? points.reduce((s: number,p: any)=>s+p.x,0)/points.length : null;
    const y = points.length ? points.reduce((s: number,p: any)=>s+p.y,0)/points.length : null;
    return { key:item.key,address:item.address,x,y,sources:[...item.sources] };
  });
}
function physicalCandidates(snapshot: any, area: string) {
  const payload = snapshot.payload || {};
  const map = new Map<string, any>();
  const anchors = payload.maps?.[area]?.anchors || [];
  for (const a of anchors) {
    const x = Number(a.col) + (Number(a.width || 1)-1)/2;
    const y = Number(a.row) + (Number(a.height || 1)-1)/2;
    addCandidate(map,a.address,x,y,"map");
  }
  if (area === "Regulador") {
    [
      ["A37-A",93.5,61],["A37-B",93.5,62],
      ["B36-A",96.5,61],["B36-B",96.5,62],
      ["E64",12.5,45.5]
    ].forEach((x:any[])=>addCandidate(map,x[0],x[1],x[2],"supplement"));
  }
  const marketRackPoints = new Map<string, any[]>();
  if (area === "Marketplace") {
    for (const a of anchors) {
      const m = String(a.address || "").match(/^(M\d+)-/i);
      if (!m) continue;
      const p = m[1].toUpperCase();
      if (!marketRackPoints.has(p)) marketRackPoints.set(p,[]);
      marketRackPoints.get(p)!.push({
        x:Number(a.col)+(Number(a.width||1)-1)/2,
        y:Number(a.row)+(Number(a.height||1)-1)/2
      });
    }
  }
  const rows = payload.rows || [];
  const addresses = new Set<string>();
  for (const r of rows) {
    if (r.area !== area || !r.address) continue;
    const key = compact(r.address);
    if (addresses.has(key)) continue;
    addresses.add(key);
    if (map.has(key)) { addCandidate(map,r.address,null,null,"base"); continue; }
    if (area === "Marketplace") {
      const m = String(r.address).match(/^(M\d+)-/i);
      const pts = m ? marketRackPoints.get(m[1].toUpperCase()) : null;
      if (pts?.length) {
        addCandidate(map,r.address,pts.reduce((s,p)=>s+p.x,0)/pts.length,pts.reduce((s,p)=>s+p.y,0)/pts.length,"rack");
        continue;
      }
    }
    addCandidate(map,r.address,null,null,"base");
  }
  return finalizeCandidates(map);
}
function distanceToRect(x:number,y:number,rect:{minX:number,maxX:number,minY:number,maxY:number}) {
  const dx = x < rect.minX ? rect.minX-x : x > rect.maxX ? x-rect.maxX : 0;
  const dy = y < rect.minY ? rect.minY-y : y > rect.maxY ? y-rect.maxY : 0;
  return Math.hypot(dx,dy);
}
function pickingReferencePoints(snapshot:any, area:string, candidates:any[]) {
  const byKey = new Map(candidates.map((c:any)=>[c.key,c]));
  const monitored = snapshot.payload?.targets?.[area]?.monitored || [];
  const mapped:any[] = [];
  for (const m of monitored) {
    const c:any = byKey.get(compact(m.address));
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) mapped.push({x:c.x,y:c.y});
  }
  if (mapped.length) return mapped;

  const positioned = candidates.filter((c:any)=>Number.isFinite(c.x)&&Number.isFinite(c.y));
  if (!positioned.length) return [];
  const edgeY = Math.min(...positioned.map((c:any)=>c.y));
  return positioned.filter((c:any)=>Math.abs(c.y-edgeY)<0.001).map((c:any)=>({x:c.x,y:c.y}));
}
function rankCandidates(snapshot:any, area:string, candidates:any[]) {
  const refs = area === "Regulador" ? [] : pickingReferencePoints(snapshot,area,candidates);
  const positioned = candidates.filter((c:any)=>Number.isFinite(c.x)&&Number.isFinite(c.y));
  const fallbackY = positioned.length ? Math.min(...positioned.map((c:any)=>c.y)) : 0;
  const items = candidates.map((c:any,index:number)=>{
    let distance:number;
    if (Number.isFinite(c.x) && Number.isFinite(c.y) && area === "Regulador") {
      distance = distanceToRect(c.x,c.y,REGULADOR_PICKING_RECT);
    } else if (Number.isFinite(c.x) && Number.isFinite(c.y) && refs.length) {
      distance = Math.min(...refs.map((p:any)=>Math.hypot(c.x-p.x,c.y-p.y)));
    } else if (Number.isFinite(c.y)) {
      distance = Math.abs(c.y-fallbackY);
    } else {
      distance = 100000 + index;
    }
    return {...c,score:distance,distance_to_picking:distance};
  });
  items.sort((a:any,b:any)=>a.score-b.score || (a.y||9999)-(b.y||9999) || (a.x||9999)-(b.x||9999) || String(a.address).localeCompare(String(b.address),"pt-BR",{numeric:true}));
  return items;
}
function allocateZones(total:number, skuCounts:Record<string,number>, occupiedDemand:Record<string,number>) {
  const base:Record<string,number> = {};
  const occupiedTotal = CLASSES.reduce((s,c)=>s+Number(occupiedDemand[c]||0),0);
  for (const c of CLASSES) base[c] = occupiedTotal > 0 ? Number(occupiedDemand[c]||0) : Number(skuCounts[c]||0);
  const baseTotal = CLASSES.reduce((s,c)=>s+base[c],0);
  if (!baseTotal || !total) return {A:0,B:0,C:total||0,base};
  const raw:Record<string,number> = {}, alloc:Record<string,number> = {};
  for (const c of CLASSES) {
    raw[c] = total*base[c]/baseTotal;
    alloc[c] = Math.floor(raw[c]);
    if (base[c] > 0 && alloc[c] === 0) alloc[c] = 1;
  }
  let used = CLASSES.reduce((s,c)=>s+alloc[c],0);
  while (used > total) {
    const reducible = [...CLASSES].reverse().filter(c=>alloc[c] > (base[c] > 0 ? 1 : 0));
    if (!reducible.length) break;
    reducible.sort((a,b)=>(alloc[b]-raw[b])-(alloc[a]-raw[a]));
    alloc[reducible[0]]--; used--;
  }
  while (used < total) {
    const order = [...CLASSES].sort((a,b)=>(raw[b]-Math.floor(raw[b]))-(raw[a]-Math.floor(raw[a])) || CLASSES.indexOf(a)-CLASSES.indexOf(b));
    alloc[order[(used-total+order.length*1000)%order.length]]++; used++;
  }
  return {...alloc,base};
}
function measure(snapshot:any, area:string, curves:any[], allCurves:any[]) {
  const curveMap = new Map(curves.map((x:any)=>[String(x.sku_code||""),x.curve_class]));
  const bySku = new Map<string,any[]>();
  for (const x of allCurves || []) {
    const code = String(x.sku_code||"");
    if (!code || !CLASSES.includes(x.curve_class)) continue;
    if (!bySku.has(code)) bySku.set(code,[]);
    bySku.get(code)!.push(x);
  }
  const fallbackOrder = area === "Regulador"
    ? ["Marketplace","Câmara Fria","Picking"]
    : area === "Marketplace"
      ? ["Regulador","Câmara Fria","Picking"]
      : ["Regulador","Marketplace","Picking"];
  const resolveCurve = (code:string) => {
    const direct = curveMap.get(code);
    if (CLASSES.includes(direct)) return direct;
    const rows = bySku.get(code) || [];
    for (const preferred of fallbackOrder) {
      const found = rows.find((x:any)=>x.area===preferred && CLASSES.includes(x.curve_class));
      if (found) return found.curve_class;
    }
    const any = rows.find((x:any)=>CLASSES.includes(x.curve_class));
    if (any) return any.curve_class;
    return "C";
  };
  const skuCounts:Record<string,number> = {A:0,B:0,C:0};
  for (const x of curves) if (CLASSES.includes(x.curve_class)) skuCounts[x.curve_class]++;
  const grouped = new Map<string,any[]>();
  for (const r of snapshot.payload?.rows || []) {
    if (r.area !== area) continue;
    const key = compact(r.address);
    if (!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key)!.push(r);
  }
  const locations = new Map<string,any>();
  const demand:Record<string,number> = {A:0,B:0,C:0};
  for (const [key,allRows] of grouped.entries()) {
    const rows = allRows.filter((r:any)=>r.sku_code && r.pallets !== 0);
    if (!rows.length) { locations.set(key,{occupied:false,classes:[],unknown:[],rows:[],address:allRows[0]?.address||""}); continue; }
    const classes:string[] = [], unknown:string[] = [];
    const resolvedRows = rows.map((r:any)=>({...r,_curve:resolveCurve(String(r.sku_code||""))}));
    for (const r of resolvedRows) {
      if (CLASSES.includes(r._curve)) classes.push(r._curve);
    }
    const unique = [...new Set(classes)];
    const highest = CLASSES.find(c=>unique.includes(c));
    if (highest) demand[highest]++;
    locations.set(key,{occupied:true,classes:unique,unknown:[...new Set(unknown)],rows:resolvedRows,address:allRows[0]?.address||""});
  }
  const ranked = rankCandidates(snapshot,area,physicalCandidates(snapshot,area));

  if (area === "Câmara Fria") {
    let adherent=0, non=0, unclassified=0, occupied=0;
    const deviations:any[] = [];
    for (const [key,loc] of locations.entries()) {
      if (!loc.occupied) continue;
      occupied++;
      if (loc.classes.length === 1 && loc.classes[0] === "A") {
        adherent++;
      } else {
        non++;
        deviations.push({key,zone:"A",status:"Não aderente",classes:loc.classes});
      }
    }
    const rate = adherent+non ? Number((100*adherent/(adherent+non)).toFixed(1)) : null;
    return {
      rate,
      adherent,
      non_adherent:non,
      unclassified,
      occupied,
      allocation:{A:ranked.length,B:0,C:0},
      sku_counts:skuCounts,
      deviations:deviations.slice(0,100)
    };
  }

  const allocation:any = allocateZones(ranked.length,skuCounts,demand);
  const zoneByKey = new Map<string,string>();
  let cursor = 0;
  for (const c of CLASSES) {
    const n = Number(allocation[c]||0);
    for (const p of ranked.slice(cursor,cursor+n)) zoneByKey.set(p.key,c);
    cursor += n;
  }
  let adherent=0, non=0, unclassified=0, occupied=0;
  const deviations:any[] = [];
  for (const [key,loc] of locations.entries()) {
    const zone = zoneByKey.get(key);
    if (!zone || !loc.occupied) continue;
    occupied++;
    const structureOk = area !== "Regulador" || loc.rows.every((r:any)=>
      storageCompatible(area,loc.address,r.sku_code,r._curve || "C")
    );
    if (loc.classes.length === 1 && loc.classes[0] === zone && structureOk) {
      adherent++;
    } else {
      non++;
      deviations.push({key,zone,status:"Não aderente",classes:loc.classes,structure_ok:structureOk});
    }
  }
  const rate = adherent+non ? Number((100*adherent/(adherent+non)).toFixed(1)) : null;
  return {rate,adherent,non_adherent:non,unclassified,occupied,allocation:{A:allocation.A||0,B:allocation.B||0,C:allocation.C||0},sku_counts:skuCounts,deviations:deviations.slice(0,100)};
}
async function latestSnapshot() {
  const { data,error } = await db.from("stock_snapshots").select("*").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}
async function captureArea(month:string, area:string) {
  const snapshot = await latestSnapshot();
  if (!snapshot) throw new Error("Nenhuma fotografia de estoque ativa");
  if (String(snapshot.as_of || "").slice(0,7) !== month) throw new Error("A fotografia de estoque ativa não pertence ao mês informado.");
  const { data:allCurves,error } = await db.from("abc_items").select("sku_code,curve_class,area").eq("reference_month",month+"-01");
  if (error) throw error;
  const curves = (allCurves || []).filter((x:any)=>x.area===area);
  if (!curves.length) throw new Error("Curva ABC não encontrada para "+area+" em "+month);
  const result = measure(snapshot,area,curves,allCurves || []);
  const observed = snapshot.as_of;
  const row = {
    reference_month:month+"-01",
    area,
    rate:area === "Câmara Fria" ? 100 : result.rate,
    adherent:area === "Câmara Fria" ? result.occupied : result.adherent,
    non_adherent:area === "Câmara Fria" ? 0 : result.non_adherent,
    occupied:result.occupied,
    source_as_of:snapshot.as_of,
    source_type:area === "Câmara Fria" ? "fixed_838_curve_a" : area === "Regulador" ? "physical_count_storage_rule" : "physical_count",
    updated_at:new Date().toISOString()
  };
  const { data,error:upsertError } = await db.from("abc_adherence_monthly_summary")
    .upsert(row,{onConflict:"reference_month,area"}).select("*").single();
  if (upsertError) throw upsertError;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
  if (req.method !== "POST") return json({error:"Método não permitido"},405);
  try {
    const user = await requireSession(req);
    if (!user) return json({error:"Sessão inválida ou expirada"},401);
    const body = await req.json();
    const action = String(body.action || "");
    if (["capture","capture_all"].includes(action) && user.role !== "admin") return json({error:"Acesso restrito à administração."},403);
    if (action === "history") {
      const area = String(body.area || "");
      const validAreas = ["Regulador","Marketplace","Câmara Fria","Picking"];
      if (area && !validAreas.includes(area)) return json({error:"Área inválida"},400);

      const { data:months,error:monthsError } = await db.from("abc_months")
        .select("reference_month").eq("status","imported").order("reference_month",{ascending:true});
      if (monthsError) throw monthsError;

      let q = db.from("abc_adherence_monthly_summary")
        .select("reference_month,area,rate,adherent,non_adherent,occupied,source_as_of,source_type,updated_at")
        .order("reference_month",{ascending:true});
      if (area) q = q.eq("area",area);
      const { data:summary,error } = await q;
      if (error) throw error;

      const byMonth = new Map((summary||[]).map((x:any)=>[String(x.reference_month).slice(0,7),x]));
      const items = (months||[]).map((m:any)=>{
        const key=String(m.reference_month).slice(0,7), found:any=byMonth.get(key);
        if (found) return found;
        if (area === "Picking" || area === "Câmara Fria") {
          return {
            reference_month:m.reference_month,
            area,
            rate:100,
            adherent:null,
            non_adherent:0,
            occupied:null,
            source_as_of:null,
            source_type:area === "Picking" ? "fixed_100_no_count_history" : "fixed_838_curve_a",
            updated_at:null
          };
        }
        return {
          reference_month:m.reference_month,
          area,
          rate:null,
          adherent:null,
          non_adherent:null,
          occupied:null,
          source_as_of:null,
          source_type:"pending_monthly_result",
          updated_at:null
        };
      });
      return json({items});
    }
    if (action === "capture") {
      const month = String(body.month || "");
      const area = String(body.area || "");
      if (!/^\d{4}-\d{2}$/.test(month)) return json({error:"Mês inválido"},400);
      if (!["Regulador","Marketplace","Câmara Fria"].includes(area)) return json({error:"Área inválida para medição física"},400);
      const item = await captureArea(month,area);
      return json({ok:true,item});
    }
    if (action === "capture_all") {
      const month = String(body.month || "");
      if (!/^\d{4}-\d{2}$/.test(month)) return json({error:"Mês inválido"},400);
      const items = [];
      for (const area of ["Regulador","Marketplace","Câmara Fria"]) {
        try { items.push(await captureArea(month,area)); } catch (e) { items.push({area,error:e instanceof Error?e.message:String(e)}); }
      }
      return json({ok:true,items});
    }
    return json({error:"Ação inválida"},400);
  } catch (e) {
    console.error(e);
    return json({error:e instanceof Error?e.message:"Erro ao processar aderência"},400);
  }
});