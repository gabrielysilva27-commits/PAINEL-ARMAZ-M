create table if not exists public.efc_segmentation_night_cycles (
 reference_date date primary key check(reference_date >= date '2026-10-06' and reference_date < date '2027-01-01'),
 status text not null default 'waiting' check(status in ('waiting','completed')),
 email_id text references public.efc_segmentation_emails(id),
 completed_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.efc_segmentation_night_cycles enable row level security;
revoke all on public.efc_segmentation_night_cycles from public,anon,authenticated;
grant all on public.efc_segmentation_night_cycles to service_role;
