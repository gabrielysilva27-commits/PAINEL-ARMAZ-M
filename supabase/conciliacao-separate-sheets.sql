alter table public.stock_recount_batches add column if not exists source_sheet text;
-- Keep item IDs and every saved count; each worksheet gets an independent workflow.
do $$ declare b public.stock_recount_batches;sheet_name text;target uuid;first_sheet boolean;new_status text;begin
 for b in select * from public.stock_recount_batches where source_sheet is null for update loop
  first_sheet:=true;
  for sheet_name in select distinct source_sheet from public.stock_recount_items where batch_id=b.id order by 1 loop
   if first_sheet then
    target:=b.id;
    update public.stock_recount_batches set source_sheet=sheet_name,title=left(b.title,140)||' · '||sheet_name,source_hash=b.source_hash||':'||sheet_name,revision=revision+1,updated_at=now() where id=target;
    first_sheet:=false;
   else
    insert into public.stock_recount_batches(reference_date,title,source_filename,source_hash,source_sheet,status,created_by,created_at)
    values(b.reference_date,left(b.title,140)||' · '||sheet_name,b.source_filename,b.source_hash||':'||sheet_name,sheet_name,b.status,b.created_by,b.created_at) returning id into target;
    update public.stock_recount_events set batch_id=target where item_id in(select id from public.stock_recount_items where batch_id=b.id and source_sheet=sheet_name);
    update public.stock_recount_items set batch_id=target where batch_id=b.id and source_sheet=sheet_name;
   end if;
   if b.status in('open','submitted') then
    new_status:=case when exists(select 1 from public.stock_recount_items where batch_id=target and status<>'completed') then 'open' else 'submitted' end;
    update public.stock_recount_batches set status=new_status where id=target;
   end if;
   insert into public.stock_recount_events(batch_id,action,app_user_id,after_value)
   values(target,'separate_worksheet',b.created_by,jsonb_build_object('original_batch_id',b.id,'source_sheet',sheet_name));
  end loop;
 end loop;
end $$;
