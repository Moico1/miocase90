create table if not exists public.whatsapp_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_number text not null
    check (requested_number ~ '^\+[1-9][0-9]{7,14}$'),
  code_hash text,
  code_salt text,
  status text not null default 'pending'
    check (status in ('pending', 'code_issued', 'verified', 'expired', 'locked')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  code_issued_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (status = 'code_issued' and code_hash is not null and code_salt is not null)
    or (status <> 'code_issued' and code_hash is null and code_salt is null)
  ),
  check ((status = 'verified') = (verified_at is not null))
);

create index if not exists whatsapp_verifications_admin_queue_idx
  on public.whatsapp_verifications (status, created_at)
  where status in ('pending', 'code_issued');
create unique index if not exists whatsapp_verifications_one_active_per_user_idx
  on public.whatsapp_verifications (user_id)
  where status in ('pending', 'code_issued');

alter table public.whatsapp_verifications enable row level security;
revoke all on table public.whatsapp_verifications from public, anon, authenticated;

alter table public.profile_contacts
  add column if not exists whatsapp_verified boolean not null default false;

-- Los números previos no duplicados se consideran verificados; las solicitudes nuevas
-- no se vuelven a marcar al reejecutar esta migración.
update public.profile_contacts as contact
set whatsapp_verified = true
where contact.whatsapp is not null
  and not contact.whatsapp_verified
  and (
    select count(*)
    from public.profile_contacts as same_number
    where same_number.whatsapp = contact.whatsapp
  ) = 1
  and not exists (
    select 1
    from public.whatsapp_verifications as verification
    where verification.user_id = contact.user_id
  );

update public.profile_contacts
set show_whatsapp = false
where show_whatsapp
  and not whatsapp_verified;

alter table public.profile_contacts
  drop constraint if exists profile_contacts_show_whatsapp_verified_check;
alter table public.profile_contacts
  add constraint profile_contacts_show_whatsapp_verified_check
  check (not show_whatsapp or (whatsapp is not null and whatsapp_verified));

create unique index if not exists profile_contacts_verified_whatsapp_unique_idx
  on public.profile_contacts (whatsapp)
  where whatsapp_verified and whatsapp is not null;

revoke insert (whatsapp_verified), update (whatsapp_verified)
  on public.profile_contacts from public, anon, authenticated;
revoke insert, update on table public.profile_contacts from public, anon, authenticated;
revoke insert (user_id, whatsapp, show_whatsapp),
  update (whatsapp, show_whatsapp)
  on table public.profile_contacts from authenticated;
grant select on table public.profile_contacts to authenticated;

alter table public.moderation_actions
  drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions
  add constraint moderation_actions_action_check
  check (
    action in (
      'membership_verified',
      'membership_rejected',
      'listing_removed',
      'listing_restored',
      'report_reviewed',
      'report_dismissed',
      'social_report_reviewed',
      'social_report_dismissed',
      'social_content_hidden',
      'whatsapp_code_issued'
    )
  );

create or replace function public.request_whatsapp_verification(requested_number text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_verification public.whatsapp_verifications%rowtype;
  new_verification_id uuid;
begin
  if current_user_id is null then
    raise exception 'Inicia sesión para verificar tu WhatsApp';
  end if;
  if requested_number is null
    or requested_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Escribe un número internacional válido, por ejemplo +591 7XXXXXXX';
  end if;
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = current_user_id
      and profile.seller_status = 'approved'
  ) then
    raise exception 'Solo vendedores aprobados pueden verificar su WhatsApp';
  end if;
  if exists (
    select 1
    from public.profile_contacts as contact
    where contact.whatsapp = requested_number
      and contact.whatsapp_verified
      and contact.user_id <> current_user_id
  ) then
    raise exception 'Este número ya está verificado en otra cuenta';
  end if;
  if exists (
    select 1
    from public.profile_contacts as contact
    where contact.user_id = current_user_id
      and contact.whatsapp = requested_number
      and contact.whatsapp_verified
  ) then
    raise exception 'Este número ya está verificado en tu cuenta';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select verification.*
  into current_verification
  from public.whatsapp_verifications as verification
  where verification.user_id = current_user_id
    and verification.status in ('pending', 'code_issued')
  for update;

  if found
    and current_verification.status = 'pending'
    and current_verification.requested_number = requested_number
    and current_verification.expires_at > now() then
    return current_verification.id;
  end if;

  if found then
    update public.whatsapp_verifications as verification
    set status = 'expired',
        code_hash = null,
        code_salt = null,
        updated_at = now()
    where verification.id = current_verification.id;
  end if;

  update public.profile_contacts as contact
  set show_whatsapp = false
  where contact.user_id = current_user_id
    and contact.whatsapp is distinct from requested_number
    and contact.show_whatsapp;

  insert into public.whatsapp_verifications (
    user_id, requested_number, status, expires_at
  )
  values (
    current_user_id, requested_number, 'pending', now() + interval '24 hours'
  )
  returning id into new_verification_id;

  return new_verification_id;
end;
$$;

create or replace function public.admin_issue_whatsapp_code(target_verification_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := (select auth.uid());
  verification public.whatsapp_verifications%rowtype;
  random_bytes bytea;
  random_value integer;
  verification_code text;
  generated_salt text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  if current_admin_id is null or not (select public.is_admin()) then
    raise exception 'Solo administración puede generar códigos de WhatsApp';
  end if;

  select request.*
  into verification
  from public.whatsapp_verifications as request
  where request.id = target_verification_id
  for update;

  if not found or verification.status not in ('pending', 'code_issued')
    or verification.expires_at <= now() then
    raise exception 'La solicitud ya venció o no está disponible';
  end if;
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = verification.user_id
      and profile.seller_status = 'approved'
  ) then
    raise exception 'La cuenta ya no es de un vendedor aprobado';
  end if;

  loop
    random_bytes := extensions.gen_random_bytes(2);
    random_value := get_byte(random_bytes, 0) * 256 + get_byte(random_bytes, 1);
    exit when random_value < 60000;
  end loop;
  verification_code := lpad((random_value % 10000)::text, 4, '0');

  update public.whatsapp_verifications as request
  set   code_hash = encode(
    extensions.digest(convert_to(generated_salt || verification_code, 'UTF8'), 'sha256'),
        'hex'
      ),
  code_salt = generated_salt,
      status = 'code_issued',
      attempts = 0,
      code_issued_at = now(),
      expires_at = now() + interval '24 hours',
      updated_at = now()
  where request.id = verification.id;

  insert into public.moderation_actions (
    moderator_id,
    target_user_id,
    target_user_id_snapshot,
    action,
    note
  )
  values (
    current_admin_id,
    verification.user_id,
    verification.user_id,
    'whatsapp_code_issued',
    'Código de verificación de WhatsApp emitido.'
  );

  return verification_code;
end;
$$;

create or replace function public.verify_whatsapp_code(submitted_code text)
returns table (status text, attempts_remaining integer, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  verification public.whatsapp_verifications%rowtype;
  next_attempts smallint;
begin
  if current_user_id is null then
    raise exception 'Inicia sesión para verificar tu WhatsApp';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select request.*
  into verification
  from public.whatsapp_verifications as request
  where request.user_id = current_user_id
    and request.status in ('pending', 'code_issued')
  for update;

  if not found then
    return query select 'none'::text, 0, 'Solicita una verificación nueva.'::text;
    return;
  end if;

  if verification.status = 'pending' then
    return query select 'pending'::text, 5, 'Tu solicitud espera que administración genere un código.'::text;
    return;
  end if;

  if verification.expires_at <= now() then
    update public.whatsapp_verifications as request
    set status = 'expired',
        code_hash = null,
        code_salt = null,
        updated_at = now()
    where request.id = verification.id;
    return query select 'expired'::text, 0, 'El código venció. Solicita otro.'::text;
    return;
  end if;

  if submitted_code is not null
    and submitted_code ~ '^[0-9]{4}$'
    and verification.code_hash = encode(
      extensions.digest(convert_to(verification.code_salt || submitted_code, 'UTF8'), 'sha256'),
      'hex'
    ) then
    if exists (
      select 1
      from public.profile_contacts as contact
      where contact.whatsapp = verification.requested_number
        and contact.whatsapp_verified
        and contact.user_id <> current_user_id
    ) then
      return query select 'number_in_use'::text, 0, 'Este número ya está verificado en otra cuenta.'::text;
      return;
    end if;

    begin
      insert into public.profile_contacts (user_id, whatsapp, show_whatsapp, whatsapp_verified)
      values (current_user_id, verification.requested_number, false, true)
      on conflict (user_id) do update
      set whatsapp = excluded.whatsapp,
          show_whatsapp = false,
          whatsapp_verified = true;
    exception
      when unique_violation then
        return query select
          'number_in_use'::text,
          0,
          'Este número ya está verificado en otra cuenta.'::text;
        return;
    end;

    update public.whatsapp_verifications as request
    set status = 'verified',
        code_hash = null,
        code_salt = null,
        verified_at = now(),
        updated_at = now()
    where request.id = verification.id;

    return query select 'verified'::text, 5, 'Tu número de WhatsApp quedó verificado.'::text;
    return;
  end if;

  next_attempts := verification.attempts + 1;
  update public.whatsapp_verifications as request
  set attempts = next_attempts,
      status = case when next_attempts >= 5 then 'locked' else 'code_issued' end,
      code_hash = case when next_attempts >= 5 then null else request.code_hash end,
      code_salt = case when next_attempts >= 5 then null else request.code_salt end,
      updated_at = now()
  where request.id = verification.id;

  if next_attempts >= 5 then
    return query select 'locked'::text, 0, 'Se agotaron los intentos. Solicita un código nuevo.'::text;
  else
    return query select
      'code_issued'::text,
      (5 - next_attempts)::integer,
      format('Código incorrecto, te quedan %s intentos.', 5 - next_attempts);
  end if;
end;
$$;

create or replace function public.get_my_whatsapp_verification()
returns table (
  status text,
  requested_number text,
  attempts_remaining integer,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when request.status in ('pending', 'code_issued') and request.expires_at <= now()
        then 'expired'
      else request.status
    end,
    request.requested_number,
    case
      when request.status = 'code_issued' and request.expires_at > now()
        then (5 - request.attempts)::integer
      else 0
    end,
    request.expires_at
  from public.whatsapp_verifications as request
  where request.user_id = (select auth.uid())
  order by request.created_at desc, request.id desc
  limit 1;
$$;

create or replace function public.get_admin_whatsapp_verifications()
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  requested_number text,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Solo administración puede consultar verificaciones de WhatsApp';
  end if;

  return query
  select
    request.id,
    request.user_id,
    profile.display_name,
    request.requested_number,
    case
      when request.status = 'code_issued' and request.expires_at <= now()
        then 'expired'
      else request.status
    end,
    request.created_at,
    request.expires_at
  from public.whatsapp_verifications as request
  join public.profiles as profile on profile.id = request.user_id
  where request.status in ('pending', 'code_issued')
    and request.expires_at > now()
    and profile.seller_status = 'approved'
  order by request.created_at, request.id
  limit 100;
end;
$$;

create or replace function public.update_my_profile(
  target_display_name text,
  target_whatsapp text,
  target_show_whatsapp boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_name text := btrim(target_display_name);
  saved_whatsapp text;
  is_whatsapp_verified boolean;
begin
  if current_user_id is null then
    raise exception 'Inicia sesión antes de actualizar tu perfil';
  end if;
  if normalized_name is null or char_length(normalized_name) not between 2 and 60 then
    raise exception 'El nombre debe tener entre 2 y 60 caracteres';
  end if;
  if target_show_whatsapp is null then
    raise exception 'Elige si quieres mostrar tu WhatsApp';
  end if;

  select contact.whatsapp, contact.whatsapp_verified
  into saved_whatsapp, is_whatsapp_verified
  from public.profile_contacts as contact
  where contact.user_id = current_user_id;

  if target_whatsapp is distinct from saved_whatsapp then
    raise exception 'Para cambiar tu WhatsApp debes solicitar una verificación nueva';
  end if;
  if target_show_whatsapp and not coalesce(is_whatsapp_verified, false) then
    raise exception 'Verifica tu WhatsApp antes de mostrarlo en tus publicaciones';
  end if;

  update public.profiles as profile
  set display_name = normalized_name
  where profile.id = current_user_id;
  if not found then
    raise exception 'No se encontró tu perfil';
  end if;

  update public.profile_contacts as contact
  set show_whatsapp = target_show_whatsapp
  where contact.user_id = current_user_id
    and contact.whatsapp_verified
    and contact.whatsapp is not distinct from saved_whatsapp;
end;
$$;

create or replace function public.request_whatsapp_contact(target_listing_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  phone_number text;
  contact_count integer;
begin
  if current_user_id is null then
    raise exception 'Crea una cuenta o inicia sesión para contactar al vendedor';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select regexp_replace(contact.whatsapp, '[^0-9]', '', 'g')
  into phone_number
  from public.listings as listing
  join public.profiles as seller on seller.id = listing.seller_id
  join public.profile_contacts as contact on contact.user_id = seller.id
  where listing.id = target_listing_id
    and listing.status = 'active'
    and seller.seller_status = 'approved'
    and listing.seller_id <> current_user_id
    and contact.whatsapp is not null
    and contact.whatsapp_verified
    and contact.show_whatsapp;

  if phone_number is null then
    raise exception 'Este vendedor no tiene un WhatsApp verificado disponible';
  end if;

  select count(*)::integer
  into contact_count
  from public.contact_events as contact_event
  where contact_event.user_id = current_user_id
    and contact_event.contacted_at >= (
      pg_catalog.date_trunc('day', now() at time zone 'America/La_Paz')
      at time zone 'America/La_Paz'
    );

  if contact_count >= 30 then
    raise exception 'Alcanzaste el límite de 30 contactos por día';
  end if;

  insert into public.contact_events (user_id, listing_id)
  values (current_user_id, target_listing_id);

  return 'https://wa.me/' || phone_number;
end;
$$;

revoke all on function public.request_whatsapp_verification(text) from public, anon, authenticated;
revoke all on function public.admin_issue_whatsapp_code(uuid) from public, anon, authenticated;
revoke all on function public.verify_whatsapp_code(text) from public, anon, authenticated;
revoke all on function public.get_my_whatsapp_verification() from public, anon, authenticated;
revoke all on function public.get_admin_whatsapp_verifications() from public, anon, authenticated;
revoke all on function public.update_my_profile(text, text, boolean) from public, anon, authenticated;
revoke all on function public.request_whatsapp_contact(uuid) from public, anon, authenticated;

grant execute on function public.request_whatsapp_verification(text) to authenticated;
grant execute on function public.admin_issue_whatsapp_code(uuid) to authenticated;
grant execute on function public.verify_whatsapp_code(text) to authenticated;
grant execute on function public.get_my_whatsapp_verification() to authenticated;
grant execute on function public.get_admin_whatsapp_verifications() to authenticated;
grant execute on function public.update_my_profile(text, text, boolean) to authenticated;
grant execute on function public.request_whatsapp_contact(uuid) to authenticated;
