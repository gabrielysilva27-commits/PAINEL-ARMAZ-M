import {sourceFrames} from './workstation-source.ts';
import {workstationIdentity,ownEmployee,selfProductivity} from './workstation-self.mjs';
import {periodMonths} from './productivity-individual.mjs';
import {createClient} from 'jsr:@supabase/supabase-js@2.57.4';
import {AREAS,summarize,repackActivities,simulate} from './core.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const H={'Access-Control-Allow-Origin':'https://painel-armaz-m.gabrielysilva27.workers.dev','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-session-token','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:H});
const text=(v:unknown,max=1000)=>String(v??'').trim().slice(0,max);
function date(v:unknown){const s=text(v,10);if(!/^20\d\d-\d\d-\d\d$/.test(s)||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw Error('Data inválida.');return s}
function area(v:unknown){const a=text(v,30);if(!Object.hasOwn(AREAS,a))throw Error('Área inválida.');return a}
function shift(v:unknown){const s=text(v,1);if(!['A','B','C'].includes(s))throw Error('Turno inválido.');return s}
function num(v:unknown,min=0,max=100000000){if(v===null||v===undefined||v==='')throw Error('Informe os campos numéricos.');const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error('Valor numérico inválido.');return n}
function required(v:unknown,max=1000){const s=text(v,max);if(!s)throw Error('Preencha todos os campos obrigatórios.');return s}
async function session(req:Request){const t=req.headers.get('x-session-token');if(!t)return null;const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)));const hash=btoa(String.fromCharCode(...digest)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');const {data:s,error}=await db.from('app_sessions').select('user_id').eq('token_hash',hash).gt('expires_at',new Date().toISOString()).maybeSingle();if(error)throw error;if(!s)return null;const {data:u,error:e}=await db.from('app_users').select('id,role,active').eq('id',s.user_id).eq('active',true).maybeSingle();if(e)throw e;return u}
async function all(make:()=>any){const rows:any[]=[];for(let offset=0;offset<50000;offset+=1000){const {data,error}=await make().range(offset,offset+999);if(error)throw error;rows.push(...data);if(data.length<1000)return rows}throw Error('Período muito grande. Reduza o intervalo.');}
async function employees(){return all(()=>db.from('wlp_employees').select('id,display_name,job_title,shift,area,active,repack_worker_id').order('display_name').order('id'))}
async function dashboard(from:string,to:string){
 if(from>to||(Date.parse(to)-Date.parse(from))/86400000>62)throw Error('Selecione um intervalo de até 63 dias.');
 const next=new Date(Date.parse(to+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const [team,attendance,manual,tasks,targets,volumes,actions,closures,efd,simulations]=await Promise.all([
 employees(),all(()=>db.from('wlp_attendance').select('*').gte('reference_date',from).lte('reference_date',to).order('id')),
 all(()=>db.from('wlp_activities').select('*').gte('reference_date',from).lte('reference_date',to).order('id')),
 all(()=>db.from('repack_tasks').select('id,worker_id,process_type,quantity_boxes,started_at,duration_seconds,status').eq('source','timer').eq('status','completed').gte('started_at',from+'T00:00:00-03:00').lt('started_at',next+'T00:00:00-03:00').order('id')),
 all(()=>db.from('wlp_targets').select('*').order('area')),all(()=>db.from('wlp_daily_volume').select('*').gte('reference_date',from).lte('reference_date',to).order('reference_date')),
 all(()=>db.from('wlp_actions').select('*').gte('reference_date',from).lte('reference_date',to).order('created_at',{ascending:false}).order('id')),
 all(()=>db.from('wlp_closures').select('*').gte('reference_date',from).lte('reference_date',to).order('created_at',{ascending:false}).order('id')),
 all(()=>db.from('efd_maps').select('reference_date,physical_at,valid').eq('valid',true).gte('reference_date',from).lte('reference_date',to).order('map_id').order('reference_date')),
 all(()=>db.from('wlp_simulations').select('*').gte('week_start',from).lte('week_start',to).order('created_at',{ascending:false}).order('id'))
 ]);
 const automatic=repackActivities(tasks,team),unmapped=automatic.filter(x=>!x.employee_id),activities=[...manual.map(x=>({...x,source:'manual'})),...automatic.filter(x=>x.employee_id)];
 const volumeMap=new Map(volumes.map(v=>[v.reference_date,v.volume_hl]));const hourMap=new Map<string,number>();for(const a of attendance)hourMap.set(a.reference_date,(hourMap.get(a.reference_date)||0)+Number(a.regular_hours)+Number(a.overtime_hours));
 const dates=[...new Set([...volumeMap.keys(),...hourMap.keys()])].sort();const daily=dates.map(reference_date=>{const hl=volumeMap.get(reference_date)??null,hh=hourMap.get(reference_date)??null;return{reference_date,volume_hl:hl,labor_hours:hh,wlp:hl!==null&&hh!==null&&hh>0?Number(hl)/hh:null}});
 const complete=daily.length>0&&daily.every(x=>x.wlp!==null),totalHL=volumes.reduce((a,v)=>a+Number(v.volume_hl),0),totalHH=attendance.reduce((a,v)=>a+Number(v.regular_hours)+Number(v.overtime_hours),0);
 return{from,to,team,attendance,activities,targets,volumes,actions,closures,simulations,unmapped:unmapped.length,...summarize(activities,attendance,targets),daily,wlp:{volume_hl:totalHL,labor_hours:totalHH,overtime_hours:attendance.reduce((a,v)=>a+Number(v.overtime_hours),0),value:complete?totalHL/totalHH:null,missing_days:daily.filter(x=>x.wlp===null).length},efd:{total:efd.length,completed:efd.filter(x=>x.physical_at).length,on_time:efd.filter(x=>x.physical_at&&x.physical_at.slice(0,19)<=x.reference_date+'T21:00:00').length}};
}
async function save(table:string,row:any,conflict?:string){const q=conflict?db.from(table).upsert(row,{onConflict:conflict}):db.from(table).insert(row);const {error}=await q;if(error)throw error}
async function employee(id:unknown){const {data,error}=await db.from('wlp_employees').select('id,job_title').eq('id',text(id,40)).eq('active',true).maybeSingle();if(error)throw error;if(!data)throw Error('Colaborador inválido ou inativo.');return data.id}
async function overtimeAllowed(id:string,hours:number){if(hours<=0)return;const {data,error}=await db.from('wlp_employees').select('job_title').eq('id',id).single();if(error)throw error;if(/empilhadeira|empilhador/i.test(data.job_title))throw Error('Empilhadores não recebem horas extras.');}
Deno.serve(async req=>{
 if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/workstation')){
 try{
  const identity=await workstationIdentity(req.headers.get('x-workstation-session'));
  if(!identity)return reply({error:'Sessão inválida ou expirada.'},401);
  const url=new URL(req.url),from=date(url.searchParams.get('from')),to=date(url.searchParams.get('to')),basis=url.searchParams.get('basis')||'activity';
  if(from!==to)return reply({error:'Selecione um único dia.'},400);
  if(!['activity','standard','attendance'].includes(basis))return reply({error:'Base de horas inválida.'},400);
  const periods=periodMonths(from,to),team=await employees(),own=ownEmployee(team,identity);
  if(!own)return reply({error:'Seu cadastro ainda não está vinculado a um colaborador ativo do armazém.'},404);
  const [d,frames]=await Promise.all([dashboard(from,to),sourceFrames(db,all,periods,from,to)]);
  return reply(selfProductivity(own,d,frames,[],from,to,basis));
 }catch{return reply({error:'Não foi possível consultar a produtividade. Tente novamente.'},503);}
 }
 if(req.method==='OPTIONS')return reply({ok:true});if(req.method==='GET')return reply({service:'productivity-api',version:'2026-10-06-workstation-1'});if(req.method!=='POST')return reply({error:'Método inválido.'},405);
 try{const u=await session(req);if(!u)return reply({error:'Sessão inválida ou expirada.'},401);const b=await req.json();
 if(b.action==='historical')return reply({months:await all(()=>db.from('wlp_monthly_archive').select('reference_month,payload,imported_at').order('reference_month')),rules:{daily_hours:7+20/60,monthly_overtime:13,forklift_overtime:0,shift_pattern:'6x1'}});
 if(b.action==='dashboard')return reply({dashboard:await dashboard(date(b.from),date(b.to))});
 if(u.role!=='admin')return reply({error:'Alterações restritas à administração.'},403);
 const stamp={recorded_by:u.id};
 if(b.action==='sync_repack'){const workers=await all(()=>db.from('repack_workers').select('id,display_name,active').eq('active',true).order('id'));const existing=await employees();const missing=workers.filter(w=>!existing.some(e=>e.repack_worker_id===w.id));if(missing.length)await save('wlp_employees',missing.map(w=>({display_name:w.display_name,area:'repack',repack_worker_id:w.id,created_by:u.id})),'repack_worker_id');}
 else if(b.action==='employee'||b.action==='employee_update'){
 const row={display_name:required(b.display_name,160),job_title:required(b.job_title,160),area:area(b.area),shift:shift(b.shift)};
 if(row.display_name.length<2)throw Error('Informe o nome completo do colaborador.');
 const existing=await employees(),id=text(b.id,40),key=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
 if(existing.some(e=>e.id!==id&&key(e.display_name)===key(row.display_name)))throw Error('Este colaborador já está cadastrado. Edite ou reative o cadastro existente.');
 if(b.action==='employee_update'){
  if(!id||!existing.some(e=>e.id===id))throw Error('Colaborador não encontrado.');
  const {data,error}=await db.from('wlp_employees').update(row).eq('id',id).select('id').maybeSingle();if(error)throw error;if(!data)throw Error('Colaborador não encontrado.');
 }else await save('wlp_employees',{...row,active:true,created_by:u.id});
 }
 else if(b.action==='employee_status'){
  if(typeof b.active!=='boolean')throw Error('Situação inválida.');
  const id=text(b.id,40);if(!id)throw Error('Colaborador não encontrado.');
  const {data,error}=await db.from('wlp_employees').update({active:b.active}).eq('id',id).select('id').maybeSingle();if(error)throw error;if(!data)throw Error('Colaborador não encontrado.');
 }
 else if(b.action==='attendance'){const regular=num(b.regular_hours,0,24),overtime=num(b.overtime_hours,0,24),id=await employee(b.employee_id),day=date(b.reference_date),a=area(b.area),s=shift(b.shift);await overtimeAllowed(id,overtime);const registered=await all(()=>db.from('wlp_attendance').select('area,shift,regular_hours,overtime_hours').eq('employee_id',id).eq('reference_date',day).order('id'));const other=registered.filter(x=>x.area!==a||x.shift!==s).reduce((sum,x)=>sum+Number(x.regular_hours)+Number(x.overtime_hours),0);if(regular+overtime+other>24)throw Error('A soma das jornadas desta pessoa no dia excede 24 horas.');await save('wlp_attendance',{employee_id:id,reference_date:day,area:a,shift:s,regular_hours:regular,overtime_hours:overtime,notes:text(b.notes),...stamp,updated_at:new Date().toISOString()},'employee_id,reference_date,area,shift');}
 else if(b.action==='activity'){const a=area(b.area);if(['repack','despejo'].includes(a))throw Error('Repack e despejo são alimentados pelo cronômetro existente para evitar duplicação.');await save('wlp_activities',{employee_id:await employee(b.employee_id),reference_date:date(b.reference_date),area:a,quantity:num(b.quantity,0.001),duration_minutes:num(b.duration_minutes,0.001,1440),reference:required(b.reference,160),notes:text(b.notes),...stamp});}
 else if(b.action==='target'){await save('wlp_targets',{area:area(b.area),units_per_labor_hour:num(b.units_per_labor_hour,0.001),updated_by:u.id,updated_at:new Date().toISOString()},'area');}
 else if(b.action==='volume'){await save('wlp_daily_volume',{reference_date:date(b.reference_date),volume_hl:num(b.volume_hl),source_reference:required(b.source_reference,160),...stamp,updated_at:new Date().toISOString()},'reference_date');}
 else if(b.action==='action_create'){await save('wlp_actions',{reference_date:date(b.reference_date),area:area(b.area),cause:required(b.cause),action:required(b.description),owner:required(b.owner,160),due_date:date(b.due_date),...stamp});}
 else if(b.action==='action_status'){const status=text(b.status);if(!['open','in_progress','completed'].includes(status))throw Error('Status inválido.');const result=status==='completed'?required(b.result):text(b.result);const {data,error}=await db.from('wlp_actions').update({status,result}).eq('id',text(b.id,40)).select('id').maybeSingle();if(error)throw error;if(!data)throw Error('Ação não encontrada.');}
 else if(b.action==='simulation'){const inputs={area:area(b.area),overtime_hours:num(b.overtime_hours??0,0,13),volume:num(b.volume),target:num(b.target,0.001),hours:num(b.hours,0.001,24),days:num(b.days,1,7),availability:num(b.availability,0.001,1),headcount:num(b.headcount)};await save('wlp_simulations',{week_start:date(b.week_start),area:area(b.area),inputs,result:simulate(inputs),decision:required(b.decision),...stamp});}
 else if(b.action==='closure'){const day=date(b.reference_date),snap=await dashboard(day,day);await save('wlp_closures',{reference_date:day,shift:shift(b.shift),discussion:required(b.discussion),audience:required(b.audience,250),channel:required(b.channel,160),next_steps:required(b.next_steps),snapshot:{scope:'day',wlp:snap.wlp,areas:snap.areas,efd:snap.efd},...stamp});}
 else return reply({error:'Ação inválida.'},400);
 return reply({ok:true});
 }catch(e){console.error('productivity-api',e instanceof Error?e.message:'error');return reply({error:e instanceof Error&& !('code' in e)?e.message:'Não foi possível salvar ou consultar. Confira os dados e tente novamente.'},400)}
});

