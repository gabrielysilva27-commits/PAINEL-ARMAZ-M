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
-- Dias históricos usam universo, INNO e quantidades efetivas do arquivo original.
-- Indisponibilidade acompanha o OUT atual, inclusive no histórico.
-- Dias novos usam stock_oor_daily_detail e o cadastro mais recente anterior à data.
create or replace function public.stock_oor_indicator_unavailable()
returns table(reference_date date, unavailable_count bigint, unavailable_skus jsonb)
language sql stable security invoker set search_path = public as $$
select d.reference_date,
 count(*) filter (where d.status = 'OUT'
  and not (c.route_skus ? d.sku_code)
  and (h.reference_date is null or h.payload->'eligible_skus' ? d.sku_code)),
 coalesce(jsonb_agg(d.sku_code order by d.sku_code)
  filter (where d.status = 'OUT' and not (c.route_skus ? d.sku_code)
   and (h.reference_date is null or h.payload->'eligible_skus' ? d.sku_code)), '[]'::jsonb)
from public.stock_oor_daily_detail d
join lateral (
 select c.route_skus from public.stock_oor_indicator_configs c
 where c.reference_month <= d.reference_date
 order by c.reference_month desc limit 1
) c on true
left join public.stock_oor_indicator_history h using (reference_date)
group by d.reference_date;
$$;
revoke all on function public.stock_oor_indicator_unavailable() from public, anon, authenticated;
grant execute on function public.stock_oor_indicator_unavailable() to service_role;
