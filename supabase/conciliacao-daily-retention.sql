-- Conciliação é operacional apenas no dia de referência, pelo calendário de São Paulo.
-- Os filhos são apagados antes das listas para respeitar as chaves estrangeiras.
grant delete on public.stock_recount_events,public.stock_recount_items,public.stock_recount_batches to service_role;
create or replace function public.stock_recount_cleanup()
returns integer language plpgsql security invoker set search_path=public as $$
declare cutoff date := (now() at time zone 'America/Sao_Paulo')::date;
        ids uuid[]; removed integer;
begin
 select array_agg(id) into ids from stock_recount_batches where reference_date < cutoff;
 if ids is null then return 0; end if;
 delete from stock_recount_events where batch_id = any(ids);
 delete from stock_recount_items where batch_id = any(ids);
 delete from stock_recount_batches where id = any(ids);
 get diagnostics removed = row_count;
 return removed;
end $$;
revoke all on function public.stock_recount_cleanup() from public,anon,authenticated;
grant execute on function public.stock_recount_cleanup() to service_role;
-- De hora em hora, inclusive na virada; a API também chama a limpeza no primeiro acesso do dia.
select cron.schedule('stock-recount-daily-retention','0 * * * *','select public.stock_recount_cleanup()');
