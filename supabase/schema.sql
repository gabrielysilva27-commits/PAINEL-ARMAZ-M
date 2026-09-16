-- Painel Armazém
-- Estrutura inicial sem dados demonstrativos.

create extension if not exists "pgcrypto";

create type public.operation_area as enum ('recebimento', 'armazenagem', 'separacao', 'expedicao');
create type public.alert_severity as enum ('baixa', 'media', 'alta', 'critica');
create type public.alert_status as enum ('aberto', 'em_tratativa', 'resolvido');

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  total_positions integer not null check (total_positions > 0),
  created_at timestamptz not null default now()
);

create table public.daily_operations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  operation_date date not null default current_date,
  area public.operation_area not null,
  planned_quantity numeric(12,2) not null default 0 check (planned_quantity >= 0),
  completed_quantity numeric(12,2) not null default 0 check (completed_quantity >= 0),
  unit text not null default 'HL',
  updated_at timestamptz not null default now(),
  unique (warehouse_id, operation_date, area)
);

create table public.capacity_snapshots (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  occupied_positions integer not null check (occupied_positions >= 0),
  available_positions integer not null check (available_positions >= 0),
  captured_at timestamptz not null default now()
);

create table public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  title text not null,
  description text,
  area public.operation_area,
  severity public.alert_severity not null default 'media',
  status public.alert_status not null default 'aberto',
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.shift_staffing (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  shift_date date not null default current_date,
  shift_name text not null,
  area public.operation_area not null,
  active_collaborators integer not null default 0 check (active_collaborators >= 0),
  unique (warehouse_id, shift_date, shift_name, area)
);

create index daily_operations_lookup on public.daily_operations (warehouse_id, operation_date);
create index alerts_open_lookup on public.operational_alerts (warehouse_id, status, opened_at desc);
create index capacity_snapshots_warehouse_idx on public.capacity_snapshots (warehouse_id);

alter table public.warehouses enable row level security;
alter table public.daily_operations enable row level security;
alter table public.capacity_snapshots enable row level security;
alter table public.operational_alerts enable row level security;
alter table public.shift_staffing enable row level security;
