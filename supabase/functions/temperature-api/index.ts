import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-session-token, x-bo-token","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

const AREAS=["Câmara Fria","Retornável","Descartável","Repack","Marketplace"] as const;
const SHIFTS=["MANHÃ","TARDE","NOITE"] as const;
const START_DATE="2026-09-29";
const CONFIG:any={
  "Câmara Fria":{points:1,morning_only:true,ok_max:5,critical_min:9},
  "Retornável":{points:2,morning_only:false,ok_max:22,critical_min:25.000001},
  "Descartável":{points:2,morning_only:false,ok_max:22,critical_min:25.000001},
  "Repack":{points:1,morning_only:false,ok_max:22,critical_min:25.000001},
  "Marketplace":{points:1,morning_only:false,ok_max:22,critical_min:25.000001},
};
const clean=(v:unknown,max=120)=>String(v??"").trim().slice(0,max);
const todayBR=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"America/Sao_Paulo"});
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T12:00:00Z"));
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256(text:string){return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
async function requireAppUser(req:Request){
  const token=req.headers.get("x-session-token")||""; if(!token)return null;
  const {data:s}=await db.from("app_sessions").select("user_id,expires_at").eq("token_hash",await sha256(token)).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!s)return null;
  const {data:u}=await db.from("app_users").select("id,username,display_name,role,active").eq("id",s.user_id).eq("active",true).maybeSingle();
  return u||null;
}
async function requireBoUser(req:Request){
  const token=req.headers.get("x-bo-token")||""; if(!token)return null;
  const {data:s}=await db.from("bo_conferencer_sessions").select("id,conferencer_id,expires_at").eq("token_hash",await sha256(token)).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!s)return null;
  const {data:u}=await db.from("bo_conferencers").select("id,display_name,active").eq("id",s.conferencer_id).eq("active",true).maybeSingle();
  return u||null;
}
function statusFor(area:string,temp:number){
  if(area==="Câmara Fria") return temp<=5?"ok":temp<9?"attention":"critical";
  return temp<=22?"ok":temp<=25?"attention":"critical";
}
function guidance(status:string){
  if(status==="ok")return "OK";
  if(status==="attention")return "Solicitar atenção dos ajudantes na movimentação.";
  return "Não realizar movimentação manual de caixaria; localizar os SKUs de caixaria nas áreas mais frescas do armazém.";
}
function num(v:unknown,label:string){
  if(v==null||v==="")throw new Error(label+" é obrigatória.");
  const n=Number(v); if(!Number.isFinite(n)||n<-20||n>60)throw new Error(label+" inválida.");
  return Math.round(n*100)/100;
}
function monthBounds(month:string){
  if(!/^\d{4}-\d{2}$/.test(month))throw new Error("Mês inválido.");
  const start=month+"-01",d=new Date(start+"T00:00:00Z");d.setUTCMonth(d.getUTCMonth()+1);
  return [start,d.toISOString().slice(0,10)];
}
async function fetchRows(start:string,end:string,area?:string){
  const out:any[]=[];
  for(let offset=0;;offset+=1000){
    let q=db.from("temperature_readings").select("id,reading_date,shift,area,temp_1,temp_2,temperature,status,conferencer_name,source,created_at,updated_at")
      .gte("reading_date",start).lt("reading_date",end)
      .order("reading_date",{ascending:false}).order("id",{ascending:false}).range(offset,offset+999);
    if(area&&area!=="all")q=q.eq("area",area);
    const {data,error}=await q;if(error)throw error;
    out.push(...(data||[]));if(!data||data.length<1000)break;
  }
  return out;
}
function aggregate(rows:any[]){
  const byArea=new Map<string,any>();
  const summary={readings:rows.length,ok:0,attention:0,critical:0};
  for(const r of rows){
    summary[r.status as "ok"|"attention"|"critical"]++;
    if(!byArea.has(r.area))byArea.set(r.area,{area:r.area,readings:0,sum:0,max:null,ok:0,attention:0,critical:0});
    const x=byArea.get(r.area);x.readings++;x.sum+=Number(r.temperature);x.max=x.max==null?Number(r.temperature):Math.max(x.max,Number(r.temperature));x[r.status]++;
  }
  const areas=AREAS.map(area=>{
    const x=byArea.get(area)||{area,readings:0,sum:0,max:null,ok:0,attention:0,critical:0};
    return {...x,avg_temp:x.readings?Number((x.sum/x.readings).toFixed(1)):null,max_temp:x.max==null?null:Number(x.max.toFixed(1)),sum:undefined,max:undefined};
  });
  return {summary,areas};
}
function monthly(rows:any[],area:string){
  const m=new Map<string,any>();
  for(const r of rows){
    const key=String(r.reading_date).slice(0,7);
    if(!m.has(key))m.set(key,{month:key,readings:0,sum:0,max:null,ok:0,attention:0,critical:0});
    const x=m.get(key);x.readings++;x.sum+=Number(r.temperature);x.max=x.max==null?Number(r.temperature):Math.max(x.max,Number(r.temperature));x[r.status]++;
  }
  return [...m.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(x=>({
    month:x.month,readings:x.readings,
    avg_temp:area!=="all"&&x.readings?Number((x.sum/x.readings).toFixed(1)):null,
    max_temp:area!=="all"&&x.max!=null?Number(x.max.toFixed(1)):null,
    ok:x.ok,attention:x.attention,critical:x.critical
  }));
}

function controlSeries(rows:any[]){
  const grouped=new Map<string,Map<string,any>>();
  for(const area of AREAS)grouped.set(area,new Map());
  for(const r of rows){
    if(!grouped.has(r.area))continue;
    const day=String(r.reading_date).slice(0,10),byDay=grouped.get(r.area)!;
    if(!byDay.has(day))byDay.set(day,{date:day,sum:0,readings:0,max:null});
    const x=byDay.get(day),v=Number(r.temperature);
    x.sum+=v;x.readings++;x.max=x.max==null?v:Math.max(x.max,v);
  }
  return AREAS.map(area=>({
    area,
    points:[...(grouped.get(area)?.values()||[])].sort((a:any,b:any)=>a.date.localeCompare(b.date)).map((x:any)=>({
      date:x.date,
      avg_temp:Number((x.sum/x.readings).toFixed(2)),
      max_temp:Number(x.max.toFixed(2)),
      readings:x.readings
    }))
  }));
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método não permitido."},405);
  try{
    const body=await req.json().catch(()=>({})),action=clean(body.action,40);
    if(action==="dashboard"){
      const user=await requireAppUser(req);if(!user)return json({error:"Sessão inválida ou expirada."},401);
      const month=/^\d{4}-\d{2}$/.test(String(body.month||""))?String(body.month):todayBR().slice(0,7);
      const area=AREAS.includes(body.area)?String(body.area):"all";
      const [start,end]=monthBounds(month);
      const detail=await fetchRows(start,end,area);
      const year=month.slice(0,4),yearRows=await fetchRows(year+"-01-01",String(Number(year)+1)+"-01-01",area);
      const agg=aggregate(detail);
      const recent=detail.slice(0,80).map(r=>({...r,guidance:guidance(r.status)}));
      const months=[...new Set(yearRows.map(r=>String(r.reading_date).slice(0,7)))].sort();
      return json({month,area,summary:agg.summary,by_area:agg.areas,monthly:monthly(yearRows,area),recent,months,areas:AREAS,config:CONFIG,control:controlSeries(detail)});
    }

    const conf=await requireBoUser(req);if(!conf)return json({error:"PIN expirado. Identifique-se novamente."},401);

    if(action==="shift_readings"){
      const date=clean(body.reading_date,10),shift=clean(body.shift,10).toUpperCase();
      if(!validDate(date)||!SHIFTS.includes(shift as any))return json({error:"Data ou turno inválido."},400);
      const {data,error}=await db.from("temperature_readings").select("reading_date,shift,area,temp_1,temp_2,temperature,status,conferencer_name,source")
        .eq("reading_date",date).eq("shift",shift).order("area");if(error)throw error;
      return json({readings:(data||[]).map((r:any)=>({...r,guidance:guidance(r.status)})),config:CONFIG});
    }
    if(action==="my_readings"){
      const {data,error}=await db.from("temperature_readings").select("reading_date,shift,area,temperature,status,updated_at")
        .eq("conferencer_id",conf.id).order("reading_date",{ascending:false}).order("updated_at",{ascending:false}).limit(60);if(error)throw error;
      return json({readings:data||[]});
    }
    if(action==="submit"){
      const date=clean(body.reading_date,10),shift=clean(body.shift,10).toUpperCase(),today=todayBR();
      if(!validDate(date)||date<START_DATE||date>today)throw new Error("A data deve ser de "+START_DATE+" até hoje.");
      if(!SHIFTS.includes(shift as any))throw new Error("Selecione Manhã, Tarde ou Noite.");
      const given=Array.isArray(body.readings)?body.readings:[];
      const expected=shift==="MANHÃ"?[...AREAS]:AREAS.filter(x=>x!=="Câmara Fria");
      const byArea=new Map(given.map((x:any)=>[clean(x.area,40),x]));
      for(const area of expected)if(!byArea.has(area))throw new Error("Informe a temperatura de "+area+".");
      const rows:any[]=[];
      for(const area of expected){
        const cfg=CONFIG[area],item:any=byArea.get(area);
        const t1=num(item?.temp_1,"Temperatura de "+area);
        const t2=cfg.points===2?num(item?.temp_2,"Temperatura 2 de "+area):null;
        const temp=cfg.points===2?Math.max(t1,t2):t1,status=statusFor(area,temp);
        rows.push({reading_date:date,shift,area,temp_1:t1,temp_2:t2,temperature:temp,status,
          conferencer_id:conf.id,conferencer_name:conf.display_name,source:"site",updated_at:new Date().toISOString()});
      }
      const {data,error}=await db.from("temperature_readings").upsert(rows,{onConflict:"reading_date,shift,area"})
        .select("reading_date,shift,area,temp_1,temp_2,temperature,status,conferencer_name,source,updated_at");if(error)throw error;
      return json({ok:true,readings:(data||[]).map((r:any)=>({...r,guidance:guidance(r.status)}))},201);
    }
    return json({error:"Ação inválida."},400);
  }catch(e){console.error("temperature-api",e);return json({error:e instanceof Error?e.message:"Erro interno."},500);}
});
