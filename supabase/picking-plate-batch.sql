create or replace function public.picking_plate_products(p_codes text[])
returns table(code text,description text,packaging text,reference_date date)
language sql stable security invoker set search_path=public as $$
 with ocp as materialized (
 select distinct on (payload->>'product') payload->>'product' as code,raw_values->>20 as description,raw_values->>22 as packaging,reference_date
 from public.report_03023601_current
 where payload->>'product'=any(p_codes)
 order by payload->>'product',reference_date desc,completed_at desc,row_no desc
 )
 select * from ocp
 union all
 select sku_code,sku_name,packaging,null::date from public.product_catalog c
 where sku_code=any(p_codes) and not exists(select 1 from ocp o where o.code=c.sku_code)
$$;
revoke all on function public.picking_plate_products(text[]) from public,anon,authenticated;
grant execute on function public.picking_plate_products(text[]) to service_role;
