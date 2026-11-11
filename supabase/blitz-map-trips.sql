-- One trip is an ENTRADA CDD/FAB date + map + plate, never just a plate.
alter table public.blitz_pull_checks add column if not exists map_number text;
alter table public.blitz_pull_checks add column if not exists trip_correction_original jsonb;
create table if not exists public.blitz_trip_correction_audit(
 id bigint generated always as identity primary key,
 check_key text not null, changed_at timestamptz not null default now(),
 before_value jsonb, after_value jsonb
);
alter table public.blitz_trip_correction_audit enable row level security;
revoke all on public.blitz_trip_correction_audit from public,anon,authenticated;
grant select,insert on public.blitz_trip_correction_audit to service_role;
grant usage,select on sequence public.blitz_trip_correction_audit_id_seq to service_role;

create or replace function public.blitz_source_trips(p_from date,p_to date)
returns table(reference_date date,vehicle text,map_number text,plate text)
language sql stable security invoker set search_path=public as $$
 select distinct r.reference_date,ltrim(r.vehicle,'0'),ltrim(trim(r.map_number),'0'),
 regexp_replace(upper(coalesce(nullif(trim(r.raw_values->>(array_position(array(select upper(trim(x)) from jsonb_array_elements_text(r.headers) x),'PLACA')-1)),''),
 case ltrim(r.vehicle,'0') when '229' then 'KYI8259' when '231' then 'LSN7312' when '246' then 'LSZ9355' when '264' then 'KZM9D84' when '271' then 'LMZ4G31' when '289' then 'RIX8E72' when '298' then 'RKK8G53' when '312' then 'TTZ5E13' end)), '[^A-Z0-9]','','g')
 from public.report_031120_current r
 where r.reference_date>=p_from and r.reference_date<p_to and r.is_entrada_cdd
 and ltrim(r.vehicle,'0') in ('229','231','246','264','271','289','298','312')
 and nullif(trim(r.map_number),'') is not null;
$$;
revoke all on function public.blitz_source_trips(date,date) from public,anon,authenticated;
grant execute on function public.blitz_source_trips(date,date) to service_role;

-- Keep every original value and loss item. Only infer a historical map when unique.
with candidates as (
 select c.check_key,count(t.map_number) n,min(t.map_number) map_number,min(t.plate) plate
 from public.blitz_pull_checks c left join public.blitz_source_trips(
  (select min(reference_date) from public.blitz_pull_checks),
  (select max(reference_date)+1 from public.blitz_pull_checks)
 ) t on t.reference_date=c.reference_date and t.vehicle=ltrim(trim(c.trailer),'0')
 group by c.check_key
), totals as (
 select reference_date,count(*) trips from public.blitz_source_trips(
  (select min(reference_date) from public.blitz_pull_checks),(select max(reference_date)+1 from public.blitz_pull_checks)
 ) group by reference_date
), fixed as (
 select c.check_key,to_jsonb(c) old_value,
 case when k.n=1 then k.map_number end map_number,
 case when k.n=1 then k.plate else c.plate end plate,
 t.trips::integer trips_day,case when k.n=1 then 1 end trips_checked
 from public.blitz_pull_checks c join candidates k using(check_key) left join totals t using(reference_date)
 where c.trip_correction_original is null
), updated as (
 update public.blitz_pull_checks c set map_number=f.map_number,plate=f.plate,
 trips_day=f.trips_day,trips_checked=f.trips_checked,trip_correction_original=f.old_value,updated_at=now()
 from fixed f where c.check_key=f.check_key
 returning c.check_key,f.old_value,to_jsonb(c) new_value
)
insert into public.blitz_trip_correction_audit(check_key,before_value,after_value)
select check_key,old_value,new_value-'trip_correction_original' from updated;

create index if not exists blitz_pull_checks_trip_idx on public.blitz_pull_checks(reference_date,map_number,plate);
create or replace function public.blitz_validate_trip()
returns trigger language plpgsql security invoker set search_path=public as $$
declare t record; total integer;
begin
 new.map_number:=ltrim(trim(new.map_number),'0');
 if nullif(new.map_number,'') is null then raise exception 'Selecione o mapa da viagem na base 03.11.20.' using errcode='23514'; end if;
 select * into t from public.blitz_source_trips(new.reference_date,new.reference_date+1) s
 where s.map_number=new.map_number and s.vehicle=ltrim(trim(new.trailer),'0')
 and (nullif(trim(new.plate),'') is null or s.plate=regexp_replace(upper(new.plate),'[^A-Z0-9]','','g'));
 if not found then raise exception 'Mapa, carreta e data não correspondem à base 03.11.20. Atualize a tela.' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('blitz-trip:'||new.reference_date||':'||t.map_number||':'||t.plate,0));
 if (tg_op='INSERT' or row(old.reference_date,old.map_number,old.plate) is distinct from row(new.reference_date,t.map_number,t.plate))
 and exists(select 1 from public.blitz_pull_checks c where c.check_key<>new.check_key and c.reference_date=new.reference_date and c.map_number=t.map_number and c.plate=t.plate)
 then raise exception 'Esta viagem já foi aferida. Edite o lançamento existente para acrescentar itens.' using errcode='23505'; end if;
 select count(*) into total from public.blitz_source_trips(new.reference_date,new.reference_date+1);
 new.trailer:=t.vehicle;new.plate:=t.plate;new.map_number:=t.map_number;
 new.trips_day:=total;new.trips_checked:=1;
 if new.packages_checked<0 then raise exception 'Quantidade de vasilhame inválida.' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function public.blitz_validate_trip() from public,anon,authenticated;
grant execute on function public.blitz_validate_trip() to service_role;
drop trigger if exists blitz_validate_trip on public.blitz_pull_checks;
create trigger blitz_validate_trip before insert or update on public.blitz_pull_checks for each row execute function public.blitz_validate_trip();

create or replace function public.blitz_audit_trip()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into public.blitz_trip_correction_audit(check_key,before_value,after_value)
 values(new.check_key,case when tg_op='UPDATE' then to_jsonb(old)-'trip_correction_original' end,to_jsonb(new)-'trip_correction_original');
 return new;
end $$;
revoke all on function public.blitz_audit_trip() from public,anon,authenticated;
grant execute on function public.blitz_audit_trip() to service_role;
drop trigger if exists blitz_audit_trip on public.blitz_pull_checks;
create trigger blitz_audit_trip after insert or update on public.blitz_pull_checks for each row execute function public.blitz_audit_trip();

-- Header and loss lines must commit together, including edits of historical entries.
create or replace function public.blitz_save_trip(p_check jsonb,p_losses jsonb,p_expected_updated_at timestamptz default null)
returns text language plpgsql security invoker set search_path=public as $$
declare c public.blitz_pull_checks; old_stamp timestamptz; item jsonb; exists_check boolean; previous_losses jsonb;
begin
 c:=jsonb_populate_record(null::public.blitz_pull_checks,p_check);
 select updated_at into old_stamp from public.blitz_pull_checks where check_key=c.check_key for update;
 exists_check:=found;
 if exists_check and (p_expected_updated_at is null or old_stamp is distinct from p_expected_updated_at) then
  raise exception 'Este lançamento foi alterado. Atualize a tela antes de editar.' using errcode='40001';
 end if;
 select coalesce(jsonb_agg(to_jsonb(l)),'[]') into previous_losses from public.blitz_pull_losses l where l.check_key=c.check_key;
 if exists_check then
  update public.blitz_pull_checks set reference_date=c.reference_date,check_time=c.check_time,trailer=c.trailer,plate=c.plate,map_number=c.map_number,
  driver=c.driver,checker=c.checker,packages_checked=c.packages_checked,notes=c.notes,updated_at=now() where check_key=c.check_key;
 else
  insert into public.blitz_pull_checks(check_key,reference_date,check_time,trailer,plate,map_number,driver,checker,packages_checked,notes,created_by,conferencer_id,updated_at)
  values(c.check_key,c.reference_date,c.check_time,c.trailer,c.plate,c.map_number,c.driver,c.checker,c.packages_checked,c.notes,c.created_by,c.conferencer_id,now());
 end if;
 delete from public.blitz_pull_losses where check_key=c.check_key;
 for item in select * from jsonb_array_elements(p_losses) loop
  if coalesce((item->>'quantity_units')::numeric,0)<=0 then raise exception 'Quantidade de perda inválida.' using errcode='23514'; end if;
  insert into public.blitz_pull_losses(loss_key,check_key,reference_date,invoice,factory,sku_code,sku_name,quantity_units,reason)
  values(gen_random_uuid()::text,c.check_key,c.reference_date,nullif(item->>'invoice',''),nullif(item->>'factory',''),nullif(item->>'sku_code',''),nullif(item->>'sku_name',''),(item->>'quantity_units')::numeric,nullif(item->>'reason',''));
 end loop;
 insert into public.blitz_trip_correction_audit(check_key,before_value,after_value)
 select c.check_key,jsonb_build_object('losses',previous_losses),jsonb_build_object('losses',coalesce(jsonb_agg(to_jsonb(l)),'[]'))
 from public.blitz_pull_losses l where l.check_key=c.check_key;
 return c.check_key;
end $$;
revoke all on function public.blitz_save_trip(jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.blitz_save_trip(jsonb,jsonb,timestamptz) to service_role;
