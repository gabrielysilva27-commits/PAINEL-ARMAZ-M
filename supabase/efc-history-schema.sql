-- Private saved Excel results for closed historical months.
create table if not exists public.efc_workbook_history (
 month text primary key check(month ~ '^2026-0[1-9]$'),
 source text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 imported_at timestamptz not null default now()
);
alter table public.efc_workbook_history enable row level security;
revoke all on public.efc_workbook_history from public,anon,authenticated;
grant select,insert,update,delete on public.efc_workbook_history to service_role;
