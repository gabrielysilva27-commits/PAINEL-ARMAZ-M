-- Operational identities keep their existing audit foreign keys and sessions.
alter table public.bo_conferencers add column if not exists master_app_user_id uuid references public.app_users(id);
alter table public.receiving_gate_users add column if not exists master_app_user_id uuid references public.app_users(id);
alter table public.receiving_forklift_operators add column if not exists master_app_user_id uuid references public.app_users(id);
create unique index if not exists bo_master_identity on public.bo_conferencers(master_app_user_id) where master_app_user_id is not null;
create unique index if not exists gate_master_identity on public.receiving_gate_users(master_app_user_id) where master_app_user_id is not null;
create unique index if not exists forklift_master_identity on public.receiving_forklift_operators(master_app_user_id) where master_app_user_id is not null;

create or replace function public.revoke_master_portal_sessions() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not new.active or new.role<>'admin' then
  delete from bo_conferencer_sessions where conferencer_id in (select id from bo_conferencers where master_app_user_id=new.id);
  delete from receiving_gate_sessions where gate_user_id in (select id from receiving_gate_users where master_app_user_id=new.id);
  delete from receiving_forklift_sessions where operator_id in (select id from receiving_forklift_operators where master_app_user_id=new.id);
 end if;
 return new;
end $$;
revoke all on function public.revoke_master_portal_sessions() from public,anon,authenticated;
drop trigger if exists revoke_master_portal_sessions on public.app_users;
create trigger revoke_master_portal_sessions after update of active,role on public.app_users for each row execute function public.revoke_master_portal_sessions();

-- Read only lookup; only the authenticated Edge Function's service role may call it.
create or replace function public.picking_plate_product(p_code text)
returns table(code text,description text,packaging text,reference_date date)
language sql stable security invoker set search_path=public
as $$
 select payload->>'product',raw_values->>20,raw_values->>22,reference_date
 from public.report_03023601_current
 where payload->>'product'=p_code and p_code ~ '^[0-9]{1,12}$'
 order by reference_date desc,completed_at desc,row_no desc limit 1
$$;
revoke all on function public.picking_plate_product(text) from public,anon,authenticated;
grant execute on function public.picking_plate_product(text) to service_role;
