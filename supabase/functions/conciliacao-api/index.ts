import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2.57.4';
import {validateItems,validateCount,countFields,norm} from './conciliacao-core.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const headers={'Access-Control-Allow-Origin':'https://painel-armaz-m.gabrielysilva27.workers.dev','Access-Control-Allow-Headers':'content-type,x-session-token,x-bo-token','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const fail=(message:string,status=400)=>Object.assign(new Error(message),{status});
async function hash(s:string){let b='';for(const n of new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))b+=String.fromCharCode(n);return btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
const manager=(u:any)=>u.role==='admin'||['diego','joseph','jose'].includes(norm(u.display_name||u.username).split(' ')[0]);
async function auth(req:Request){
 const conf=req.headers.has('x-bo-token'),token=req.headers.get(conf?'x-bo-token':'x-session-token');if(!token)return null;
 const {data:s,error}=await db.from(conf?'bo_conferencer_sessions':'app_sessions').select(conf?'conferencer_id':'user_id').eq('token_hash',await hash(token)).gt('expires_at',new Date().toISOString()).maybeSingle();if(error)throw error;if(!s)return null;
 const {data:u,error:e}=await db.from(conf?'bo_conferencers':'app_users').select(conf?'id,display_name,active':'id,display_name,username,role,active').eq('id',conf?s.conferencer_id:s.user_id).eq('active',true).maybeSingle();if(e)throw e;
 return u?{...u,is_conferencer:conf,can_manage:!conf&&manager(u)}:null;
}
const validId=(v:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const safeItem='id,batch_id,source_sheet,source_row,sku_code,sku_name,unit_text,instruction,pallets,layers,boxes,units,status,revision,round,counted_by,counted_at,completed_at,comments,return_note,conferencer:bo_conferencers(display_name)';
async function getBatch(id:string,user:any){const {data:b,error}=await db.from('stock_recount_batches').select('*').eq('id',id).eq('reference_date',today()).maybeSingle();if(error)throw error;if(!b||(!user.can_manage&&b.status==='draft'))throw fail('Recontagem não encontrada.',404);return b;}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 try{
  const user=await auth(req);if(!user)return json({error:'Sessão inválida ou expirada.'},401);if(!user.can_manage&&!user.is_conferencer)return json({error:'Acesso restrito ao Controle e ADM.'},403);
  const text=await req.text();if(text.length>5000000)throw fail('Arquivo muito grande.',413);const body=JSON.parse(text),action=String(body.action||'');
  const {error:cleanupError}=await db.rpc('stock_recount_cleanup');if(cleanupError)throw cleanupError;
  if(action==='list'){
   let q=db.from('stock_recount_batches').select('id,reference_date,title,source_filename,status,revision,created_at').eq('reference_date',today()).order('created_at',{ascending:false}).limit(100);
   if(!user.can_manage)q=q.neq('status','draft');const {data,error}=await q;if(error)throw error;
   const ids=(data||[]).map((b:any)=>b.id);let progress:any[]=[];if(ids.length){const {data:p,error:pe}=await db.from('stock_recount_progress').select('*').in('batch_id',ids);if(pe)throw pe;progress=p||[];}
   return json({can_manage:user.can_manage,conferencer_id:user.is_conferencer?user.id:null,batches:(data||[]).map((b:any)=>{const p=progress.find(x=>x.batch_id===b.id);return {...b,item_count:p?.item_count||0,completed_count:p?.completed_count||0};})});
  }
  if(action==='create'){
   if(!user.can_manage)throw fail('Somente Controle ou ADM.',403);
   const date=String(body.reference_date||'');if(date!==today())throw fail('A conciliação deve ser da data de hoje.');
   const items=validateItems(body.items),payload={items,reference_date:date,title:String(body.title||'Recontagem de estoque').trim().slice(0,160),filename:String(body.filename||'Recontagem.xlsx').slice(0,200),source_hash:await hash(JSON.stringify(items))};
   const {data,error}=await db.rpc('stock_recount_write',{p_action:'create',p_body:payload,p_app_user:user.id,p_conferencer:null});if(error)throw Object.assign(Error(error.code==='23505'?'Esta lista já foi importada nesta data. Abra a contagem existente.':error.message),{status:error.code==='23505'?409:400});return json({batches:data});
  }
  if(!validId(body.batch_id))throw fail('Recontagem inválida.');const batch=await getBatch(body.batch_id,user);
  if(action==='detail'){
   const items:any[]=[];for(let offset=0;;offset+=1000){const {data,error}=await db.from('stock_recount_items').select(safeItem+(user.can_manage?',source_difference,source_frozen,source_recount,source_ok':'')).eq('batch_id',batch.id).order('source_sheet').order('source_row').range(offset,offset+999);if(error)throw error;items.push(...(data||[]));if((data||[]).length<1000)break;}
   return json({batch,items,can_manage:user.can_manage,conferencer_id:user.is_conferencer?user.id:null});
  }
  const payload:any={batch_id:batch.id};
  if(action==='save_list'){
   if(!user.is_conferencer)throw fail('Conte pelo portal dos conferentes.',403);
   if(!Array.isArray(body.entries)||!body.entries.length||body.entries.length>2000)throw fail('Nenhuma contagem para salvar.');
   const ids=new Set();for(const e of body.entries){if(!validId(e.item_id)||!Number.isSafeInteger(e.revision)||ids.has(e.item_id))throw fail('Produto ou versão inválidos.');ids.add(e.item_id);}
   const rows:any[]=[];for(let offset=0;;offset+=1000){const {data,error}=await db.from('stock_recount_items').select('id,instruction').eq('batch_id',batch.id).order('id').range(offset,offset+999);if(error)throw error;rows.push(...(data||[]));if((data||[]).length<1000)break;}
   payload.entries=body.entries.map((e:any)=>{const item=rows.find(i=>i.id===e.item_id);if(!item)throw fail('Produto fora desta recontagem.');const counts=validateCount(e.counts||{},item.instruction,false);return{item_id:e.item_id,revision:e.revision,counts,complete:countFields(item.instruction).every(k=>counts[k]!=null),comments:String(e.comments||'').slice(0,1000)};});
  }else if(action==='save_item'){
   if(!user.is_conferencer)throw fail('Conte pelo portal dos conferentes.',403);
   if(!validId(body.item_id)||!Number.isSafeInteger(body.revision))throw fail('Produto ou versão inválidos.');
   const {data:item,error}=await db.from('stock_recount_items').select('instruction').eq('id',body.item_id).eq('batch_id',batch.id).maybeSingle();if(error)throw error;if(!item)throw fail('Produto não encontrado.',404);
   payload.item_id=body.item_id;payload.revision=body.revision;payload.complete=body.complete===true;payload.counts=validateCount(body.counts||{},item.instruction,payload.complete);payload.comments=String(body.comments||'').slice(0,1000);
  }else{
   if(!user.can_manage)throw fail('Somente Controle ou ADM.',403);if(!['publish','return_items','close'].includes(action))throw fail('Ação inválida.');
   if(!Number.isSafeInteger(body.revision))throw fail('Versão inválida.');payload.revision=body.revision;
   if(action==='return_items'){if(!Array.isArray(body.item_ids)||!body.item_ids.length||body.item_ids.length>2000||body.item_ids.some((id:any)=>!validId(id)))throw fail('Selecione os produtos.');payload.item_ids=[...new Set(body.item_ids)];payload.note=String(body.note||'').trim().slice(0,1000);if(!payload.note)throw fail('Informe a orientação para recontar.');}
  }
  const {data,error}=await db.rpc('stock_recount_write',{p_action:action,p_body:payload,p_app_user:user.is_conferencer?null:user.id,p_conferencer:user.is_conferencer?user.id:null});
  if(error)throw Object.assign(Error(error.message),{status:error.code==='42501'?403:['40001','23505'].includes(error.code)?409:400});return json({ok:true,result:{id:data.id,status:data.status,revision:data.revision}});
 }catch(e){const error=e as any;console.error(error);return json({error:error.message||'Não foi possível concluir.'},error.status||400);}
});
