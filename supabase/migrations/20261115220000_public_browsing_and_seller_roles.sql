do $$
begin
  create type public.seller_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end;
$$;

alter table public.profiles
  add column if not exists account_role text not null default 'buyer'
    check (account_role in ('buyer', 'admin'));
alter table public.profiles
  add column if not exists seller_status public.seller_status;
alter table public.listings
  add column if not exists previous_price numeric(10, 2)
    check (previous_price is null or previous_price > price);

update public.profiles profile
set account_role = case when profile.role = 'admin' then 'admin' else 'buyer' end,
    seller_status = case
      when profile.role = 'admin' then 'approved'::public.seller_status
      when membership.status = 'verified' then 'approved'::public.seller_status
      when membership.status = 'pending' then 'pending'::public.seller_status
      when membership.status = 'rejected' then 'rejected'::public.seller_status
      else null
    end
from public.community_memberships membership
where membership.user_id = profile.id
  and profile.seller_status is null;

update public.profiles
set account_role = 'admin',
    seller_status = 'approved'
where role = 'admin';

create table if not exists public.listing_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.listing_ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.contact_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  contacted_at timestamptz not null default now()
);

create index if not exists contact_events_user_day_idx
  on public.contact_events (user_id, contacted_at desc);

create table if not exists public.app_settings (
  singleton boolean primary key default true check (singleton),
  require_account_to_contact boolean not null default true
);

insert into public.app_settings (singleton, require_account_to_contact)
values (true, true)
on conflict (singleton) do nothing;

alter table public.listing_favorites enable row level security;
alter table public.listing_ratings enable row level security;
alter table public.contact_events enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "listing_favorites_select_own" on public.listing_favorites;
create policy "listing_favorites_select_own"
  on public.listing_favorites for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "listing_favorites_insert_own" on public.listing_favorites;
create policy "listing_favorites_insert_own"
  on public.listing_favorites for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.status in ('active', 'sold')
        and public.is_listing_seller_verified(listing.id)
    )
  );

drop policy if exists "listing_favorites_delete_own" on public.listing_favorites;
create policy "listing_favorites_delete_own"
  on public.listing_favorites for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "listing_ratings_select_own" on public.listing_ratings;
create policy "listing_ratings_select_own"
  on public.listing_ratings for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "listing_ratings_insert_own" on public.listing_ratings;
create policy "listing_ratings_insert_own"
  on public.listing_ratings for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.seller_id <> (select auth.uid())
        and listing.status in ('active', 'sold')
        and public.is_listing_seller_verified(listing.id)
    )
  );

drop policy if exists "listing_ratings_update_own" on public.listing_ratings;
create policy "listing_ratings_update_own"
  on public.listing_ratings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.seller_id <> (select auth.uid())
        and listing.status in ('active', 'sold')
        and public.is_listing_seller_verified(listing.id)
    )
  );

revoke all on table
  public.profiles,
  public.community_memberships,
  public.membership_invites,
  public.profile_contacts,
  public.categories,
  public.listings,
  public.listing_images,
  public.reports,
  public.moderation_actions,
  public.listing_favorites,
  public.listing_ratings,
  public.contact_events,
  public.app_settings
from public, anon;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
  requested_account_type text;
begin
  requested_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  if requested_name is null or char_length(requested_name) not between 2 and 60 then
    requested_name := 'Usuario';
  end if;

  requested_account_type := new.raw_user_meta_data ->> 'account_type';

  insert into public.profiles (id, display_name, account_role, seller_status)
  values (
    new.id,
    requested_name,
    'buyer',
    case
      when requested_account_type = 'seller' then 'pending'::public.seller_status
      else null
    end
  );

  if requested_account_type = 'seller' then
    insert into public.community_memberships (user_id, status)
    values (new.id, 'pending');
  end if;

  return new;
end;
$$;

create or replace function public.is_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and (
        profile.role = 'admin'
        or profile.seller_status = 'approved'
      )
  );
$$;

create or replace function public.is_listing_seller_verified(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings listing
    join public.profiles seller on seller.id = listing.seller_id
    where listing.id = target_listing_id
      and seller.seller_status = 'approved'
  );
$$;

create or replace function public.moderate_membership(
  target_user_id uuid,
  target_status public.membership_status,
  moderator_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := (select auth.uid());
  changed_user_id uuid;
begin
  if current_admin_id is null or not (select public.is_admin()) then
    raise exception 'Solo un administrador puede revisar solicitudes de vendedor';
  end if;

  if target_status is null or target_status not in ('verified', 'rejected') then
    raise exception 'La decisión debe ser aprobar o rechazar';
  end if;

  update public.community_memberships membership
  set status = target_status,
      verified_by = case when target_status = 'verified' then current_admin_id else null end,
      verified_at = case when target_status = 'verified' then now() else null end
  where membership.user_id = target_user_id
    and membership.status = 'pending'
  returning membership.user_id into changed_user_id;

  if changed_user_id is null then
    raise exception 'La solicitud no existe o ya fue revisada';
  end if;

  update public.profiles
  set seller_status = case
    when target_status = 'verified' then 'approved'::public.seller_status
    else 'rejected'::public.seller_status
  end
  where id = target_user_id;

  insert into public.moderation_actions (
    moderator_id,
    target_user_id,
    target_user_id_snapshot,
    action,
    note
  )
  values (
    current_admin_id,
    target_user_id,
    target_user_id,
    case
      when target_status = 'verified' then 'membership_verified'
      else 'membership_rejected'
    end,
    left(nullif(btrim(moderator_note), ''), 500)
  );
end;
$$;

create or replace function public.redeem_membership_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_creator uuid;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Inicia sesión antes de canjear una invitación';
  end if;

  if invite_code is null or lower(btrim(invite_code)) !~ '^[0-9a-f]{32}$' then
    raise exception 'El código de invitación no es válido o venció';
  end if;

  update public.membership_invites
  set redeemed_by = current_user_id,
      redeemed_at = now()
  where code_hash = encode(
      extensions.digest(convert_to(lower(btrim(invite_code)), 'UTF8'), 'sha256'),
      'hex'
    )
    and expires_at > now()
    and redeemed_at is null
  returning created_by into invite_creator;

  if invite_creator is null then
    raise exception 'El código no es válido, venció o ya fue usado';
  end if;

  update public.community_memberships
  set status = 'verified',
      verified_by = invite_creator,
      verified_at = now()
  where user_id = current_user_id
    and status = 'pending';

  if not found then
    raise exception 'Solo una solicitud de vendedor pendiente puede usar este código';
  end if;

  update public.profiles
  set seller_status = 'approved'
  where id = current_user_id
    and seller_status = 'pending';
end;
$$;

create or replace function public.apply_for_seller()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_status public.seller_status;
begin
  if current_user_id is null then
    raise exception 'Inicia sesión para solicitar vender';
  end if;

  select seller_status
  into current_status
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception 'No se encontró tu perfil';
  end if;
  if current_status = 'approved' then
    raise exception 'Tu cuenta ya puede publicar productos';
  end if;
  if current_status = 'pending' then
    raise exception 'Tu solicitud de vendedor ya está pendiente';
  end if;

  update public.profiles
  set seller_status = 'pending'
  where id = current_user_id;

  insert into public.community_memberships (user_id, status, verified_by, verified_at)
  values (current_user_id, 'pending', null, null)
  on conflict (user_id) do update
  set status = 'pending',
      verified_by = null,
      verified_at = null;
end;
$$;

create or replace function public.get_public_categories()
returns table (id integer, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select category.id, category.name
  from public.categories category
  where exists (
    select 1
    from public.listings listing
    join public.profiles seller on seller.id = listing.seller_id
    where listing.category_id = category.id
      and listing.status in ('active', 'sold')
      and seller.seller_status = 'approved'
  )
  order by category.name;
$$;

drop function if exists public.search_active_listings(text, integer, timestamptz, uuid, integer);
create function public.search_active_listings(
  search_text text default null,
  category_filter integer default null,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 13,
  sort_order text default 'recent',
  cursor_price numeric default null
)
returns table (
  id uuid,
  title text,
  description text,
  price numeric,
  previous_price numeric,
  currency text,
  category_id integer,
  category_name text,
  created_at timestamptz,
  seller_name text,
  status public.listing_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if sort_order not in ('recent', 'cheapest') then
    raise exception 'El orden solicitado no es válido';
  end if;
  if search_text is not null and char_length(search_text) > 80 then
    raise exception 'La búsqueda no puede superar los 80 caracteres';
  end if;
  if page_size is null or page_size < 1 or page_size > 20 then
    raise exception 'La página debe contener entre 1 y 20 publicaciones';
  end if;

  return query
  select
    listing.id,
    listing.title,
    listing.description,
    listing.price,
    listing.previous_price,
    listing.currency,
    listing.category_id,
    category.name,
    listing.created_at,
    seller.display_name,
    listing.status
  from public.listings listing
  join public.categories category on category.id = listing.category_id
  join public.profiles seller on seller.id = listing.seller_id
  where listing.status in ('active', 'sold')
    and seller.seller_status = 'approved'
    and (category_filter is null or listing.category_id = category_filter)
    and (
      nullif(btrim(search_text), '') is null
      or to_tsvector(
        'spanish'::regconfig,
        listing.title || ' ' || coalesce(listing.description, '')
      ) @@ websearch_to_tsquery('spanish'::regconfig, btrim(search_text))
    )
    and (
      cursor_id is null
      or (
        sort_order = 'recent'
        and cursor_created_at is not null
        and (listing.created_at, listing.id) < (cursor_created_at, cursor_id)
      )
      or (
        sort_order = 'cheapest'
        and cursor_price is not null
        and (listing.price, listing.id) > (cursor_price, cursor_id)
      )
    )
  order by
    case when sort_order = 'cheapest' then listing.price end asc,
    case when sort_order = 'recent' then listing.created_at end desc,
    case when sort_order = 'cheapest' then listing.id end asc,
    case when sort_order = 'recent' then listing.id end desc
  limit page_size;
end;
$$;

create or replace function public.get_public_listing_detail(target_listing_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  price numeric,
  previous_price numeric,
  currency text,
  category_id integer,
  category_name text,
  created_at timestamptz,
  seller_name text,
  status public.listing_status,
  is_own_listing boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    listing.id,
    listing.title,
    listing.description,
    listing.price,
    listing.previous_price,
    listing.currency,
    listing.category_id,
    category.name,
    listing.created_at,
    seller.display_name,
    listing.status,
    listing.seller_id = (select auth.uid())
  from public.listings listing
  join public.categories category on category.id = listing.category_id
  join public.profiles seller on seller.id = listing.seller_id
  where listing.id = target_listing_id
    and listing.status in ('active', 'sold')
    and seller.seller_status = 'approved'
  limit 1;
$$;

create or replace function public.get_public_listing_images(target_listing_ids uuid[])
returns table (listing_id uuid, path text, "position" smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select image.listing_id, image.path, image.position
  from public.listing_images image
  join public.listings listing on listing.id = image.listing_id
  join public.profiles seller on seller.id = listing.seller_id
  where image.listing_id = any(target_listing_ids)
    and listing.status in ('active', 'sold')
    and seller.seller_status = 'approved'
    and split_part(image.path, '/', 1) = image.listing_id::text
  order by image.listing_id, image.position
  limit 100;
$$;

create or replace function public.can_read_public_listing_photo(target_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listing_images image
    join public.listings listing on listing.id = image.listing_id
    join public.profiles seller on seller.id = listing.seller_id
    where image.path = target_path
      and split_part(image.path, '/', 1) = image.listing_id::text
      and listing.status in ('active', 'sold')
      and seller.seller_status = 'approved'
  );
$$;

create or replace function public.get_public_contact_settings()
returns table (require_account_to_contact boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select setting.require_account_to_contact
  from public.app_settings setting
  where setting.singleton;
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
  from public.listings listing
  join public.profiles seller on seller.id = listing.seller_id
  join public.profile_contacts contact on contact.user_id = seller.id
  where listing.id = target_listing_id
    and listing.status = 'active'
    and seller.seller_status = 'approved'
    and listing.seller_id <> current_user_id
    and contact.whatsapp is not null
    and contact.show_whatsapp;

  if phone_number is null then
    raise exception 'Este vendedor no tiene un contacto disponible para esta publicación';
  end if;

  select count(*)::integer
  into contact_count
  from public.contact_events event
  where event.user_id = current_user_id
    and event.contacted_at >= (
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

create or replace function public.toggle_listing_favorite(
  target_listing_id uuid,
  should_favorite boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Inicia sesión para guardar favoritos';
  end if;
  if should_favorite is null then
    raise exception 'Indica si quieres guardar o quitar el favorito';
  end if;

  if should_favorite then
    if not exists (
      select 1
      from public.listings listing
      join public.profiles seller on seller.id = listing.seller_id
      where listing.id = target_listing_id
        and listing.status in ('active', 'sold')
        and seller.seller_status = 'approved'
    ) then
      raise exception 'La publicación no está disponible para guardar';
    end if;

    insert into public.listing_favorites (user_id, listing_id)
    values (current_user_id, target_listing_id)
    on conflict do nothing;
    return true;
  end if;

  delete from public.listing_favorites
  where user_id = current_user_id
    and listing_id = target_listing_id;
  return false;
end;
$$;

create or replace function public.publish_listing(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_verified()) then
    raise exception 'Solo vendedores aprobados pueden publicar productos';
  end if;

  update public.listings listing
  set status = 'active'
  where listing.id = target_listing_id
    and listing.seller_id = (select auth.uid())
    and listing.status = 'draft'
    and exists (
      select 1 from public.listing_images image
      where image.listing_id = listing.id
    )
    and not exists (
      select 1
      from public.listing_images image
      where image.listing_id = listing.id
        and not exists (
          select 1 from storage.objects object
          where object.bucket_id = 'miocase-listing-photos'
            and object.name = image.path
        )
    );

  if not found then
    raise exception 'La publicación no es tuya o le faltan fotos subidas';
  end if;
end;
$$;

create or replace function public.discard_incomplete_listing(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión antes de descartar un borrador';
  end if;

  delete from public.listings listing
  where listing.id = target_listing_id
    and listing.seller_id = (select auth.uid())
    and listing.status = 'draft'
    and not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'miocase-listing-photos'
        and (
          object.name like target_listing_id::text || '/%'
          or object.name like (select auth.uid())::text || '/' || target_listing_id::text || '/%'
        )
    );

  if not found then
    raise exception 'El borrador no es tuyo o todavía tiene fotos guardadas';
  end if;
end;
$$;

drop policy if exists "listings_select_visible" on public.listings;
create policy "listings_select_visible"
  on public.listings for select to authenticated
  using (
    seller_id = (select auth.uid())
    or (select public.is_admin())
    or (
      status in ('active', 'sold')
      and public.is_listing_seller_verified(id)
    )
  );

drop policy if exists "listings_insert_verified" on public.listings;
create policy "listings_insert_verified"
  on public.listings for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and (select public.is_verified())
    and status = 'draft'
  );

drop policy if exists "listing_images_select_visible" on public.listing_images;
create policy "listing_images_select_visible"
  on public.listing_images for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and (
          listing.seller_id = (select auth.uid())
          or (
            listing.status in ('active', 'sold')
            and public.is_listing_seller_verified(listing.id)
          )
        )
    )
  );

drop policy if exists "listing_images_insert_owner" on public.listing_images;
create policy "listing_images_insert_owner"
  on public.listing_images for insert to authenticated
  with check (
    (select public.is_verified())
    and split_part(path, '/', 1) = listing_id::text
    and exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.seller_id = (select auth.uid())
        and listing.status = 'draft'
    )
  );

drop policy if exists "reports_insert_verified" on public.reports;
create policy "reports_insert_verified"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.seller_id <> (select auth.uid())
        and listing.status = 'active'
        and public.is_listing_seller_verified(listing.id)
    )
  );

drop policy if exists "miocase_photos_select" on storage.objects;
drop policy if exists "miocase_public_photos_select" on storage.objects;
create policy "miocase_public_photos_select"
  on storage.objects for select to public
  using (
    bucket_id = 'miocase-listing-photos'
    and (
      exists (
        select public.can_read_public_listing_photo(name)
      )
      or (
        (select auth.uid()) is not null
        and (
          (select public.is_admin())
          or exists (
            select 1
            from public.listing_images image
            join public.listings listing on listing.id = image.listing_id
            where image.path = name
              and listing.seller_id = (select auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "miocase_photos_insert_owner" on storage.objects;
create policy "miocase_photos_insert_owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'miocase-listing-photos'
    and (select public.is_verified())
    and exists (
      select 1
      from public.listings listing
      join public.listing_images image on image.listing_id = listing.id
      where listing.id::text = split_part(name, '/', 1)
        and listing.seller_id = (select auth.uid())
        and listing.status = 'draft'
        and image.path = name
    )
  );

drop policy if exists "miocase_photos_delete_owner_or_admin" on storage.objects;
create policy "miocase_photos_delete_owner_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'miocase-listing-photos'
    and (
      (select public.is_admin())
      or exists (
        select 1
        from public.listings listing
        where listing.seller_id = (select auth.uid())
          and listing.id::text = split_part(name, '/', 1)
          and listing.status in ('draft', 'removed')
      )
      or exists (
        select 1
        from public.listings listing
        where listing.seller_id = (select auth.uid())
          and listing.id::text = split_part(name, '/', 2)
          and listing.status in ('draft', 'removed')
          and split_part(name, '/', 1) = (select auth.uid())::text
      )
    )
  );

revoke all on table
  public.listing_favorites,
  public.listing_ratings,
  public.contact_events,
  public.app_settings
from public, anon;
grant select, insert, delete on public.listing_favorites to authenticated;
grant select, insert, update on public.listing_ratings to authenticated;

revoke all on function public.is_verified() from public, anon;
revoke all on function public.is_listing_seller_verified(uuid) from public, anon;
grant execute on function public.is_verified() to authenticated;
grant execute on function public.is_listing_seller_verified(uuid) to authenticated;

revoke all on function public.get_public_categories() from public, anon, authenticated;
revoke all on function public.search_active_listings(
  text, integer, timestamptz, uuid, integer, text, numeric
) from public, anon, authenticated;
revoke all on function public.get_public_listing_detail(uuid) from public, anon, authenticated;
revoke all on function public.get_public_listing_images(uuid[]) from public, anon, authenticated;
revoke all on function public.can_read_public_listing_photo(text) from public, anon, authenticated;
revoke all on function public.get_public_contact_settings() from public, anon, authenticated;
revoke all on function public.request_whatsapp_contact(uuid) from public, anon, authenticated;
revoke all on function public.toggle_listing_favorite(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.apply_for_seller() from public, anon, authenticated;
revoke all on function public.redeem_membership_invite(text) from public, anon, authenticated;
revoke all on function public.moderate_membership(uuid, public.membership_status, text)
  from public, anon, authenticated;
revoke all on function public.publish_listing(uuid) from public, anon, authenticated;
revoke all on function public.discard_incomplete_listing(uuid) from public, anon, authenticated;

grant execute on function public.get_public_categories() to anon, authenticated;
grant execute on function public.search_active_listings(
  text, integer, timestamptz, uuid, integer, text, numeric
) to anon, authenticated;
grant execute on function public.get_public_listing_detail(uuid) to anon, authenticated;
grant execute on function public.get_public_listing_images(uuid[]) to anon, authenticated;
grant execute on function public.can_read_public_listing_photo(text) to anon, authenticated;
grant execute on function public.get_public_contact_settings() to anon, authenticated;
grant execute on function public.request_whatsapp_contact(uuid) to authenticated;
grant execute on function public.toggle_listing_favorite(uuid, boolean) to authenticated;
grant execute on function public.apply_for_seller() to authenticated;
grant execute on function public.redeem_membership_invite(text) to authenticated;
grant execute on function public.moderate_membership(uuid, public.membership_status, text)
  to authenticated;
grant execute on function public.publish_listing(uuid) to authenticated;
grant execute on function public.discard_incomplete_listing(uuid) to authenticated;

grant select on storage.objects to anon;
