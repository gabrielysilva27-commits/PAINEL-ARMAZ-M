create or replace view public.report_03023601_current with(security_invoker=true) as
with latest as materialized (
select distinct on(m->>'map') m->>'map' map,i.id,i.completed_at,i.headers,i.source_file
from public.efc_ocp_imports i cross join lateral jsonb_array_elements(i.maps) m
where i.status='completed' order by m->>'map',i.completed_at desc,i.id desc
), expanded as materialized (
select c.import_id,r as payload from public.efc_ocp_chunks c
cross join lateral jsonb_array_elements(c.rows) r
where c.import_id in (select id from latest)
)
select l.map,(e.payload->>'date')::date reference_date,(e.payload->>'row_no')::integer row_no,
e.payload->>'plate' plate,l.headers,e.payload->'raw_values' raw_values,e.payload,
l.source_file,l.completed_at from expanded e join latest l on e.import_id=l.id and e.payload->>'map'=l.map;
create or replace function public.efc_dashboard_sources(p_from date,p_before date,p_to date) returns jsonb language sql stable security invoker set search_path=public as $$
select jsonb_build_object(
'ocp',coalesce((select jsonb_agg(jsonb_build_object('payload',o.payload,'reference_date',o.reference_date,'source_file',o.source_file,'completed_at',o.completed_at) order by o.map,o.row_no) from public.report_03023601_current o where o.reference_date>=p_from and o.reference_date<p_to),'[]'::jsonb),
'shared',coalesce((select jsonb_agg(jsonb_build_object('reference_date',r.reference_date,'headers',r.headers,'raw_values',r.raw_values,'source_file',r.source_file,'completed_at',r.completed_at) order by r.reference_date,r.row_no) from public.report_031120_current r where r.reference_date>=p_before and r.reference_date<p_to),'[]'::jsonb)
); $$;
revoke all on function public.efc_dashboard_sources(date,date,date) from public,anon,authenticated;
grant execute on function public.efc_dashboard_sources(date,date,date) to service_role;