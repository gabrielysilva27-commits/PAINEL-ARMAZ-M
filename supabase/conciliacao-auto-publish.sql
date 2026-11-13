create or replace function public.stock_recount_write(p_action text,p_body jsonb,p_app_user uuid default null,p_conferencer uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare b public.stock_recount_batches;i public.stock_recount_items;old jsonb;u public.app_users;
 manager boolean:=false;row jsonb;ids uuid[];n integer;v text;key text;allowed text[];complete boolean;sheet_name text;batches jsonb:='[]';
begin
 if p_app_user is not null then
  select * into u from app_users where id=p_app_user and active;
  if not found then raise exception 'Acesso inválido.' using errcode='42501';end if;
  manager:=u.role='admin' or lower(split_part(translate(coalesce(nullif(u.display_name,''),u.username),'ÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç','AEIOUAEOAOCaeiouaeoaoc'),' ',1)) in('diego','joseph','jose');
 elsif p_conferencer is null or not exists(select 1 from bo_conferencers where id=p_conferencer and active) then raise exception 'Acesso inválido.' using errcode='42501';end if;
 if p_action='create' then
  if not manager then raise exception 'Somente Controle ou ADM.' using errcode='42501';end if;
  if jsonb_array_length(p_body->'items') not between 1 and 2000 then raise exception 'Lista de produtos inválida.';end if;
  for sheet_name in select distinct value->>'source_sheet' from jsonb_array_elements(p_body->'items') order by 1 loop
  insert into stock_recount_batches(reference_date,title,source_filename,source_hash,source_sheet,status,created_by)
  values((p_body->>'reference_date')::date,left(p_body->>'title',140)||' · '||sheet_name,p_body->>'filename',(p_body->>'source_hash')||':'||sheet_name,sheet_name,'open',p_app_user) returning * into b;
  for row in select * from jsonb_array_elements(p_body->'items') where value->>'source_sheet'=sheet_name loop
   insert into stock_recount_items(batch_id,source_sheet,source_row,sku_code,sku_name,unit_text,instruction,source_difference,source_frozen,source_recount,source_ok)
   values(b.id,row->>'source_sheet',(row->>'source_row')::integer,row->>'sku_code',row->>'sku_name',row->>'unit_text',row->>'instruction',row->>'source_difference',row->>'source_frozen',row->>'source_recount',(row->>'source_ok')::boolean);
  end loop;
  insert into stock_recount_events(batch_id,action,app_user_id,after_value) values(b.id,'create',p_app_user,jsonb_build_object('filename',b.source_filename,'sheet',sheet_name,'items',(select count(*) from stock_recount_items where batch_id=b.id)));
  batches:=batches||jsonb_build_array(to_jsonb(b));
  end loop;
  return batches;
 end if;
 select * into b from stock_recount_batches where id=(p_body->>'batch_id')::uuid for update;
 if not found then raise exception 'Recontagem não encontrada.';end if;
 if p_action='save_list' then
  if p_conferencer is null then raise exception 'Use o portal do conferente.' using errcode='42501';end if;
  if b.status<>'open' then raise exception 'Esta recontagem não está aberta.' using errcode='40001';end if;
  if coalesce(jsonb_array_length(p_body->'entries'),0) not between 1 and 2000 then raise exception 'Nenhuma contagem para salvar.';end if;
  if (select count(distinct value->>'item_id') from jsonb_array_elements(p_body->'entries'))<>jsonb_array_length(p_body->'entries') then raise exception 'Produto repetido na lista.';end if;
  for row in select * from jsonb_array_elements(p_body->'entries') loop
   perform public.stock_recount_write('save_item',row||jsonb_build_object('batch_id',b.id),null,p_conferencer);
  end loop;
  return jsonb_build_object('id',b.id,'saved_count',jsonb_array_length(p_body->'entries'));
 end if;
 if p_action='save_item' then
  if p_conferencer is null then raise exception 'Use o portal do conferente para contar.' using errcode='42501';end if;
  if b.status<>'open' then raise exception 'Esta recontagem não está aberta.' using errcode='40001';end if;
  select * into i from stock_recount_items where id=(p_body->>'item_id')::uuid and batch_id=b.id for update;
  if not found then raise exception 'Produto não encontrado.';end if;
  if i.revision is distinct from (p_body->>'revision')::integer or i.status='completed' then raise exception 'Este item foi alterado ou concluído. Atualize a lista.' using errcode='40001';end if;
  if i.counted_by is not null and i.counted_by<>p_conferencer then raise exception 'Outro conferente está contando este item.' using errcode='40001';end if;
  old:=to_jsonb(i);complete:=coalesce((p_body->>'complete')::boolean,false);
  allowed:=case lower(trim(i.instruction)) when 'tudo' then array['pallets','layers','boxes','units'] when 'l e cx' then array['layers','boxes'] when 'l e cx + un' then array['layers','boxes','units'] when 'un' then array['units'] when 'pallet' then array['pallets'] when 'palete' then array['pallets'] when 'pallet + un' then array['pallets','units'] when 'palete + un' then array['pallets','units'] else array[]::text[] end;
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
