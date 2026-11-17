create or replace function public.is_public_listing_photo(photo_path text)
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
    where image.path = photo_path
      and split_part(image.path, '/', 1) = image.listing_id::text
      and listing.status in ('active', 'sold')
      and seller.seller_status = 'approved'
  );
$$;

create or replace function public.can_read_owned_listing_photo(photo_path text)
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
    where image.path = photo_path
      and (
        listing.seller_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles profile
          where profile.id = (select auth.uid())
            and profile.role = 'admin'
        )
      )
  );
$$;

revoke all on function public.is_public_listing_photo(text)
  from public, anon, authenticated;
grant execute on function public.is_public_listing_photo(text)
  to anon, authenticated;

revoke all on function public.can_read_owned_listing_photo(text)
  from public, anon, authenticated;
grant execute on function public.can_read_owned_listing_photo(text)
  to anon, authenticated;

drop policy if exists "miocase_public_photos_select" on storage.objects;
create policy "miocase_public_photos_select"
  on storage.objects for select to public
  using (
    bucket_id = 'miocase-listing-photos'
    and (
      (select public.is_public_listing_photo(name))
      or (select public.can_read_owned_listing_photo(name))
    )
  );
