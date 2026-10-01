create table if not exists public.efc_archive (
 month text not null check(month ~ '^2026-(0[1-9]|1[0-2])$'),
 kind text not null check(kind in ('helpers','checkers','events','pcd','priority','errors','damages','special','capacity','items','demand','legacy_pay')),
 chunk integer not null check(chunk >= 0),source text not null,payload jsonb not null check(jsonb_typeof(payload)='array'),
 imported_at timestamptz not null default now(),primary key(month,kind,chunk));
create table if not exists public.efc_agent_events (
 id text primary key, reference_date date not null, payload jsonb not null, source_file text not null,
 updated_at timestamptz not null default now());
create index if not exists efc_agent_events_date on public.efc_agent_events(reference_date);
create table if not exists public.efc_adjustments (
 record_id text primary key, month text not null, kind text not null, patch jsonb not null,
 reason text not null, recorded_by uuid not null references public.app_users(id),updated_at timestamptz not null default now());
create table if not exists public.efc_adjustment_log (
 id bigint generated always as identity primary key,record_id text not null,month text not null,kind text not null,
 patch jsonb not null,reason text not null,recorded_by uuid not null references public.app_users(id),created_at timestamptz not null default now());
alter table public.efc_archive enable row level security;
alter table public.efc_agent_events enable row level security;
alter table public.efc_adjustments enable row level security;
alter table public.efc_adjustment_log enable row level security;
revoke all on public.efc_archive,public.efc_agent_events,public.efc_adjustments,public.efc_adjustment_log from anon,authenticated;
grant all on public.efc_archive,public.efc_agent_events,public.efc_adjustments,public.efc_adjustment_log to service_role;
grant usage,select on sequence public.efc_adjustment_log_id_seq to service_role;
create or replace function public.efc_save_adjustment(p_id text,p_month text,p_kind text,p_patch jsonb,p_reason text,p_user uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
 insert into efc_adjustments(record_id,month,kind,patch,reason,recorded_by) values(p_id,p_month,p_kind,p_patch,p_reason,p_user)
 on conflict(record_id) do update set patch=efc_adjustments.patch || excluded.patch,reason=excluded.reason,recorded_by=excluded.recorded_by,updated_at=now();
 insert into efc_adjustment_log(record_id,month,kind,patch,reason,recorded_by) values(p_id,p_month,p_kind,p_patch,p_reason,p_user);
end;
$$;
revoke all on function public.efc_save_adjustment(text,text,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.efc_save_adjustment(text,text,text,jsonb,text,uuid) to service_role;
