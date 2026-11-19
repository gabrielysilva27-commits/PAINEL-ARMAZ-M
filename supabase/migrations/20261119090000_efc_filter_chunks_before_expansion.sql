CREATE OR REPLACE FUNCTION public.efc_dashboard_sources_fast(p_from date, p_before date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
 SET work_mem TO '64MB'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
with latest as materialized (
 select distinct on (m.value->>'map') m.value->>'map' as map,i.id,i.source_file,i.completed_at
 from efc_ocp_imports i cross join lateral jsonb_array_elements(i.maps) m(value)
 where i.status='completed' order by m.value->>'map',i.completed_at desc,i.id desc
), eligible_chunks as materialized (
 select c.import_id,c.rows from efc_ocp_chunks c
 where c.reference_period && daterange(p_from,p_to,'[)') and c.import_id in(select id from latest)
), expanded as not materialized (
 select c.import_id,r.value as payload
 from eligible_chunks c cross join lateral jsonb_array_elements(c.rows) r(value)
 where (r.value->>'date')::date>=p_from and (r.value->>'date')::date<p_to
), days as materialized (
 select distinct r.reference_date,r.import_id from report_031120_rows r
 where r.reference_date>=p_before and r.reference_date<p_to
), latest_days as materialized (
 select distinct on(d.reference_date) d.reference_date,i.id
 from days d join report_031120_imports i on i.id=d.import_id
 where i.status='completed' order by d.reference_date,i.created_at desc,i.id desc
)
select json_build_object(
'ocp',coalesce((select json_agg(json_build_object('payload',e.payload,'reference_date',(e.payload->>'date')::date,'source_file',l.source_file,'completed_at',l.completed_at) order by l.map,(e.payload->>'row_no')::integer) from expanded e join latest l on l.id=e.import_id and l.map=e.payload->>'map'),'[]'::json),
'shared',coalesce((select json_agg(json_build_object('reference_date',r.reference_date,'headers',i.headers,'raw_values',r.raw_values,'source_file',i.source_file,'completed_at',i.completed_at) order by r.reference_date,r.row_no) from latest_days l join report_031120_rows r on r.import_id=l.id and r.reference_date=l.reference_date join report_031120_imports i on i.id=r.import_id),'[]'::json)
); $function$
;
