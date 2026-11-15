create or replace function public.search_active_listings(
  search_text text default null,
  category_filter integer default null,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 13
)
returns table (
  id uuid,
  seller_id uuid,
  title text,
  description text,
  price numeric,
  currency text,
  category_id integer,
  category_name text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    listing.id,
    listing.seller_id,
    listing.title,
    listing.description,
    listing.price,
    listing.currency,
    listing.category_id,
    category.name,
    listing.created_at
  from public.listings as listing
  join public.categories as category on category.id = listing.category_id
  where listing.status = 'active'
    and (category_filter is null or listing.category_id = category_filter)
    and (
      nullif(btrim(search_text), '') is null
      or to_tsvector(
        'spanish'::regconfig,
        listing.title || ' ' || coalesce(listing.description, '')
      ) @@ websearch_to_tsquery(
        'spanish'::regconfig,
        left(btrim(search_text), 100)
      )
    )
    and (
      cursor_created_at is null
      or cursor_id is null
      or (listing.created_at, listing.id) < (cursor_created_at, cursor_id)
    )
  order by listing.created_at desc, listing.id desc
  limit least(greatest(coalesce(page_size, 13), 1), 51);
$$;

revoke all on function public.search_active_listings(
  text,
  integer,
  timestamptz,
  uuid,
  integer
) from public, anon;
grant execute on function public.search_active_listings(
  text,
  integer,
  timestamptz,
  uuid,
  integer
) to authenticated;
