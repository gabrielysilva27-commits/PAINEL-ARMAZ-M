create table public.efc_ocp_exceptions(reference_date date not null check(reference_date>='2026-10-01'),map bigint not null,mode text not null check(mode in ('ignore','map_only')),reason text not null,created_at timestamptz not null default now(),primary key(reference_date,map));
alter table public.efc_ocp_exceptions enable row level security;
revoke all on public.efc_ocp_exceptions from public,anon,authenticated;
grant all on public.efc_ocp_exceptions to service_role;
