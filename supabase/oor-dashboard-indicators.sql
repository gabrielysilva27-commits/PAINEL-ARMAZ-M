-- Cadastros mensais e histórico do dashboard das planilhas ORR.
-- Leitura somente pelo stock-api, após validação da sessão do painel.
create table if not exists public.stock_oor_indicator_configs (
  reference_month date primary key,
  capacity_qty numeric not null check (capacity_qty > 0),
  innovation_skus jsonb not null default '[]'::jsonb,
  route_skus jsonb not null default '[]'::jsonb,
  source text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.stock_oor_indicator_history (
  reference_date date primary key,
  payload jsonb not null,
  source text not null,
  updated_at timestamptz not null default now()
);
alter table public.stock_oor_indicator_configs enable row level security;
alter table public.stock_oor_indicator_history enable row level security;
revoke all on public.stock_oor_indicator_configs, public.stock_oor_indicator_history from anon, authenticated;
grant all on public.stock_oor_indicator_configs, public.stock_oor_indicator_history to service_role;
-- Ocupação = soma das quantidades disponíveis / capacidade em caixas.
-- Indisponibilidade = produtos OUT sem malha / produtos da base.
-- Inovação = produtos cadastrados INNO / produtos da base.
-- No acumulado, somar numeradores e denominadores dos dias com base.
-- Linhas vazias das fórmulas do Excel não entram no denominador.
-- Dias históricos usam flags e quantidades efetivas do arquivo original.
-- Dias novos usam stock_oor_daily_detail e o cadastro mais recente anterior à data.
