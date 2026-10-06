alter table public.efc_ocp_config add column manual_request_id uuid, add column manual_until timestamptz, add column manual_claimed_at timestamptz;
