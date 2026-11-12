create table if not exists public.stock_recount_batches(
 id uuid primary key default gen_random_uuid(),reference_date date not null,title text not null,
 source_filename text not null,source_hash text not null,
 status text not null default 'draft' check(status in('draft','open','submitted','closed')),
 revision integer not null default 0,created_by uuid not null references public.app_users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(reference_date,source_hash)
);
create table if not exists public.stock_recount_items(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.stock_recount_batches(id),
 source_sheet text not null,source_row integer not null,sku_code text not null,sku_name text not null,
 unit_text text,instruction text not null,source_difference text,source_frozen text,source_recount text,source_ok boolean,
 pallets integer check(pallets>=0),layers integer check(layers>=0),boxes integer check(boxes>=0),units integer check(units>=0),
 status text not null default 'pending' check(status in('pending','counting','completed')),
 revision integer not null default 0,round integer not null default 1,
 counted_by uuid references public.bo_conferencers(id),counted_at timestamptz,completed_at timestamptz,
 comments text,return_note text,unique(batch_id,source_sheet,source_row)
);
create table if not exists public.stock_recount_events(
 id bigint generated always as identity primary key,batch_id uuid not null references public.stock_recount_batches(id),
 item_id uuid references public.stock_recount_items(id),action text not null,
 app_user_id uuid references public.app_users(id),conferencer_id uuid references public.bo_conferencers(id),
 before_value jsonb,after_value jsonb,created_at timestamptz not null default now()
);
alter table public.stock_recount_batches enable row level security;
alter table public.stock_recount_items enable row level security;
alter table public.stock_recount_events enable row level security;
revoke all on public.stock_recount_batches,public.stock_recount_items,public.stock_recount_events from public,anon,authenticated;
grant select,insert,update on public.stock_recount_batches,public.stock_recount_items to service_role;
grant select,insert on public.stock_recount_events to service_role;
grant usage,select on sequence public.stock_recount_events_id_seq to service_role;
create index if not exists stock_recount_batch_date_idx on public.stock_recount_batches(reference_date desc);
create index if not exists stock_recount_item_batch_idx on public.stock_recount_items(batch_id,status);
create index if not exists stock_recount_event_batch_idx on public.stock_recount_events(batch_id,created_at);
create or replace view public.stock_recount_progress with(security_invoker=true) as
 select batch_id,count(*)::integer item_count,count(*) filter(where status='completed')::integer completed_count
 from public.stock_recount_items group by batch_id;
revoke all on public.stock_recount_progress from public,anon,authenticated;
grant select on public.stock_recount_progress to service_role;

create or replace function public.stock_recount_write(p_action text,p_body jsonb,p_app_user uuid default null,p_conferencer uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare b public.stock_recount_batches;i public.stock_recount_items;old jsonb;u public.app_users;
 manager boolean:=false;row jsonb;ids uuid[];n integer;v text;key text;allowed text[];complete boolean;
begin
 if p_app_user is not null then
  select * into u from app_users where id=p_app_user and active;
  if not found then raise exception 'Acesso inválido.' using errcode='42501';end if;
  manager:=u.role='admin' or lower(split_part(translate(coalesce(nullif(u.display_name,''),u.username),'ÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç','AEIOUAEOAOCaeiouaeoaoc'),' ',1)) in('diego','joseph','jose');
 elsif p_conferencer is null or not exists(select 1 from bo_conferencers where id=p_conferencer and active) then raise exception 'Acesso inválido.' using errcode='42501';end if;
 if p_action='create' then
  if not manager then raise exception 'Somente Controle ou ADM.' using errcode='42501';end if;
  if jsonb_array_length(p_body->'items') not between 1 and 2000 then raise exception 'Lista de produtos inválida.';end if;
  insert into stock_recount_batches(reference_date,title,source_filename,source_hash,created_by)
  values((p_body->>'reference_date')::date,p_body->>'title',p_body->>'filename',p_body->>'source_hash',p_app_user) returning * into b;
  for row in select * from jsonb_array_elements(p_body->'items') loop
   insert into stock_recount_items(batch_id,source_sheet,source_row,sku_code,sku_name,unit_text,instruction,source_difference,source_frozen,source_recount,source_ok)
   values(b.id,row->>'source_sheet',(row->>'source_row')::integer,row->>'sku_code',row->>'sku_name',row->>'unit_text',row->>'instruction',row->>'source_difference',row->>'source_frozen',row->>'source_recount',(row->>'source_ok')::boolean);
  end loop;
  insert into stock_recount_events(batch_id,action,app_user_id,after_value) values(b.id,'create',p_app_user,jsonb_build_object('filename',b.source_filename,'items',jsonb_array_length(p_body->'items')));
  return to_jsonb(b);
 end if;
 select * into b from stock_recount_batches where id=(p_body->>'batch_id')::uuid for update;
 if not found then raise exception 'Recontagem não encontrada.';end if;
 if p_action='save_item' then
  if p_conferencer is null then raise exception 'Use o portal do conferente para contar.' using errcode='42501';end if;
  if b.status<>'open' then raise exception 'Esta recontagem não está aberta.' using errcode='40001';end if;
  select * into i from stock_recount_items where id=(p_body->>'item_id')::uuid and batch_id=b.id for update;
  if not found then raise exception 'Produto não encontrado.';end if;
  if i.revision is distinct from (p_body->>'revision')::integer or i.status='completed' then raise exception 'Este item foi alterado ou concluído. Atualize a lista.' using errcode='40001';end if;
  if i.counted_by is not null and i.counted_by<>p_conferencer then raise exception 'Outro conferente está contando este item.' using errcode='40001';end if;
  old:=to_jsonb(i);complete:=coalesce((p_body->>'complete')::boolean,false);
  allowed:=case lower(trim(i.instruction)) when 'tudo' then array['pallets','layers','boxes','units'] when 'l e cx' then array['layers','boxes'] when 'l e cx + un' then array['layers','boxes','units'] when 'un' then array['units'] else array[]::text[] end;
  if cardinality(allowed)=0 then raise exception 'Instrução não suportada.';end if;
  for key in select unnest(array['pallets','layers','boxes','units']) loop
   v:=p_body->'counts'->>key;
   if key=any(allowed) then
    if complete and v is null then raise exception 'Informe todos os campos solicitados, inclusive zero.';end if;
    if v is not null and (v!~'^\d+$' or v::numeric>10000000) then raise exception 'Quantidade inválida.';end if;
   elsif v is not null then raise exception 'Campo não solicitado para este produto.';end if;
  end loop;
  update stock_recount_items set pallets=(p_body->'counts'->>'pallets')::integer,layers=(p_body->'counts'->>'layers')::integer,
  boxes=(p_body->'counts'->>'boxes')::integer,units=(p_body->'counts'->>'units')::integer,
  status=case when complete then 'completed' else 'counting' end,counted_by=p_conferencer,counted_at=now(),completed_at=case when complete then now() end,
  comments=left(p_body->>'comments',1000),revision=revision+1 where id=i.id returning * into i;
  if not exists(select 1 from stock_recount_items where batch_id=b.id and status<>'completed') then
   update stock_recount_batches set status='submitted',revision=revision+1,updated_at=now() where id=b.id;
  end if;
  insert into stock_recount_events(batch_id,item_id,action,conferencer_id,before_value,after_value)values(b.id,i.id,case when complete then 'complete_item' else 'save_item' end,p_conferencer,old,to_jsonb(i));
  return to_jsonb(i);
 end if;
 if not manager then raise exception 'Somente Controle ou ADM.' using errcode='42501';end if;
 if b.revision is distinct from (p_body->>'revision')::integer then raise exception 'A recontagem foi alterada. Atualize a tela.' using errcode='40001';end if;
 old:=to_jsonb(b);
 if p_action='publish' and b.status='draft' then
  update stock_recount_batches set status='open',revision=revision+1,updated_at=now() where id=b.id returning * into b;
 elsif p_action='close' and b.status='submitted' then
  update stock_recount_batches set status='closed',revision=revision+1,updated_at=now() where id=b.id returning * into b;
 elsif p_action='return_items' and b.status in('open','submitted') then
  if length(trim(coalesce(p_body->>'note','')))=0 then raise exception 'Informe o motivo da nova recontagem.';end if;
  ids:=array(select jsonb_array_elements_text(p_body->'item_ids')::uuid);
  if cardinality(ids)=0 then raise exception 'Selecione os produtos.';end if;
  if (select count(*) from stock_recount_items where batch_id=b.id and id=any(ids))<>cardinality(ids) then raise exception 'Produto fora desta recontagem.';end if;
  for i in select * from stock_recount_items where batch_id=b.id and id=any(ids) for update loop
   insert into stock_recount_events(batch_id,item_id,action,app_user_id,before_value,after_value)values(b.id,i.id,'return_item',p_app_user,to_jsonb(i),jsonb_build_object('note',p_body->>'note'));
   update stock_recount_items set pallets=null,layers=null,boxes=null,units=null,status='pending',counted_by=null,counted_at=null,completed_at=null,comments=null,return_note=left(p_body->>'note',1000),round=round+1,revision=revision+1 where id=i.id;
  end loop;
  update stock_recount_batches set status='open',revision=revision+1,updated_at=now() where id=b.id returning * into b;
 else raise exception 'Ação indisponível nesta etapa.' using errcode='40001';end if;
 insert into stock_recount_events(batch_id,action,app_user_id,before_value,after_value)values(b.id,p_action,p_app_user,old,to_jsonb(b));
 return to_jsonb(b);
end $$;
revoke all on function public.stock_recount_write(text,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.stock_recount_write(text,jsonb,uuid,uuid) to service_role;
