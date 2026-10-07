-- Preserve latest-import selection for every date while deduplicating
-- candidate import/date pairs before sorting the 031120 history.
create or replace view public.report_031120_current with (security_invoker=true) as
with candidates as materialized (
 select distinct reference_date,import_id
 from public.report_031120_rows where reference_date is not null
), latest as (
 select distinct on(c.reference_date) c.reference_date,i.id
 from candidates c join public.report_031120_imports i on i.id=c.import_id
 where i.status='completed'
 order by c.reference_date,i.created_at desc,i.id desc
)
select r.import_id,r.row_no,r.reference_date,r.vehicle,r.map_number,r.movement,
 r.is_entrada_cdd,r.raw_values,i.source_file,i.headers,i.completed_at
from latest l join public.report_031120_rows r on r.import_id=l.id and r.reference_date=l.reference_date
join public.report_031120_imports i on i.id=r.import_id;
-- Dashboard access continues through the already authenticated Edge APIs.
alter view public.blitz_pull_monthly_summary set (security_invoker=true);
alter view public.blitz_pull_monthly_summary_ext set (security_invoker=true);
