-- Complete report snapshots; unpublished batches cannot affect module results.
create table public.report_031120_imports (
 id uuid primary key default gen_random_uuid(), agent_node_id uuid not null references public.receiving_pull_agent_nodes(id),
 date_from date not null, date_to date not null, source_file text not null,
 headers jsonb not null, expected_rows integer not null check(expected_rows>0),
 status text not null default 'uploading' check(status in ('uploading','completed')),
 created_at timestamptz not null default now(), completed_at timestamptz,
 check(date_to>=date_from and date_to-date_from<=365)
);
create table public.report_031120_rows (
 import_id uuid not null references public.report_031120_imports(id) on delete cascade,
 row_no integer not null, reference_date date, vehicle text, map_number text,
 movement text, is_entrada_cdd boolean not null default false, raw_values jsonb not null,
 primary key(import_id,row_no)
);
create index report_031120_rows_day on public.report_031120_rows(reference_date,import_id);
alter table public.report_031120_imports enable row level security;
alter table public.report_031120_rows enable row level security;
revoke all on public.report_031120_imports,public.report_031120_rows from anon,authenticated;
grant all on public.report_031120_imports,public.report_031120_rows to service_role;
create view public.report_031120_current with (security_invoker=true) as
with latest as (
 select distinct on(r.reference_date) r.reference_date,i.id
 from public.report_031120_rows r join public.report_031120_imports i on i.id=r.import_id
 where i.status='completed' and r.reference_date is not null
 order by r.reference_date,i.created_at desc,i.id desc
)
select r.*,i.source_file,i.headers,i.completed_at from latest l
join public.report_031120_rows r on r.import_id=l.id and r.reference_date=l.reference_date
join public.report_031120_imports i on i.id=r.import_id;
revoke all on public.report_031120_current from anon,authenticated;
grant select on public.report_031120_current to service_role;
create function public.complete_report_031120(p_import_id uuid,p_node_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare imp public.report_031120_imports; total integer;
begin
 select * into imp from public.report_031120_imports where id=p_import_id and agent_node_id=p_node_id for update;
 if not found then raise exception 'Importação não encontrada'; end if;
 if imp.status='completed' then return jsonb_build_object('ok',true,'import_id',imp.id); end if;
 select count(*) into total from public.report_031120_rows where import_id=imp.id;
 if total<>imp.expected_rows then raise exception 'Carga incompleta: % de % linhas',total,imp.expected_rows; end if;
 if exists(select 1 from public.report_031120_rows where import_id=imp.id and reference_date is not null and (reference_date<imp.date_from or reference_date>imp.date_to)) then raise exception 'Data fora do período'; end if;
 update public.report_031120_imports set status='completed',completed_at=now() where id=imp.id;
 -- Keep the existing receiving indicators fed from the same shared report.
 insert into public.receiving_pull_daily(pull_date,truck_count,pallets_pulled,vehicle_counts,source_file,imported_at)
 with days as (select distinct reference_date from public.report_031120_rows where import_id=imp.id and reference_date is not null),
 trips as (select distinct reference_date,vehicle,map_number from public.report_031120_current where reference_date in(select reference_date from days) and is_entrada_cdd and vehicle=any(array['225','229','231','246','264','271','289','298','312']) and coalesce(map_number,'')<>''),
 vehicles as (select reference_date,vehicle,count(*) n from trips group by reference_date,vehicle),
 totals as (select reference_date,sum(n)::integer n,jsonb_object_agg(vehicle,n) counts from vehicles group by reference_date)
 select d.reference_date,coalesce(t.n,0),coalesce(t.n,0)*28,coalesce(t.counts,'{}'::jsonb),'agent_031120_shared_'||imp.source_file,now() from days d left join totals t using(reference_date)
 on conflict(pull_date) do update set truck_count=excluded.truck_count,pallets_pulled=excluded.pallets_pulled,vehicle_counts=excluded.vehicle_counts,source_file=excluded.source_file,imported_at=excluded.imported_at;
 return jsonb_build_object('ok',true,'import_id',imp.id,'rows',total);
end $$;
revoke all on function public.complete_report_031120(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_report_031120(uuid,uuid) to service_role;
