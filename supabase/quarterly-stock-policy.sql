alter table public.stock_policy_versions
 add column if not exists oor_enabled boolean not null default true,
 add column if not exists oor_effective_start date,
 add column if not exists calculation_metadata jsonb not null default '{}'::jsonb;
comment on column public.stock_policy_versions.oor_effective_start is
 'Data mínima de aplicação ao OOR. Aprovações trimestrais nunca substituem datas históricas.';
