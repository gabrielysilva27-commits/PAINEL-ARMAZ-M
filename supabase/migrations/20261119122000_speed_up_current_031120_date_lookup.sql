create or replace view public.report_031120_current with (security_invoker=true) as
with recursive days(d) as (
 select min(reference_date) from public.report_031120_rows
 union all select n.d from days cross join lateral (select reference_date as d from public.report_031120_rows where reference_date>days.d order by reference_date limit 1) n
)
select r.import_id,r.row_no,days.d as reference_date,r.vehicle,r.map_number,r.movement,r.is_entrada_cdd,r.raw_values,i.source_file,i.headers,i.completed_at
from days cross join lateral (
 select a.id,a.source_file,a.headers,a.completed_at from public.report_031120_imports a where a.status='completed' and exists(select 1 from public.report_031120_rows b where b.reference_date=days.d and b.import_id=a.id) order by a.created_at desc,a.id desc limit 1
) i join public.report_031120_rows r on r.import_id=i.id and r.reference_date=days.d;
