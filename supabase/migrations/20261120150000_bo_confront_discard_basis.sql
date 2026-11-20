create or replace function public.bo_save_confront_list(p_id uuid,p_counted_by uuid,p_sources jsonb,p_groups jsonb,p_resolved_by uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved bo_confront_lists; source jsonb; entry jsonb; item jsonb; assigned jsonb; current_row bo_occurrences; official bigint; qty numeric; repacked numeric; discarded numeric; unresolved boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtext('bo_confront_lists'));
 select * into saved from bo_confront_lists where id=p_id for update;
 if found then
  if saved.status='completed' then return jsonb_build_object('status','completed','id',p_id); end if;
  if p_resolved_by is null then return jsonb_build_object('status',saved.status,'id',p_id); end if;
  if saved.sources<>p_sources then raise exception 'A lista foi alterada. Atualize a tela.'; end if;
 else
  if p_resolved_by is not null then raise exception 'Lista inexistente'; end if;
  insert into bo_confront_lists(id,counted_by,sources,groups) values(p_id,p_counted_by,p_sources,p_groups);
  for source in select value from jsonb_array_elements(p_sources) order by (value->>'id')::bigint loop
   insert into bo_confront_list_sources(source_id,list_id) values((source->>'id')::bigint,p_id);
  end loop;
 end if;
 for source in select value from jsonb_array_elements(p_sources) order by (value->>'id')::bigint loop
  select * into current_row from bo_occurrences where id=(source->>'id')::bigint for update;
  if current_row.record_kind<>'turn_c_origin' or current_row.status='cancelled' or current_row.confront_state<>'awaiting' or current_row.updated_at<>(source->>'updated_at')::timestamptz then
   raise exception 'Um B.O. foi alterado ou confrontado. Atualize a lista.';
  end if;
  if (select jsonb_agg(to_jsonb(i) order by i.id) from bo_occurrence_items i where i.occurrence_id=current_row.id) <> (select jsonb_agg(value order by (value->>'id')::bigint) from jsonb_array_elements(source->'items')) then
   raise exception 'Os produtos de um B.O. foram alterados. Atualize a lista.';
  end if;
 end loop;
 for entry in select value from jsonb_array_elements(p_groups) loop
  if entry->>'quantity_basis' is distinct from 'discarded_qty' then raise exception 'Atualize a página para confrontar o TT Descarte.'; end if;
  if entry->'allocations'='null'::jsonb then unresolved:=true; end if;
 end loop;
 update bo_confront_lists set groups=p_groups where id=p_id;
 if unresolved then return jsonb_build_object('id',p_id,'status','pending'); end if;
 update bo_confront_lists set status='processing' where id=p_id;
 for source in select value from jsonb_array_elements(p_sources) loop
  insert into bo_occurrences(bo_number,conferencer_id,occurrence_date,occurrence_time,shift,movement_type,location,subject_type,factory_name,employee_name,employee_function,reason,responsibility,comments,interview_report,status,record_kind,source_occurrence_id)
  values('BO-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),p_counted_by,(source->>'occurrence_date')::date,(now() at time zone 'America/Sao_Paulo')::time,'A',source->>'movement_type',source->>'location',source->>'subject_type',source->>'factory_name',source->>'employee_name',source->>'employee_function',source->>'reason',source->>'responsibility',source->>'comments',source->>'interview_report','pending','turn_a_confront',(source->>'id')::bigint) returning id into official;
  for item in select value from jsonb_array_elements(source->'items') loop
   select allocation into assigned from jsonb_array_elements(p_groups) g cross join lateral jsonb_array_elements(g->'allocations') allocation where allocation->>'item_id'=item->>'id';
   if assigned is null then raise exception 'Distribuição incompleta'; end if;
   discarded:=(assigned->>'discarded')::numeric;
   qty:=(assigned->>'total')::numeric; repacked:=coalesce((assigned->>'repacked')::numeric,(item->>'repacked_qty')::numeric,0);
   if discarded is null or discarded<0 or discarded>1000000 or qty<=0 or qty>1000000 or repacked<0 or repacked+discarded>qty then raise exception 'Quantidade ou reembalagem inválida'; end if;
   insert into bo_occurrence_items(occurrence_id,line_no,sku_code,sku_name,total_qty,repacked_qty,discarded_qty,factor_hecto,factor_hecto_commercial,average_cost,invoice_number,lot_number,expiry_date)
   values(official,(item->>'line_no')::smallint,item->>'sku_code',item->>'sku_name',qty,repacked,discarded,(item->>'factor_hecto')::numeric,(item->>'factor_hecto_commercial')::numeric,(item->>'average_cost')::numeric,item->>'invoice_number',item->>'lot_number',(item->>'expiry_date')::date);
  end loop;
 end loop;
 update bo_confront_lists set status='completed',resolved_by=p_resolved_by,completed_at=now() where id=p_id;
 return jsonb_build_object('id',p_id,'status','completed');
end $$;
