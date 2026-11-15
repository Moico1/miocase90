create type public.membership_status as enum ('pending', 'verified', 'rejected');
create type public.listing_status as enum ('active', 'sold', 'removed');

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
    check (
      display_name = btrim(display_name)
      and char_length(display_name) between 2 and 60
    ),
  role text not null default 'user'
    check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table public.community_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status public.membership_status not null default 'pending',
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'verified' and verified_at is not null)
    or (status <> 'verified' and verified_at is null)
  )
);

create table public.membership_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique
    check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  check (expires_at > created_at)
);

create table public.profile_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  whatsapp text,
  show_whatsapp boolean not null default false,
  check (not show_whatsapp or whatsapp is not null),
  check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$')
);

create table public.categories (
  id serial primary key,
  name text not null unique
    check (name = btrim(name) and char_length(name) between 1 and 60)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  category_id integer not null references public.categories(id) on delete restrict,
  title text not null
    check (
      title = btrim(title)
      and char_length(title) between 3 and 100
    ),
  description text
    check (description is null or char_length(description) <= 1000),
  price numeric(10, 2) not null check (price >= 0),
  currency text not null default 'BOB'
    check (currency in ('BOB', 'USD', 'ARS')),
  status public.listing_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  path text not null unique,
  position smallint not null check (position between 1 and 5),
  unique (listing_id, position),
  check (path <> '')
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null
    check (
      reason = btrim(reason)
      and char_length(reason) between 1 and 300
    ),
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (listing_id, reporter_id)
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_listing_id uuid references public.listings(id) on delete set null,
  action text not null
    check (
      action in (
        'membership_verified',
        'membership_rejected',
        'listing_removed',
        'listing_restored'
      )
    ),
  note text check (note is null or char_length(note) <= 500),
  check (target_user_id is not null or target_listing_id is not null),
  created_at timestamptz not null default now()
);

create index listings_feed_idx
  on public.listings (status, created_at desc, id desc);
create index listings_category_feed_idx
  on public.listings (category_id, status, created_at desc, id desc);
create index listings_category_price_filter_idx
  on public.listings (category_id, currency, status, price);
create index listings_price_filter_idx
  on public.listings (currency, status, price);
create index listings_search_idx
  on public.listings
  using gin (
    to_tsvector(
      'spanish'::regconfig,
      title || ' ' || coalesce(description, '')
    )
  );
create index reports_review_queue_idx
  on public.reports (status, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  if requested_name is null or char_length(requested_name) not between 2 and 60 then
    requested_name := 'Usuario';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, requested_name);

  insert into public.community_memberships (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_memberships
    where user_id = (select auth.uid())
      and status = 'verified'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function public.is_listing_seller_verified(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_verified())
    and exists (
      select 1
      from public.listings listing
      join public.community_memberships membership
        on membership.user_id = listing.seller_id
      where listing.id = target_listing_id
        and membership.status = 'verified'
    );
$$;

create or replace function public.create_membership_invite(
  invite_expires_at timestamptz default now() + interval '7 days'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_code text;
begin
  if not (select public.is_admin()) then
    raise exception 'Only administrators can create invitation codes';
  end if;

  if invite_expires_at is null
    or invite_expires_at <= now()
    or invite_expires_at > now() + interval '30 days' then
    raise exception 'Invitation expiry must be within the next 30 days';
  end if;

  invite_code := replace(gen_random_uuid()::text, '-', '');

  insert into public.membership_invites (code_hash, created_by, expires_at)
  values (
    encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex'),
    (select auth.uid()),
    invite_expires_at
  );

  return invite_code;
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
    raise exception 'Sign in before redeeming an invitation';
  end if;

  if invite_code is null or lower(btrim(invite_code)) !~ '^[0-9a-f]{32}$' then
    raise exception 'Invitation code is invalid or expired';
  end if;

  update public.membership_invites
  set redeemed_by = current_user_id,
      redeemed_at = now()
  where code_hash = encode(
      extensions.digest(
        convert_to(lower(btrim(invite_code)), 'UTF8'),
        'sha256'
      ),
      'hex'
    )
    and expires_at > now()
    and redeemed_at is null
  returning created_by into invite_creator;

  if invite_creator is null then
    raise exception 'Invitation code is invalid, expired, or already used';
  end if;

  update public.community_memberships
  set status = 'verified',
      verified_by = invite_creator,
      verified_at = now()
  where user_id = current_user_id
    and status = 'pending';

  if not found then
    raise exception 'Only pending memberships can be verified by invitation';
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.community_memberships enable row level security;
alter table public.membership_invites enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.categories enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

create policy "profiles_select_visible"
  on public.profiles for select to authenticated
  using (
    (select public.is_verified())
    or id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "memberships_select_self_or_admin"
  on public.community_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "memberships_update_admin"
  on public.community_memberships for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "invites_select_admin"
  on public.membership_invites for select to authenticated
  using ((select public.is_admin()));

create policy "contacts_select_visible"
  on public.profile_contacts for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (
      show_whatsapp
      and (select public.is_verified())
    )
  );

create policy "contacts_insert_self"
  on public.profile_contacts for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "contacts_update_self_or_admin"
  on public.profile_contacts for update to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
  )
  with check (
    user_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "categories_select_members"
  on public.categories for select to authenticated
  using (
    (select public.is_verified())
    or (select public.is_admin())
  );

create policy "listings_select_visible"
  on public.listings for select to authenticated
  using (
    seller_id = (select auth.uid())
    or (select public.is_admin())
    or (
      status <> 'removed'
      and (select public.is_verified())
      and public.is_listing_seller_verified(id)
    )
  );

create policy "listings_insert_verified"
  on public.listings for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and (select public.is_verified())
  );

create policy "listings_update_owner_or_admin"
  on public.listings for update to authenticated
  using (
    seller_id = (select auth.uid())
    or (select public.is_admin())
  )
  with check (
    seller_id = (select auth.uid())
    or (select public.is_admin())
  );

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
            listing.status <> 'removed'
            and (select public.is_verified())
          )
        )
    )
  );

create policy "listing_images_insert_owner"
  on public.listing_images for insert to authenticated
  with check (
    (select public.is_verified())
    and (storage.foldername(path))[1] = (select auth.uid())::text
    and (storage.foldername(path))[2] = listing_id::text
    and exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.seller_id = (select auth.uid())
        and listing.status = 'active'
    )
  );

create policy "listing_images_delete_owner_or_admin"
  on public.listing_images for delete to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.seller_id = (select auth.uid())
    )
  );

create policy "reports_insert_verified"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (select public.is_verified())
    and exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.seller_id <> (select auth.uid())
        and listing.status = 'active'
    )
  );

create policy "reports_select_reporter_or_admin"
  on public.reports for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "reports_update_admin"
  on public.reports for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "moderation_actions_select_admin"
  on public.moderation_actions for select to authenticated
  using ((select public.is_admin()));

create policy "moderation_actions_insert_admin"
  on public.moderation_actions for insert to authenticated
  with check (
    moderator_id = (select auth.uid())
    and (select public.is_admin())
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
  public.moderation_actions
from anon, authenticated;

grant select (id, display_name, created_at)
  on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select on public.community_memberships to authenticated;
grant update (status, verified_by, verified_at)
  on public.community_memberships to authenticated;

grant select on public.membership_invites to authenticated;

grant select on public.profile_contacts to authenticated;
grant insert (user_id, whatsapp, show_whatsapp)
  on public.profile_contacts to authenticated;
grant update (whatsapp, show_whatsapp)
  on public.profile_contacts to authenticated;

grant select on public.categories to authenticated;

grant select on public.listings to authenticated;
grant insert (seller_id, category_id, title, description, price, currency)
  on public.listings to authenticated;
grant update (category_id, title, description, price, currency, status)
  on public.listings to authenticated;

grant select, insert, delete on public.listing_images to authenticated;

grant select, insert on public.reports to authenticated;
grant update (status) on public.reports to authenticated;

grant select, insert on public.moderation_actions to authenticated;

revoke all on function public.is_verified() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_listing_seller_verified(uuid) from public, anon;
revoke all on function public.create_membership_invite(timestamptz) from public, anon;
revoke all on function public.redeem_membership_invite(text) from public, anon;
grant execute on function public.is_verified() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_listing_seller_verified(uuid) to authenticated;
grant execute on function public.create_membership_invite(timestamptz) to authenticated;
grant execute on function public.redeem_membership_invite(text) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'miocase-listing-photos',
  'miocase-listing-photos',
  false,
  524288,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "miocase_photos_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'miocase-listing-photos'
    and (
      (select public.is_admin())
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        (select public.is_verified())
        and exists (
          select 1
          from public.listing_images image
          join public.listings listing on listing.id = image.listing_id
          where image.path = name
            and listing.status <> 'removed'
        )
      )
    )
  );

create policy "miocase_photos_insert_owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'miocase-listing-photos'
    and (select public.is_verified())
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.listings listing
      where listing.id::text = (storage.foldername(name))[2]
        and listing.seller_id = (select auth.uid())
        and listing.status = 'active'
    )
  );

create policy "miocase_photos_delete_owner_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'miocase-listing-photos'
    and (
      (select public.is_admin())
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and exists (
          select 1
          from public.listings listing
          where listing.id::text = (storage.foldername(name))[2]
            and listing.seller_id = (select auth.uid())
        )
      )
    )
  );

-- Bootstrap only: after the founder creates an account, set their role from
-- the trusted Supabase SQL Editor. Never expose this operation to the app.
-- update public.profiles set role = 'admin' where id = '<founder-auth-user-uuid>';
