create table if not exists public.stock_snapshots (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 source_name text not null,
 as_of date not null,
 payload jsonb not null check (jsonb_typeof(payload->'rows')='array'),
 created_by uuid references public.app_users(id),
 previous_id uuid unique references public.stock_snapshots(id)
);
create index if not exists stock_snapshots_created_at_idx on public.stock_snapshots(created_at desc,id);
alter table public.stock_snapshots enable row level security;
revoke all on table public.stock_snapshots from anon,authenticated;
grant select,insert on table public.stock_snapshots to service_role;

create table if not exists public.stock_audit_log (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 snapshot_id uuid not null references public.stock_snapshots(id) on delete cascade,
 previous_snapshot_id uuid references public.stock_snapshots(id),
 user_id uuid references public.app_users(id),
 action text not null check (action in ('EDIT','BULK_EDIT','IMPORT')),
 changed_count integer not null default 0,
 changed_rows jsonb not null default '[]'::jsonb,
 note text
);
create index if not exists stock_audit_log_created_at_idx on public.stock_audit_log(created_at desc);
create index if not exists stock_audit_log_user_idx on public.stock_audit_log(user_id,created_at desc);
create index if not exists stock_audit_log_snapshot_idx on public.stock_audit_log(snapshot_id);
alter table public.stock_audit_log enable row level security;
revoke all on table public.stock_audit_log from anon,authenticated;
grant select,insert on table public.stock_audit_log to service_role;
