create table public.efd_pcd_routes (
 reference_date date not null, vehicle text not null, plate text not null,
 route_name text, expected_arrival text, source_file text not null,
 updated_at timestamptz not null default now(),
 primary key(reference_date,vehicle,plate)
);
create table public.efd_phase_maps (
 map_id text primary key, vehicle text not null, plate text not null,
 reference_date date, arrival_at timestamp, physical_at timestamp,
 map_type text, fleet_type text, source_file text not null, updated_at timestamptz not null default now()
);
alter table public.efd_pcd_routes enable row level security;
alter table public.efd_phase_maps enable row level security;
revoke all on public.efd_pcd_routes,public.efd_phase_maps from anon,authenticated;
grant all on public.efd_pcd_routes,public.efd_phase_maps to service_role;
create or replace function public.efd_reconcile() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer;
begin
 insert into public.efd_maps(map_id,vehicle,plate,reference_date,arrival_at,physical_at,map_type,fleet_type,valid,validation_note,source_file,updated_at)
 select p.map_id,p.vehicle,p.plate,p.reference_date,p.arrival_at,p.physical_at,
 coalesce(nullif(p.map_type,''),'Rota'),coalesce(nullif(p.fleet_type,''),old.fleet_type,'PCD'),
 p.reference_date is not null and r.vehicle is not null and (coalesce(p.map_type,'') in ('','Rota')),
 case when p.reference_date is null then 'Sem fase Saída CDD no arquivo.'
 when coalesce(p.map_type,'') not in ('','Rota') then 'Mapa fora da operação de rota.'
 when r.vehicle is null then 'Sem correspondência de data, veículo e placa no PCD.' else null end,
 p.source_file,now()
 from public.efd_phase_maps p
 left join public.efd_pcd_routes r on r.reference_date=p.reference_date and r.vehicle=p.vehicle and r.plate=p.plate
 left join public.efd_maps old on old.map_id=p.map_id
 on conflict(map_id) do update set vehicle=excluded.vehicle,plate=excluded.plate,
 reference_date=excluded.reference_date,arrival_at=excluded.arrival_at,physical_at=excluded.physical_at,
 map_type=excluded.map_type,fleet_type=excluded.fleet_type,valid=excluded.valid,
 validation_note=excluded.validation_note,source_file=excluded.source_file,updated_at=now()
 where public.efd_maps.source_file like 'agent_031120_%' or
 (excluded.reference_date is not null and excluded.reference_date>='2026-03-01');
 get diagnostics affected=row_count;
 return affected;
end $$;
revoke all on function public.efd_reconcile() from public,anon,authenticated;
grant execute on function public.efd_reconcile() to service_role;
