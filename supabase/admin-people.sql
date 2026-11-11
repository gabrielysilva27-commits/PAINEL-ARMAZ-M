-- ADM-only directory edits. Existing IDs, passwords, PINs and occurrence snapshots are preserved.
create table if not exists public.admin_people_audit (
 id bigint generated always as identity primary key,
 directory_group text not null,
 person_id uuid not null,
 actor_id uuid not null references public.app_users(id),
 old_record jsonb,
 new_record jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.admin_people_audit enable row level security;
revoke all on public.admin_people_audit from public,anon,authenticated;
grant select,insert on public.admin_people_audit to service_role;
grant usage,select on sequence public.admin_people_audit_id_seq to service_role;
create index if not exists admin_people_audit_person_idx on public.admin_people_audit(directory_group,person_id,created_at desc);

create or replace function public.admin_people_name_key(value text) returns text
 language sql immutable strict security invoker set search_path=public as $$
 select translate(upper(regexp_replace(trim(value),'\s+',' ','g')),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','AAAAAEEEEIIIIOOOOOUUUUC')
$$;
revoke all on function public.admin_people_name_key(text) from public,anon,authenticated;
grant execute on function public.admin_people_name_key(text) to service_role;

create or replace function public.admin_people_save(p_group text,p_id uuid,p_record jsonb,p_expected jsonb,p_actor uuid)
 returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 tab text; name_col text; fields text[]; session_tab text; session_col text;
 before_row jsonb; after_row jsonb; old_public jsonb; new_public jsonb;
 record jsonb:=p_record; cols text; vals text; assignments text; k text; duplicate boolean;
begin
 case p_group
  when 'employees' then tab:='bo_employee_directory';name_col:='employee_name';fields:=array['employee_name','job_title','shift','active','updated_at'];
  when 'conferencers' then tab:='bo_conferencers';name_col:='display_name';fields:=array['display_name','active','updated_at'];session_tab:='bo_conferencer_sessions';session_col:='conferencer_id';
  when 'forklift' then tab:='receiving_forklift_operators';name_col:='display_name';fields:=array['display_name','active','updated_at'];session_tab:='receiving_forklift_sessions';session_col:='operator_id';
  when 'gate' then tab:='receiving_gate_users';name_col:='display_name';fields:=array['display_name','active','updated_at'];session_tab:='receiving_gate_sessions';session_col:='gate_user_id';
  when 'repack' then tab:='repack_workers';name_col:='display_name';fields:=array['display_name','active','updated_at'];session_tab:='repack_worker_sessions';session_col:='worker_id';
  when 'productivity' then tab:='wlp_employees';name_col:='display_name';fields:=array['display_name','job_title','shift','area','active'];
  when 'panel' then tab:='app_users';name_col:='display_name';fields:=array['display_name','username','role','active','updated_at'];session_tab:='app_sessions';session_col:='user_id';
  else raise exception using errcode='22023',message='Grupo inválido.';
 end case;
 perform pg_advisory_xact_lock(hashtextextended('admin_people:'||tab,0));
 if not exists(select 1 from public.app_users where id=p_actor and active and role='admin') then
  raise exception using errcode='42501',message='Cadastro de pessoas restrito ao ADM.';
 end if;
 if jsonb_typeof(record)<>'object' then raise exception 'Cadastro inválido.';end if;
 if exists(select 1 from jsonb_object_keys(record) x where not(x=any(fields) or (p_group='panel' and p_id is null and x in ('password_salt','password_hash')))) then raise exception 'Campo não permitido.';end if;
 if length(trim(record->>name_col)) not between 2 and (case when p_group='productivity' then 160 else 120 end) or record->>name_col is null then raise exception 'Informe o nome completo.';end if;
 if jsonb_typeof(record->'active') is distinct from 'boolean' then raise exception 'Situação inválida.';end if;
 if p_group in ('employees','productivity') then
  if coalesce(length(trim(record->>'job_title')),0) not between 2 and 160 then raise exception 'Informe a função.';end if;
  if record->>'shift' is not null and record->>'shift' not in ('A','B','C') then raise exception 'Turno inválido.';end if;
 end if;
 if p_group='productivity' then
  if record->>'shift' is null or record->>'area' is null or record->>'area' not in ('picking','carregamento','descarga','retorno','repack','despejo','reforma','outras','emp_carregamento','manobra','cheio_b','conferencia','descarga_cheio','descarga_vazio') then raise exception 'Área ou turno inválido.';end if;
 end if;
 if p_group='panel' then
  if record->>'username' is null or record->>'username' !~ '^[A-Za-z0-9._-]{2,80}$' or record->>'role' is null or record->>'role' not in ('admin','viewer') then raise exception 'Usuário ou perfil inválido.';end if;
  if p_id=p_actor and (not (record->>'active')::boolean or record->>'role'<>'admin') then raise exception using errcode='42501',message='Você não pode inativar sua própria conta ou remover seu perfil ADM.';end if;
  if p_id is null and (coalesce(record->>'password_salt','')!~'^[A-Za-z0-9_-]{22}$' or coalesce(record->>'password_hash','')!~'^[A-Za-z0-9_-]{43}$') then raise exception 'Senha inicial inválida.';end if;
 end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into before_row using p_id;
  if before_row is null then raise exception 'Cadastro não encontrado.';end if;
  if p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception using errcode='40001',message='Recarregue o cadastro antes de salvar.';end if;
  foreach k in array fields loop
   if k='updated_at' then continue;end if;
   if not(p_expected ? k) or before_row->k is distinct from p_expected->k then raise exception using errcode='40001',message='O cadastro foi alterado por outra pessoa. Atualize a lista.';end if;
  end loop;
 end if;
 if p_group<>'panel' then
  execute format('select exists(select 1 from public.%I where public.admin_people_name_key(%I)=public.admin_people_name_key($1) and ($2 is null or id<>$2))',tab,name_col) into duplicate using record->>name_col,p_id;
  if duplicate then raise exception using errcode='23505',message='Esta pessoa já está cadastrada. Edite ou reative o cadastro existente.';end if;
 end if;
 if p_group='panel' then
  execute 'select exists(select 1 from public.app_users where lower(username)=lower($1) and ($2 is null or id<>$2))' into duplicate using record->>'username',p_id;
  if duplicate then raise exception using errcode='23505',message='Usuário já cadastrado.';end if;
 end if;
 if 'updated_at'=any(fields) then record:=record||jsonb_build_object('updated_at',now());end if;
 if p_id is null and p_group='productivity' then record:=record||jsonb_build_object('created_by',p_actor);end if;
 select string_agg(format('%I',key),',' order by key),string_agg(format('r.%I',key),',' order by key),string_agg(format('%I=r.%I',key,key),',' order by key)
 into cols,vals,assignments from jsonb_object_keys(record) key;
 if p_id is null then
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',tab,cols,vals,tab,tab) into after_row using record;
 else
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t.*)',tab,assignments,tab) into after_row using record,p_id;
 end if;
 select jsonb_object_agg(key,value) into old_public from jsonb_each(coalesce(before_row,'{}'::jsonb)) where key='id' or key=any(fields);
 select jsonb_object_agg(key,value) into new_public from jsonb_each(after_row) where key='id' or key=any(fields);
 if p_id is not null and session_tab is not null and (not (record->>'active')::boolean or (p_group='panel' and before_row->>'role' is distinct from after_row->>'role')) then
  execute format('delete from public.%I where %I=$1',session_tab,session_col) using p_id;
 end if;
 insert into public.admin_people_audit(directory_group,person_id,actor_id,old_record,new_record) values(p_group,(after_row->>'id')::uuid,p_actor,old_public,new_public);
 return new_public;
end $$;
revoke all on function public.admin_people_save(text,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_people_save(text,uuid,jsonb,jsonb,uuid) to service_role;
