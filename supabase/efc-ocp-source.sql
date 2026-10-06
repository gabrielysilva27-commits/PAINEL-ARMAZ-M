create table public.efc_ocp_config(id integer primary key check(id=1),enabled boolean not null default true,backfill_through date,last_inventory_date date,last_inventory_at timestamptz,last_error text,last_scan_at timestamptz);
insert into public.efc_ocp_config(id,backfill_through) values(1,'2026-10-06');
create table public.efc_ocp_inventory(reference_date date primary key check(reference_date>='2026-10-01'),source_file text not null,signature text not null,map_from bigint not null,map_to bigint not null,rows jsonb not null check(jsonb_typeof(rows)='array'),updated_at timestamptz not null default now());
create table public.efc_ocp_imports(id uuid primary key,agent_node_id uuid references public.receiving_pull_agent_nodes(id),status text not null default 'staging' check(status in('staging','completed','failed')),headers jsonb not null check(jsonb_array_length(headers)=34),row_count integer not null check(row_count>0 and row_count<=200000),sha256 text not null,source_file text not null,map_from bigint not null,map_to bigint not null,maps jsonb not null default '[]',started_at timestamptz not null default now(),completed_at timestamptz,last_error text);
create table public.efc_ocp_chunks(import_id uuid references public.efc_ocp_imports(id) on delete cascade,chunk integer not null check(chunk>=0),rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=200),primary key(import_id,chunk));
create table public.efc_ocp_days(reference_date date primary key,status text not null check(status in('waiting','completed')),planned integer not null,matched integer not null,missing jsonb not null default '[]',completed_at timestamptz,updated_at timestamptz not null default now());
alter table public.efc_ocp_config enable row level security;
alter table public.efc_ocp_inventory enable row level security;
alter table public.efc_ocp_imports enable row level security;
alter table public.efc_ocp_chunks enable row level security;
alter table public.efc_ocp_days enable row level security;
revoke all on public.efc_ocp_config,public.efc_ocp_inventory,public.efc_ocp_imports,public.efc_ocp_chunks,public.efc_ocp_days from public,anon,authenticated;
grant all on public.efc_ocp_config,public.efc_ocp_inventory,public.efc_ocp_imports,public.efc_ocp_chunks,public.efc_ocp_days to service_role;
create function public.efc_ocp_finish(p_id uuid,p_node uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_import public.efc_ocp_imports;v_count bigint;v_maps jsonb;
begin
 select * into v_import from public.efc_ocp_imports where id=p_id and agent_node_id=p_node for update;
 if not found then raise exception 'Importação ausente';end if;
 if v_import.status='completed' then return v_import.maps;end if;
 if v_import.status<>'staging' then raise exception 'Importação encerrada';end if;
 select count(*),coalesce(jsonb_agg(distinct jsonb_build_object('map',r->>'map','plate',r->>'plate')),'[]'::jsonb) into v_count,v_maps from public.efc_ocp_chunks c cross join lateral jsonb_array_elements(c.rows) r where c.import_id=p_id;
 if v_count<>v_import.row_count then raise exception 'Importação incompleta';end if;
 if exists(select 1 from (select (r->>'row_no')::integer n from public.efc_ocp_chunks c cross join lateral jsonb_array_elements(c.rows) r where c.import_id=p_id) x group by n having count(*)<>1) then raise exception 'Linhas repetidas';end if;
 if exists(select 1 from public.efc_ocp_chunks c cross join lateral jsonb_array_elements(c.rows) r where c.import_id=p_id and ((r->>'row_no')::integer<1 or (r->>'row_no')::integer>v_import.row_count)) then raise exception 'Linha fora do intervalo';end if;
 update public.efc_ocp_imports set status='completed',maps=v_maps,completed_at=now() where id=p_id;
 return v_maps;
end $$;
revoke all on function public.efc_ocp_finish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.efc_ocp_finish(uuid,uuid) to service_role;
create view public.report_03023601_current with(security_invoker=true) as
with latest as(select distinct on(m->>'map') m->>'map' map,i.id,i.completed_at,i.headers,i.source_file from public.efc_ocp_imports i cross join lateral jsonb_array_elements(i.maps) m where i.status='completed' order by m->>'map',i.completed_at desc,i.id desc)
select l.map,(r->>'date')::date reference_date,(r->>'row_no')::integer row_no,r->>'plate' plate,l.headers,r->'raw_values' raw_values,r payload,l.source_file,l.completed_at from latest l join public.efc_ocp_chunks c on c.import_id=l.id cross join lateral jsonb_array_elements(c.rows) r where r->>'map'=l.map;
revoke all on public.report_03023601_current from public,anon,authenticated;
grant select on public.report_03023601_current to service_role;
