begin;
alter table public.stock_oor_agent_state enable row level security;
alter table public.abc_adherence_monthly_summary enable row level security;
alter table public.temperature_reading_adjustments enable row level security;
revoke all on table public.stock_oor_agent_state, public.abc_adherence_monthly_summary, public.temperature_reading_adjustments from public,anon,authenticated;
grant all on table public.stock_oor_agent_state, public.abc_adherence_monthly_summary, public.temperature_reading_adjustments to service_role;
revoke execute on function public.receiving_print_requires_completed(), public.bo_refresh_turn_c_confront_state(bigint), public.bo_sync_turn_c_confront_state() from public,anon,authenticated;
grant execute on function public.receiving_print_requires_completed(), public.bo_refresh_turn_c_confront_state(bigint), public.bo_sync_turn_c_confront_state() to service_role;
alter function public.enforce_abc_leader_as_a() set search_path = public, pg_temp;
commit;

begin;
create table if not exists public.app_login_throttle (
 key_hash text primary key, window_start timestamptz not null, attempts integer not null
);
alter table public.app_login_throttle enable row level security;
revoke all on public.app_login_throttle from public,anon,authenticated;
grant all on public.app_login_throttle to service_role;
create index if not exists app_login_throttle_window_idx on public.app_login_throttle(window_start);
create or replace function public.consume_login_attempt(p_key text) returns boolean
language plpgsql security definer set search_path = public,pg_temp as $$
declare rec public.app_login_throttle%rowtype; now_at timestamptz := clock_timestamp();
begin
 if p_key is null or p_key !~ '^[0-9a-f]{64}$' then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key,723910));
 delete from public.app_login_throttle where window_start < now_at - interval '24 hours';
 select * into rec from public.app_login_throttle where key_hash=p_key for update;
 if not found or rec.window_start <= now_at - interval '15 minutes' then
  insert into public.app_login_throttle values(p_key,now_at,1)
  on conflict(key_hash) do update set window_start=excluded.window_start,attempts=1;
  return true;
 end if;
 if rec.attempts >= 10 then return false; end if;
 update public.app_login_throttle set attempts=attempts+1 where key_hash=p_key;
 return true;
end $$;
revoke execute on function public.consume_login_attempt(text) from public,anon,authenticated;
grant execute on function public.consume_login_attempt(text) to service_role;
commit;

begin;
do $$begin
 if exists(select 1 from public.bo_conferencers where pin_admin_value is not null and (pin_hash is null or pin_hash not like 'pbkdf2-sha256$200000$%' or pin_salt is null)) then raise exception 'PIN hashes need migration before cleartext removal'; end if;
end$$;
update public.bo_conferencers set pin_admin_value=null where pin_admin_value is not null;
revoke all on public.abc_months,public.abc_items from public,anon,authenticated;
grant all on public.abc_months,public.abc_items to service_role;
commit;