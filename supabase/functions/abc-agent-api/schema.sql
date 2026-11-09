create table if not exists public.abc_agent_monthly_runs (
  reference_month date primary key check (extract(day from reference_month)=1),
  status text not null default 'pending' check (status in ('pending','running','error','completed')),
  run_id uuid,
  node_id uuid references public.receiving_pull_agent_nodes(id),
  lease_expires_at timestamptz,
  stage text,
  details jsonb not null default '{}'::jsonb,
  result jsonb,
  last_error text,
  attempts integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.abc_agent_monthly_runs enable row level security;
revoke all on public.abc_agent_monthly_runs from public, anon, authenticated;
grant select,insert,update on public.abc_agent_monthly_runs to service_role;

create or replace function public.complete_abc_agent_month(
  p_month date,p_run_id uuid,p_node_id uuid,p_days integer,p_source text,p_items jsonb,p_result jsonb
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r public.abc_agent_monthly_runs; output jsonb;
begin
  select * into r from public.abc_agent_monthly_runs where reference_month=p_month for update;
  if not found or r.status<>'running' or r.run_id is distinct from p_run_id or r.node_id is distinct from p_node_id or r.lease_expires_at<=now() then
    raise exception 'ABC_LEASE_LOST';
  end if;
  if exists(select 1 from public.abc_months where reference_month=p_month and status='imported') then
    raise exception 'ABC_MONTH_ALREADY_IMPORTED';
  end if;
  output:=public.replace_abc_month_service(p_month,p_days,p_source,p_items);
  update public.abc_agent_monthly_runs set status='completed',stage='completed',result=p_result,
    last_error=null,completed_at=now(),lease_expires_at=null,updated_at=now() where reference_month=p_month;
  return output;
end;
$$;
revoke all on function public.complete_abc_agent_month(date,uuid,uuid,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_abc_agent_month(date,uuid,uuid,integer,text,jsonb,jsonb) to service_role;
