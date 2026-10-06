-- As novas malhas não alteram indicadores anteriores a 06/10/2026.
create table if not exists public.stock_oor_weekly_routes (
 week_start date primary key,
 week_end date not null check (week_end = week_start + 6),
 route_skus jsonb not null check (jsonb_typeof(route_skus) = 'array'),
 source text not null,
 updated_at timestamptz not null default now(),
 check (extract(dow from week_start) = 0)
);
alter table public.stock_oor_weekly_routes enable row level security;
revoke all on public.stock_oor_weekly_routes from anon, authenticated;
grant all on public.stock_oor_weekly_routes to service_role;
