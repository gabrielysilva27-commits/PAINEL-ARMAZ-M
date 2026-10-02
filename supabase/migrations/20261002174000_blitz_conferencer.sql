alter table public.blitz_pull_checks add column conferencer_id uuid references public.bo_conferencers(id);
create index blitz_pull_checks_conferencer_date on public.blitz_pull_checks(conferencer_id,reference_date);
