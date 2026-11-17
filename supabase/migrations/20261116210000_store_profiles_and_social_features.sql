create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 2 and 80),
  logo_path text,
  description text check (description is null or char_length(description) <= 300),
  neighborhood text not null
    check (neighborhood = btrim(neighborhood) and char_length(neighborhood) between 2 and 80),
  opening_hours text check (opening_hours is null or char_length(opening_hours) <= 120),
  social_url text check (
    social_url is null or (social_url ~ '^https://[^[:space:]]+$' and char_length(social_url) <= 500)
  ),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, reviewer_id)
);

create table if not exists public.listing_comments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.listing_comments(id) on delete cascade,
  body text not null check (body = btrim(body) and char_length(body) between 1 and 800),
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('store', 'review', 'comment')),
  target_id uuid not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (
    reason = btrim(reason) and char_length(reason) between 1 and 300
  ),
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);

create index if not exists stores_visible_created_idx
  on public.stores (is_visible, created_at desc, id);
create index if not exists store_reviews_visible_idx
  on public.store_reviews (store_id, is_visible, created_at desc);
create index if not exists listing_comments_visible_idx
  on public.listing_comments (listing_id, is_visible, created_at, id);
create index if not exists listing_comments_author_hour_idx
  on public.listing_comments (author_id, created_at desc);
create index if not exists follows_store_idx
  on public.follows (store_id, created_at desc);
create index if not exists content_reports_queue_idx
  on public.content_reports (status, created_at);

alter table public.stores enable row level security;
alter table public.store_reviews enable row level security;
alter table public.listing_comments enable row level security;
alter table public.follows enable row level security;
alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;

revoke all on table
  public.stores,
  public.store_reviews,
  public.listing_comments,
  public.follows,
  public.user_blocks,
  public.content_reports
from public, anon, authenticated;

alter table public.moderation_actions
  add column if not exists target_store_id_snapshot uuid;
alter table public.moderation_actions
  add column if not exists target_store_review_id_snapshot uuid;
alter table public.moderation_actions
  add column if not exists target_comment_id_snapshot uuid;
alter table public.moderation_actions
  add column if not exists target_content_report_id_snapshot uuid;

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
      'social_content_hidden'
    )
  );
alter table public.moderation_actions
  drop constraint if exists moderation_actions_check;
alter table public.moderation_actions
  add constraint moderation_actions_check
  check (
    target_user_id is not null
    or target_listing_id is not null
    or target_store_id_snapshot is not null
    or target_store_review_id_snapshot is not null
    or target_comment_id_snapshot is not null
    or target_content_report_id_snapshot is not null
  );

drop policy if exists "reports_insert_verified" on public.reports;
drop policy if exists "reports_insert_account" on public.reports;
create policy "reports_insert_account"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1
      from public.listings as target_listing
      where target_listing.id = listing_id
        and target_listing.seller_id <> (select auth.uid())
        and target_listing.status = 'active'
        and public.is_listing_seller_verified(target_listing.id)
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'miocase-store-logos',
  'miocase-store-logos',
  true,
  524288,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_public_store_logo(photo_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores as store
    join public.profiles as owner on owner.id = store.owner_id
    where store.logo_path = photo_path
      and store.is_visible
      and owner.seller_status = 'approved'
  );
$$;

create or replace function public.can_manage_store_logo(photo_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores as store
    join public.profiles as owner on owner.id = store.owner_id
    where store.id::text = split_part(photo_path, '/', 1)
      and photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+[.](jpg|png|webp)$'
      and store.owner_id = (select auth.uid())
      and owner.seller_status = 'approved'
  );
$$;

drop policy if exists "miocase_store_logos_select" on storage.objects;
create policy "miocase_store_logos_select"
  on storage.objects for select to public
  using (
    bucket_id = 'miocase-store-logos'
    and (select public.is_public_store_logo(name))
  );
drop policy if exists "miocase_store_logos_insert" on storage.objects;
create policy "miocase_store_logos_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'miocase-store-logos'
    and (select public.can_manage_store_logo(name))
  );
drop policy if exists "miocase_store_logos_delete" on storage.objects;
create policy "miocase_store_logos_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'miocase-store-logos'
    and (select public.can_manage_store_logo(name))
  );

create or replace function public.upsert_my_store(
  target_store_id uuid,
  store_name text,
  store_description text,
  store_neighborhood text,
  store_opening_hours text,
  store_social_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  saved_store_id uuid;
begin
  if current_user_id is null then
    raise exception 'Inicia sesión para editar tu tienda';
  end if;
  if not exists (
    select 1 from public.profiles as owner
    where owner.id = current_user_id and owner.seller_status = 'approved'
  ) then
    raise exception 'Solo vendedores aprobados pueden crear una tienda';
  end if;
  if store_name is null or store_name <> btrim(store_name)
    or char_length(store_name) not between 2 and 80 then
    raise exception 'El nombre de la tienda debe tener entre 2 y 80 caracteres';
  end if;
  if store_neighborhood is null or store_neighborhood <> btrim(store_neighborhood)
    or char_length(store_neighborhood) not between 2 and 80 then
    raise exception 'Indica un barrio o zona de Yacuiba (2 a 80 caracteres)';
  end if;
  if store_description is not null and char_length(store_description) > 300 then
    raise exception 'La descripción no puede superar los 300 caracteres';
  end if;
  if store_opening_hours is not null and char_length(store_opening_hours) > 120 then
    raise exception 'El horario no puede superar los 120 caracteres';
  end if;
  if store_social_url is not null and (
    char_length(store_social_url) > 500
    or store_social_url !~ '^https://[^[:space:]]+$'
  ) then
    raise exception 'El enlace social debe comenzar con https://';
  end if;

  insert into public.stores as current_store (
    owner_id, name, description, neighborhood, opening_hours, social_url
  )
  values (
    current_user_id,
    btrim(store_name),
    nullif(btrim(store_description), ''),
    btrim(store_neighborhood),
    nullif(btrim(store_opening_hours), ''),
    nullif(btrim(store_social_url), '')
  )
  on conflict (owner_id) do update
  set name = excluded.name,
      description = excluded.description,
      neighborhood = excluded.neighborhood,
      opening_hours = excluded.opening_hours,
      social_url = excluded.social_url,
      updated_at = now()
  where target_store_id is null or current_store.id = target_store_id
  returning current_store.id into saved_store_id;

  if saved_store_id is null then
    raise exception 'No se encontró una tienda tuya para editar';
  end if;
  return saved_store_id;
end;
$$;

create or replace function public.set_my_store_logo(target_store_id uuid, target_logo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para actualizar el logo';
  end if;
  if target_logo_path is not null and (
    split_part(target_logo_path, '/', 1) <> target_store_id::text
    or target_logo_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+[.](jpg|png|webp)$'
    or not exists (
      select 1 from storage.objects as stored_object
      where stored_object.bucket_id = 'miocase-store-logos'
        and stored_object.name = target_logo_path
    )
  ) then
    raise exception 'El archivo del logo no existe o no corresponde a esta tienda';
  end if;
  update public.stores as store
  set logo_path = target_logo_path,
      updated_at = now()
  where store.id = target_store_id
    and store.owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles as owner
      where owner.id = store.owner_id and owner.seller_status = 'approved'
    );
  if not found then
    raise exception 'No se encontró una tienda tuya para actualizar';
  end if;
end;
$$;

create or replace function public.get_my_store()
returns table (
  id uuid,
  name text,
  logo_path text,
  description text,
  neighborhood text,
  opening_hours text,
  social_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select store.id, store.name, store.logo_path, store.description,
    store.neighborhood, store.opening_hours, store.social_url
  from public.stores as store
  where store.owner_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.get_public_store(target_store_id uuid)
returns table (
  id uuid,
  name text,
  logo_path text,
  description text,
  neighborhood text,
  opening_hours text,
  social_url text,
  member_since timestamptz,
  rating_average numeric,
  review_count bigint,
  follower_count bigint,
  is_following boolean,
  is_own_store boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select store.id, store.name, store.logo_path, store.description,
    store.neighborhood, store.opening_hours, store.social_url,
    owner.created_at,
    coalesce(avg(review.rating)::numeric(3, 2), 0::numeric),
    count(review.id),
    (select count(*) from public.follows as follower where follower.store_id = store.id),
    exists (
      select 1 from public.follows as own_follow
      where own_follow.store_id = store.id and own_follow.user_id = (select auth.uid())
    ),
    coalesce(store.owner_id = (select auth.uid()), false)
  from public.stores as store
  join public.profiles as owner on owner.id = store.owner_id
  left join public.store_reviews as review
    on review.store_id = store.id and review.is_visible
  where store.id = target_store_id
    and store.is_visible
    and owner.seller_status = 'approved'
  group by store.id, owner.created_at;
$$;

create or replace function public.get_featured_stores(page_size integer default 6)
returns table (
  id uuid,
  name text,
  logo_path text,
  neighborhood text,
  rating_average numeric,
  review_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if page_size is null or page_size < 1 or page_size > 10 then
    raise exception 'La cantidad de tiendas debe estar entre 1 y 10';
  end if;
  return query
  select store.id, store.name, store.logo_path, store.neighborhood,
    coalesce(avg(review.rating)::numeric(3, 2), 0::numeric),
    count(review.id)
  from public.stores as store
  join public.profiles as owner on owner.id = store.owner_id
  left join public.store_reviews as review
    on review.store_id = store.id and review.is_visible
  where store.is_visible and owner.seller_status = 'approved'
  group by store.id
  order by coalesce(avg(review.rating), 0) desc, count(review.id) desc,
    store.created_at asc, store.id
  limit page_size;
end;
$$;

create or replace function public.get_public_store_listings(
  target_store_id uuid,
  page_size integer default 20
)
returns table (
  id uuid,
  title text,
  price numeric,
  previous_price numeric,
  currency text,
  created_at timestamptz,
  status public.listing_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if page_size is null or page_size < 1 or page_size > 20 then
    raise exception 'La página debe contener entre 1 y 20 productos';
  end if;
  return query
  select listing.id, listing.title, listing.price, listing.previous_price,
    listing.currency, listing.created_at, listing.status
  from public.listings as listing
  join public.stores as store on store.owner_id = listing.seller_id
  join public.profiles as owner on owner.id = listing.seller_id
  where store.id = target_store_id
    and store.is_visible
    and owner.seller_status = 'approved'
    and listing.status = 'active'
  order by listing.created_at desc, listing.id desc
  limit page_size;
end;
$$;

create or replace function public.get_public_store_reviews(
  target_store_id uuid,
  page_size integer default 20
)
returns table (
  id uuid,
  rating smallint,
  comment text,
  reviewer_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if page_size is null or page_size < 1 or page_size > 20 then
    raise exception 'La página debe contener entre 1 y 20 reseñas';
  end if;
  return query
  select review.id, review.rating, review.comment, reviewer.display_name,
    review.created_at
  from public.store_reviews as review
  join public.stores as store on store.id = review.store_id
  join public.profiles as owner on owner.id = store.owner_id
  join public.profiles as reviewer on reviewer.id = review.reviewer_id
  where review.store_id = target_store_id
    and review.is_visible
    and store.is_visible
    and owner.seller_status = 'approved'
    and not exists (
      select 1 from public.user_blocks as blocked
      where blocked.blocker_id = (select auth.uid())
        and blocked.blocked_id = review.reviewer_id
    )
  order by review.created_at desc, review.id desc
  limit page_size;
end;
$$;

create or replace function public.get_my_store_review(target_store_id uuid)
returns table (id uuid, rating smallint, comment text)
language sql
stable
security definer
set search_path = ''
as $$
  select review.id, review.rating, review.comment
  from public.store_reviews as review
  join public.stores as store on store.id = review.store_id
  where review.store_id = target_store_id
    and review.reviewer_id = (select auth.uid())
    and store.is_visible
  limit 1;
$$;

create or replace function public.submit_store_review(
  target_store_id uuid,
  target_rating smallint,
  review_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Inicia sesión para dejar una reseña'; end if;
  if target_rating is null or target_rating not between 1 and 5 then
    raise exception 'La calificación debe ser de 1 a 5';
  end if;
  if review_comment is not null and char_length(btrim(review_comment)) > 500 then
    raise exception 'El comentario no puede superar los 500 caracteres';
  end if;
  if not exists (
    select 1 from public.stores as store
    join public.profiles as owner on owner.id = store.owner_id
    where store.id = target_store_id and store.is_visible
      and owner.seller_status = 'approved' and store.owner_id <> current_user_id
  ) then
    raise exception 'No puedes reseñar esta tienda';
  end if;
  insert into public.store_reviews (store_id, reviewer_id, rating, comment)
  values (target_store_id, current_user_id, target_rating, nullif(btrim(review_comment), ''))
  on conflict (store_id, reviewer_id) do update
  set rating = excluded.rating,
      comment = excluded.comment,
      updated_at = now();
end;
$$;

create or replace function public.toggle_store_follow(
  target_store_id uuid,
  should_follow boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Inicia sesión para seguir tiendas'; end if;
  if should_follow is null then raise exception 'Elige si quieres seguir esta tienda'; end if;
  if not exists (
    select 1 from public.stores as store
    join public.profiles as owner on owner.id = store.owner_id
    where store.id = target_store_id and store.is_visible
      and owner.seller_status = 'approved' and store.owner_id <> current_user_id
  ) then raise exception 'La tienda no está disponible para seguir'; end if;
  if should_follow then
    insert into public.follows (user_id, store_id)
    values (current_user_id, target_store_id)
    on conflict do nothing;
    return true;
  end if;
  delete from public.follows as follow
  where follow.user_id = current_user_id and follow.store_id = target_store_id;
  return false;
end;
$$;

drop function if exists public.search_active_listings(
  text, integer, timestamptz, uuid, integer, text, numeric
);
create or replace function public.search_active_listings(
  search_text text default null,
  category_filter integer default null,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 13,
  sort_order text default 'recent',
  cursor_price numeric default null,
  followed_only boolean default false
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
  status public.listing_status,
  store_id uuid,
  store_name text,
  store_logo_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if sort_order is null or sort_order not in ('recent', 'cheapest') then
    raise exception 'El orden solicitado no es válido';
  end if;
  if followed_only is null then raise exception 'El filtro de seguimiento no es válido'; end if;
  if search_text is not null and char_length(search_text) > 80 then
    raise exception 'La búsqueda no puede superar los 80 caracteres';
  end if;
  if page_size is null or page_size < 1 or page_size > 20 then
    raise exception 'La página debe contener entre 1 y 20 publicaciones';
  end if;
  if followed_only and (select auth.uid()) is null then
    raise exception 'Inicia sesión para filtrar las tiendas que sigues';
  end if;

  return query
  select listing.id, listing.title, listing.description, listing.price,
    listing.previous_price, listing.currency, listing.category_id, category.name,
    listing.created_at, owner.display_name, listing.status,
    store.id, coalesce(store.name, owner.display_name), store.logo_path
  from public.listings as listing
  join public.categories as category on category.id = listing.category_id
  join public.profiles as owner on owner.id = listing.seller_id
  left join public.stores as store
    on store.owner_id = listing.seller_id and store.is_visible
  where listing.status in ('active', 'sold')
    and owner.seller_status = 'approved'
    and (category_filter is null or listing.category_id = category_filter)
    and (
      nullif(btrim(search_text), '') is null
      or to_tsvector(
        'spanish'::regconfig,
        listing.title || ' ' || coalesce(listing.description, '')
      ) @@ websearch_to_tsquery('spanish'::regconfig, btrim(search_text))
    )
    and (
      not followed_only
      or exists (
        select 1 from public.follows as follow
        where follow.user_id = (select auth.uid()) and follow.store_id = store.id
      )
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

drop function if exists public.get_public_listing_detail(uuid);
create function public.get_public_listing_detail(target_listing_id uuid)
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
  is_own_listing boolean,
  store_id uuid,
  store_name text,
  store_logo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select listing.id, listing.title, listing.description, listing.price,
    listing.previous_price, listing.currency, listing.category_id, category.name,
    listing.created_at, owner.display_name, listing.status,
    coalesce(listing.seller_id = (select auth.uid()), false),
    store.id, coalesce(store.name, owner.display_name), store.logo_path
  from public.listings as listing
  join public.categories as category on category.id = listing.category_id
  join public.profiles as owner on owner.id = listing.seller_id
  left join public.stores as store
    on store.owner_id = listing.seller_id and store.is_visible
  where listing.id = target_listing_id
    and listing.status in ('active', 'sold')
    and owner.seller_status = 'approved'
  limit 1;
$$;

create or replace function public.get_public_listing_comments(
  target_listing_id uuid,
  page_size integer default 50
)
returns table (
  id uuid,
  parent_comment_id uuid,
  body text,
  author_name text,
  author_is_seller boolean,
  can_block boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if page_size is null or page_size < 1 or page_size > 50 then
    raise exception 'La página debe contener entre 1 y 50 comentarios';
  end if;
  return query
  select listing_comment.id, listing_comment.parent_comment_id, listing_comment.body,
    author.display_name, listing_comment.author_id = listing.seller_id,
    coalesce(listing_comment.author_id <> (select auth.uid()), true), listing_comment.created_at
  from public.listing_comments as listing_comment
  join public.listings as listing on listing.id = listing_comment.listing_id
  join public.profiles as seller on seller.id = listing.seller_id
  join public.profiles as author on author.id = listing_comment.author_id
  where listing_comment.listing_id = target_listing_id
    and listing_comment.is_visible
    and listing.status in ('active', 'sold')
    and seller.seller_status = 'approved'
    and not exists (
      select 1 from public.user_blocks as blocked
      where blocked.blocker_id = (select auth.uid())
        and blocked.blocked_id = listing_comment.author_id
    )
  order by listing_comment.created_at, listing_comment.id
  limit page_size;
end;
$$;

create or replace function public.add_listing_comment(
  target_listing_id uuid,
  comment_body text,
  target_parent_comment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  saved_comment_id uuid;
  listing_owner_id uuid;
begin
  if current_user_id is null then raise exception 'Inicia sesión para comentar'; end if;
  if comment_body is null or comment_body <> btrim(comment_body)
    or char_length(comment_body) not between 1 and 800 then
    raise exception 'El comentario debe tener entre 1 y 800 caracteres';
  end if;
  if comment_body ~* '(https?://|www[.]|[[:alnum:]-]+[.](com|net|org|bo|info|app|io|me)([/[:space:]]|$))' then
    raise exception 'No se permiten enlaces en los comentarios';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );
  if (
    select count(*) from public.listing_comments as recent
    where recent.author_id = current_user_id
      and recent.created_at >= now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Puedes publicar hasta 5 comentarios por hora';
  end if;
  select listing.seller_id into listing_owner_id
  from public.listings as listing
  join public.profiles as owner on owner.id = listing.seller_id
  where listing.id = target_listing_id
    and listing.status in ('active', 'sold')
    and owner.seller_status = 'approved';
  if listing_owner_id is null then raise exception 'El producto no está disponible para comentar'; end if;

  if target_parent_comment_id is not null then
    perform 1
    from public.listing_comments as parent
    where parent.id = target_parent_comment_id
      and parent.listing_id = target_listing_id
      and parent.parent_comment_id is null
      and parent.is_visible;
    if not found or current_user_id <> listing_owner_id then
      raise exception 'Solo el vendedor puede responder a una pregunta visible';
    end if;
  elsif current_user_id = listing_owner_id then
    raise exception 'Usa responder para contestar una pregunta sobre tu producto';
  end if;

  insert into public.listing_comments (listing_id, author_id, parent_comment_id, body)
  values (target_listing_id, current_user_id, target_parent_comment_id, comment_body)
  returning id into saved_comment_id;
  return saved_comment_id;
end;
$$;

create or replace function public.set_comment_author_block(
  target_comment_id uuid,
  should_block boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  comment_author_id uuid;
begin
  if current_user_id is null then raise exception 'Inicia sesión para bloquear una cuenta'; end if;
  if should_block is null then raise exception 'Elige si quieres bloquear esta cuenta'; end if;
  select listing_comment.author_id into comment_author_id
  from public.listing_comments as listing_comment
  where listing_comment.id = target_comment_id and listing_comment.is_visible;
  if not found or comment_author_id = current_user_id then
    raise exception 'No se puede bloquear al autor de este comentario';
  end if;
  if should_block then
    insert into public.user_blocks (blocker_id, blocked_id)
    values (current_user_id, comment_author_id)
    on conflict do nothing;
  else
    delete from public.user_blocks as blocked
    where blocked.blocker_id = current_user_id
      and blocked.blocked_id = comment_author_id;
  end if;
end;
$$;

create or replace function public.create_content_report(
  target_type text,
  target_id uuid,
  report_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  report_id uuid;
  target_available boolean := false;
begin
  if current_user_id is null then raise exception 'Inicia sesión para reportar contenido'; end if;
  if target_type is null or target_type not in ('store', 'review', 'comment') then
    raise exception 'El tipo de reporte no es válido';
  end if;
  if report_reason is null or report_reason <> btrim(report_reason)
    or char_length(report_reason) not between 1 and 300 then
    raise exception 'El motivo debe tener entre 1 y 300 caracteres';
  end if;
  if target_type = 'store' then
    select exists (
      select 1
      from public.stores as store
      join public.profiles as owner on owner.id = store.owner_id
      where store.id = target_id and store.is_visible
        and owner.seller_status = 'approved'
        and store.owner_id <> current_user_id
    ) into target_available;
  elsif target_type = 'review' then
    select exists (
      select 1
      from public.store_reviews as review
      join public.stores as store on store.id = review.store_id
      join public.profiles as owner on owner.id = store.owner_id
      where review.id = target_id and review.is_visible and store.is_visible
        and owner.seller_status = 'approved'
        and review.reviewer_id <> current_user_id
    ) into target_available;
  else
    select exists (
      select 1
      from public.listing_comments as listing_comment
      join public.listings as listing on listing.id = listing_comment.listing_id
      join public.profiles as owner on owner.id = listing.seller_id
      where listing_comment.id = target_id and listing_comment.is_visible
        and listing_comment.author_id <> current_user_id
        and listing.status in ('active', 'sold')
        and owner.seller_status = 'approved'
    ) into target_available;
  end if;
  if not target_available then raise exception 'El contenido no está disponible para reportar'; end if;
  insert into public.content_reports (target_type, target_id, reporter_id, reason)
  values (target_type, target_id, current_user_id, report_reason)
  returning id into report_id;
  return report_id;
exception
  when unique_violation then
    raise exception 'Ya reportaste este contenido';
end;
$$;

create or replace function public.get_admin_content_reports()
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  reason text,
  created_at timestamptz,
  target_title text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then raise exception 'Solo administración puede revisar reportes'; end if;
  return query
  select report.id, report.target_type, report.target_id, report.reason,
    report.created_at,
    case report.target_type
      when 'store' then (
        select store.name from public.stores as store where store.id = report.target_id
      )
      when 'review' then (
        select review.comment from public.store_reviews as review where review.id = report.target_id
      )
      else (
        select listing_comment.body
        from public.listing_comments as listing_comment
        where listing_comment.id = report.target_id
      )
    end
  from public.content_reports as report
  where report.status = 'open'
  order by report.created_at, report.id
  limit 100;
end;
$$;

create or replace function public.moderate_content_report(
  target_report_id uuid,
  report_decision text,
  hide_target boolean,
  moderator_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := (select auth.uid());
  report_row public.content_reports%rowtype;
  action_value text;
  target_store_id uuid;
  target_review_id uuid;
  target_comment_id uuid;
begin
  if current_admin_id is null or not (select public.is_admin()) then
    raise exception 'Solo administración puede moderar reportes';
  end if;
  if report_decision is null
    or report_decision not in ('reviewed', 'dismissed')
    or hide_target is null then
    raise exception 'La decisión de moderación no es válida';
  end if;
  if hide_target and report_decision <> 'reviewed' then
    raise exception 'Solo puedes ocultar contenido al revisar un reporte';
  end if;
  select report.* into report_row
  from public.content_reports as report
  where report.id = target_report_id
  for update;
  if not found or report_row.status <> 'open' then
    raise exception 'El reporte no existe o ya fue revisado';
  end if;

  if hide_target then
    if report_row.target_type = 'store' then
      update public.stores as store set is_visible = false, updated_at = now()
      where store.id = report_row.target_id;
      target_store_id := report_row.target_id;
    elsif report_row.target_type = 'review' then
      update public.store_reviews as review set is_visible = false
      where review.id = report_row.target_id;
      target_review_id := report_row.target_id;
    else
      update public.listing_comments as listing_comment set is_visible = false
      where listing_comment.id = report_row.target_id;
      target_comment_id := report_row.target_id;
    end if;
    action_value := 'social_content_hidden';
  else
    action_value := case when report_decision = 'reviewed'
      then 'social_report_reviewed' else 'social_report_dismissed' end;
    if report_row.target_type = 'store' then target_store_id := report_row.target_id;
    elsif report_row.target_type = 'review' then target_review_id := report_row.target_id;
    else target_comment_id := report_row.target_id;
    end if;
  end if;

  update public.content_reports as report
  set status = report_decision
  where report.id = report_row.id;

  insert into public.moderation_actions (
    moderator_id, action, note, target_store_id_snapshot,
    target_store_review_id_snapshot, target_comment_id_snapshot,
    target_content_report_id_snapshot
  )
  values (
    current_admin_id, action_value,
    left(coalesce(nullif(btrim(moderator_note), ''), report_row.reason), 500),
    target_store_id, target_review_id, target_comment_id, report_row.id
  );
end;
$$;

create or replace function public.get_my_favorite_listings(page_size integer default 20)
returns table (
  id uuid,
  title text,
  price numeric,
  previous_price numeric,
  currency text,
  created_at timestamptz,
  store_id uuid,
  store_name text,
  store_logo_path text,
  status public.listing_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para ver tus favoritos'; end if;
  if page_size is null or page_size < 1 or page_size > 50 then
    raise exception 'La página debe contener entre 1 y 50 productos';
  end if;
  return query
  select listing.id, listing.title, listing.price, listing.previous_price,
    listing.currency, listing.created_at, store.id,
    coalesce(store.name, owner.display_name), store.logo_path, listing.status
  from public.listing_favorites as favorite
  join public.listings as listing on listing.id = favorite.listing_id
  join public.profiles as owner on owner.id = listing.seller_id
  left join public.stores as store
    on store.owner_id = listing.seller_id and store.is_visible
  where favorite.user_id = (select auth.uid())
    and listing.status in ('active', 'sold')
    and owner.seller_status = 'approved'
  order by favorite.created_at desc, listing.id desc
  limit page_size;
end;
$$;

revoke all on function public.is_public_store_logo(text) from public, anon, authenticated;
revoke all on function public.can_manage_store_logo(text) from public, anon, authenticated;
revoke all on function public.upsert_my_store(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.set_my_store_logo(uuid, text) from public, anon, authenticated;
revoke all on function public.get_my_store() from public, anon, authenticated;
revoke all on function public.get_public_store(uuid) from public, anon, authenticated;
revoke all on function public.get_featured_stores(integer) from public, anon, authenticated;
revoke all on function public.get_public_store_listings(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_public_store_reviews(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_my_store_review(uuid) from public, anon, authenticated;
revoke all on function public.submit_store_review(uuid, smallint, text) from public, anon, authenticated;
revoke all on function public.toggle_store_follow(uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_public_listing_comments(uuid, integer) from public, anon, authenticated;
revoke all on function public.add_listing_comment(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.set_comment_author_block(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_content_report(text, uuid, text) from public, anon, authenticated;
revoke all on function public.get_admin_content_reports() from public, anon, authenticated;
revoke all on function public.moderate_content_report(uuid, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.get_my_favorite_listings(integer) from public, anon, authenticated;
revoke all on function public.search_active_listings(text, integer, timestamptz, uuid, integer, text, numeric, boolean)
  from public, anon, authenticated;
revoke all on function public.get_public_listing_detail(uuid) from public, anon, authenticated;

grant execute on function public.is_public_store_logo(text) to anon, authenticated;
grant execute on function public.can_manage_store_logo(text) to authenticated;
grant execute on function public.upsert_my_store(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.set_my_store_logo(uuid, text) to authenticated;
grant execute on function public.get_my_store() to authenticated;
grant execute on function public.get_public_store(uuid) to anon, authenticated;
grant execute on function public.get_featured_stores(integer) to anon, authenticated;
grant execute on function public.get_public_store_listings(uuid, integer) to anon, authenticated;
grant execute on function public.get_public_store_reviews(uuid, integer) to anon, authenticated;
grant execute on function public.get_my_store_review(uuid) to authenticated;
grant execute on function public.submit_store_review(uuid, smallint, text) to authenticated;
grant execute on function public.toggle_store_follow(uuid, boolean) to authenticated;
grant execute on function public.get_public_listing_comments(uuid, integer) to anon, authenticated;
grant execute on function public.add_listing_comment(uuid, text, uuid) to authenticated;
grant execute on function public.set_comment_author_block(uuid, boolean) to authenticated;
grant execute on function public.create_content_report(text, uuid, text) to authenticated;
grant execute on function public.get_admin_content_reports() to authenticated;
grant execute on function public.moderate_content_report(uuid, text, boolean, text) to authenticated;
grant execute on function public.get_my_favorite_listings(integer) to authenticated;
grant execute on function public.search_active_listings(text, integer, timestamptz, uuid, integer, text, numeric, boolean)
  to anon, authenticated;
grant execute on function public.get_public_listing_detail(uuid) to anon, authenticated;
