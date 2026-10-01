-- Painel Armazém: dados de gestão acessíveis somente pela API autenticada.
begin;
alter table public.repack_legacy_adjustments enable row level security;
revoke all on public.repack_legacy_adjustments from anon, authenticated;
create table public.wlp_employees (
 id uuid primary key default gen_random_uuid(), display_name text not null check(length(trim(display_name)) between 2 and 160),
 job_title text not null default '', shift text check(shift in ('A','B','C')),
 area text not null, active boolean not null default true,
 repack_worker_id uuid unique references public.repack_workers(id),
 created_by uuid references public.app_users(id), created_at timestamptz not null default now()
);
create table public.wlp_attendance (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.wlp_employees(id),
 reference_date date not null, area text not null, shift text not null check(shift in ('A','B','C')),
 regular_hours numeric not null check(regular_hours between 0 and 24), overtime_hours numeric not null check(overtime_hours between 0 and 24),
 notes text not null default '', recorded_by uuid not null references public.app_users(id), updated_at timestamptz not null default now(),
 check(regular_hours+overtime_hours <= 24), unique(employee_id,reference_date,area,shift)
);
create table public.wlp_activities (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.wlp_employees(id),
 reference_date date not null, area text not null, quantity numeric not null check(quantity>0),
 duration_minutes numeric not null check(duration_minutes>0 and duration_minutes<=1440),
 reference text not null default '', notes text not null default '', recorded_by uuid not null references public.app_users(id), created_at timestamptz not null default now()
);
create table public.wlp_targets (
 area text primary key, units_per_labor_hour numeric not null check(units_per_labor_hour>0),
 updated_by uuid not null references public.app_users(id), updated_at timestamptz not null default now()
);
create table public.wlp_daily_volume (
 reference_date date primary key, volume_hl numeric not null check(volume_hl>=0),
 source_reference text not null check(length(trim(source_reference))>0), recorded_by uuid not null references public.app_users(id), updated_at timestamptz not null default now()
);
create table public.wlp_actions (
 id uuid primary key default gen_random_uuid(), reference_date date not null, area text not null, cause text not null, action text not null,
 owner text not null, due_date date not null, status text not null default 'open' check(status in ('open','in_progress','completed')),
 result text not null default '', recorded_by uuid not null references public.app_users(id), created_at timestamptz not null default now(),
 check(status<>'completed' or length(trim(result))>0)
);
create table public.wlp_closures (
 id uuid primary key default gen_random_uuid(), reference_date date not null, shift text not null check(shift in ('A','B','C')),
 discussion text not null, audience text not null, channel text not null, next_steps text not null,
 snapshot jsonb not null, recorded_by uuid not null references public.app_users(id), created_at timestamptz not null default now(), unique(reference_date,shift)
);
create table public.wlp_simulations (
 id uuid primary key default gen_random_uuid(), week_start date not null, area text not null,
 inputs jsonb not null, result jsonb not null, decision text not null,
 recorded_by uuid not null references public.app_users(id), created_at timestamptz not null default now()
);
create index on public.wlp_attendance(reference_date);
create index on public.wlp_activities(reference_date);
do $$ declare t text; begin
 foreach t in array array['wlp_employees','wlp_attendance','wlp_activities','wlp_targets','wlp_daily_volume','wlp_actions','wlp_closures','wlp_simulations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select, insert, update, delete on public.%I to service_role',t);
 end loop;
end $$;
insert into public.wlp_employees(display_name,area,repack_worker_id)
select display_name,'repack',id from public.repack_workers where active;
commit;
