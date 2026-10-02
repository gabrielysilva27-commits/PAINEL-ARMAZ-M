create table public.efc_night_cycles (
 reference_date date primary key,
 status text not null check(status in ('waiting','running','completed')),
 plans jsonb not null default '[]', events jsonb not null default '[]',
 source_file text, map_import_at timestamptz, report_import_at timestamptz,
 planned integer not null default 0, matched integer not null default 0,
 started_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.efc_night_cycles enable row level security;
revoke all on public.efc_night_cycles from anon,authenticated;
grant all on public.efc_night_cycles to service_role;
