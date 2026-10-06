create table if not exists public.efc_segmentation_emails (
 id text primary key check(id ~ '^[a-f0-9]{64}$'),
 reference_date date not null check(reference_date >= '2026-01-01' and reference_date < '2027-01-01'),
 received_at timestamptz not null,
 rows jsonb not null check(jsonb_typeof(rows)='array'),
 status text not null check(status in ('parsed','review')),
 issue text,
 agent_node_id uuid not null references public.receiving_pull_agent_nodes(id),
 updated_at timestamptz not null default now()
);
create index if not exists efc_segmentation_emails_date on public.efc_segmentation_emails(reference_date);
create table if not exists public.efc_segmentation_scans (
 agent_node_id uuid primary key references public.receiving_pull_agent_nodes(id),
 messages integer not null default 0, review integer not null default 0,
 errors integer not null default 0, last_error text,
 updated_at timestamptz not null default now()
);
alter table public.efc_segmentation_emails enable row level security;
alter table public.efc_segmentation_scans enable row level security;
revoke all on public.efc_segmentation_emails,public.efc_segmentation_scans from public,anon,authenticated;
grant all on public.efc_segmentation_emails,public.efc_segmentation_scans to service_role;
