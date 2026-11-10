create or replace function public.picking_plate_products(p_codes text[])
returns table(code text,description text,packaging text,reference_date date)
language sql stable security invoker set search_path=public as $$
 select distinct on (payload->>'product') payload->>'product',raw_values->>20,raw_values->>22,reference_date
 from public.report_03023601_current
 where payload->>'product'=any(p_codes)
 order by payload->>'product',reference_date desc,completed_at desc,row_no desc
$$;
revoke all on function public.picking_plate_products(text[]) from public,anon,authenticated;
grant execute on function public.picking_plate_products(text[]) to service_role;
