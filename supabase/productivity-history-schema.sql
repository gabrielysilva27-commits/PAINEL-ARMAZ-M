begin;
create table if not exists public.wlp_monthly_archive (
 reference_month date primary key check(extract(day from reference_month)=1),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 imported_at timestamptz not null default now()
);
alter table public.wlp_monthly_archive enable row level security;
revoke all on public.wlp_monthly_archive from public, anon, authenticated;
grant select,insert,update,delete on public.wlp_monthly_archive to service_role;
commit;
