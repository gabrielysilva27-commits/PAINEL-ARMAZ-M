create table public.efc_agent_map_files (
 reference_date date primary key, source_file text not null, rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows) between 1 and 5000),
 agent_node_id uuid not null references public.receiving_pull_agent_nodes(id), updated_at timestamptz not null default now()
);
alter table public.efc_agent_map_files enable row level security;
revoke all on public.efc_agent_map_files from anon,authenticated;
grant all on public.efc_agent_map_files to service_role;
