-- Registry used by receiving, including historical trailer 225. Receipt registry
-- also covers newly registered trailers and plate changes without reimporting CSV.
create or replace function public.efd_is_trailer(v text,p text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(nullif(ltrim(regexp_replace(coalesce(v,''),'[^0-9]','','g'),'0'),''),'0') in ('225','229','231','246','264','271','289','298','312')
 or regexp_replace(upper(coalesce(p,'')),'[^A-Z0-9]','','g') in ('KYI8259','LSN7312','LSZ9355','KZM9D84','LMZ4G31','RIX8E72','RKK8G53','TTZ5E13')
 or exists(select 1 from public.receiving_nri_receipts r where
 r.truck_number=coalesce(nullif(ltrim(regexp_replace(coalesce(v,''),'[^0-9]','','g'),'0'),''),'0')
 or (regexp_replace(upper(coalesce(p,'')),'[^A-Z0-9]','','g')<>'' and regexp_replace(upper(coalesce(r.plate,'')),'[^A-Z0-9]','','g')=regexp_replace(upper(coalesce(p,'')),'[^A-Z0-9]','','g')))
$$;
revoke all on function public.efd_is_trailer(text,text) from public,anon,authenticated;
grant execute on function public.efd_is_trailer(text,text) to service_role;
create or replace function public.efd_reconcile() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer;
begin
 insert into public.efd_maps(map_id,vehicle,plate,reference_date,arrival_at,physical_at,map_type,fleet_type,valid,validation_note,source_file,updated_at)
 select p.map_id,p.vehicle,p.plate,p.reference_date,p.arrival_at,p.physical_at,
 coalesce(nullif(p.map_type,''),'Rota'),coalesce(nullif(p.fleet_type,''),old.fleet_type,'PCD'),
 not public.efd_is_trailer(p.vehicle,p.plate) and p.reference_date is not null and (coalesce(p.map_type,'') in ('Rota','AS') or (coalesce(p.map_type,'')='' and r.vehicle is not null)),
 case when public.efd_is_trailer(p.vehicle,p.plate) then 'Carreta: fora da EFD de rota.'
 when p.reference_date is null then 'Sem fase Saída CDD no arquivo.'
 when coalesce(p.map_type,'') not in ('','Rota','AS') then 'Mapa fora da operação de rota.'
 when r.vehicle is null and p.map_type in ('Rota','AS') then 'Saída e tipo de mapa confirmados no 03.11.20; sem correspondência no PCD.'
 when r.vehicle is null then 'Tipo de mapa sem confirmação no PCD.' else null end,
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
 update public.efd_maps set valid=false,validation_note='Carreta: fora da EFD de rota.',updated_at=now() where public.efd_is_trailer(vehicle,plate) and (valid or validation_note is distinct from 'Carreta: fora da EFD de rota.');
 return affected;
end $$;
revoke all on function public.efd_reconcile() from public,anon,authenticated;
grant execute on function public.efd_reconcile() to service_role;

create or replace view public.efd_route_maps with (security_invoker=true) as
 select * from public.efd_maps where not public.efd_is_trailer(vehicle,plate);
revoke all on public.efd_route_maps from public,anon,authenticated;
grant select on public.efd_route_maps to service_role;
