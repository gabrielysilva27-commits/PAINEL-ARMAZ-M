-- Preserve the pre-automation fields as reported daily totals, not per-map counts.
alter table public.blitz_pull_checks add column if not exists historical_trips_checked integer check(historical_trips_checked>=0);
lock table public.blitz_pull_checks in access exclusive mode;
alter table public.blitz_pull_checks disable trigger blitz_validate_trip;
with daily as (
 select reference_date,max((trip_correction_original->>'trips_checked')::integer)
 filter(where (trip_correction_original->>'trips_checked')::integer <= (trip_correction_original->>'trips_day')::integer) valid_count
 from public.blitz_pull_checks where trip_correction_original is not null group by reference_date
)
update public.blitz_pull_checks c set historical_trips_checked=case
 when c.reference_date='2026-11-10' and (c.trip_correction_original->>'trips_checked')::integer=4140 then d.valid_count
 else (c.trip_correction_original->>'trips_checked')::integer end
from daily d where c.reference_date=d.reference_date and c.trip_correction_original is not null and c.historical_trips_checked is null;
alter table public.blitz_pull_checks enable trigger blitz_validate_trip;
