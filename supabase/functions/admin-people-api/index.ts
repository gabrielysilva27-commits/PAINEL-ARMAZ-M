import {createClient} from 'jsr:@supabase/supabase-js@2.57.4';
import {GROUPS,AREAS,preparePerson,expectedPerson,publicPerson} from './people-core.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const headers={'Access-Control-Allow-Origin':'https://painel-armaz-m.gabrielysilva27.workers.dev','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-session-token','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const encode=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
async function user(req:Request){const t=req.headers.get('x-session-token');if(!t)return null;const hash=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))));const {data:s,error}=await db.from('app_sessions').select('user_id').eq('token_hash',hash).gt('expires_at',new Date().toISOString()).maybeSingle();if(error)throw error;if(!s)return null;const {data:u,error:e}=await db.from('app_users').select('id,role').eq('id',s.user_id).eq('active',true).maybeSingle();if(e)throw e;return u;}
async function initialPassword(value:unknown){if(typeof value!=='string'||value.length<8||value.length>200)throw Error('A senha inicial precisa ter entre 8 e 200 caracteres.');const bytes=crypto.getRandomValues(new Uint8Array(16)),salt=encode(bytes),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),'PBKDF2',false,['deriveBits']);return{password_salt:salt,password_hash:encode(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes,iterations:200000},key,256)))};}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return reply({ok:true});if(req.method!=='POST')return reply({error:'Método inválido.'},405);
 try{
  const u=await user(req);if(!u)return reply({error:'Sessão inválida ou expirada.'},401);if(u.role!=='admin')return reply({error:'Cadastro de pessoas restrito ao ADM.'},403);
  const b=await req.json(),group=String(b.group||''),g=Object.hasOwn(GROUPS,group)?GROUPS[group as keyof typeof GROUPS]:null;if(!g)return reply({error:'Grupo inválido.'},400);
  if(b.action==='list'){
   const rows:any[]=[];for(let start=0;start<10000;start+=500){const {data,error}=await db.from(g.table).select(['id',...g.fields].join(',')).order(g.name).order('id').range(start,start+499);if(error)throw error;rows.push(...data);if(data.length<500)return reply({people:rows.map(x=>publicPerson(group,x)),groups:Object.entries(GROUPS).map(([key,v])=>({key,label:v.label,name:v.name,fields:v.fields,description:v.description})),areas:AREAS,current_user_id:u.id});}throw Error('Lista muito grande. Contate o suporte.');
  }
  if(b.action!=='save')return reply({error:'Ação inválida.'},400);
  const id=String(b.id||''),record=preparePerson(group,b.person,id),expected=id?expectedPerson(group,b.expected):null;
  if(id&&Object.keys(expected||{}).length!==g.fields.length)throw Error('Recarregue o cadastro antes de salvar.');
  if(!id&&group==='panel')Object.assign(record,await initialPassword(b.initial_password));
  const {data,error}=await db.rpc('admin_people_save',{p_group:group,p_id:id||null,p_record:record,p_expected:expected,p_actor:u.id});
  if(error){if(error.code==='23505')return reply({error:'Esta pessoa já está cadastrada. Edite ou reative o cadastro existente.'},409);if(error.code==='40001')return reply({error:'Outra alteração foi salva. Atualize a lista e abra o cadastro novamente.'},409);if(error.code==='42501')return reply({error:error.message||'Sem autorização.'},403);throw error;}
  return reply({person:publicPerson(group,data),created:!id},id?200:201);
 }catch(e){const message=e instanceof Error?e.message:typeof (e as any)?.message==='string'?(e as any).message:'Não foi possível salvar o cadastro.';return reply({error:message},400);}
});
