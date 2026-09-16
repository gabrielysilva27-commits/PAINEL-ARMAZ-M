create table if not exists public.stock_snapshots (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 source_name text not null,
 as_of date not null,
 payload jsonb not null check (jsonb_typeof(payload->'rows')='array'),
 created_by uuid,
 previous_id uuid unique references public.stock_snapshots(id)
);
create index if not exists stock_snapshots_created_at_idx on public.stock_snapshots(created_at desc,id);
alter table public.stock_snapshots enable row level security;
revoke all on table public.stock_snapshots from anon,authenticated;
grant select,insert on table public.stock_snapshots to service_role;
