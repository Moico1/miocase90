alter policy "listings_select_visible"
  on public.listings
  using (
    seller_id = (select auth.uid())
    or (select public.is_admin())
    or (
      status in ('active', 'sold')
      and (select public.is_verified())
      and public.is_listing_seller_verified(id)
    )
  );

alter policy "listings_insert_verified"
  on public.listings
  with check (
    seller_id = (select auth.uid())
    and (select public.is_verified())
    and status = 'draft'
  );

alter policy "listing_images_insert_owner"
  on public.listing_images
  with check (
    (select public.is_verified())
    and (storage.foldername(path))[1] = (select auth.uid())::text
    and (storage.foldername(path))[2] = listing_id::text
    and exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.seller_id = (select auth.uid())
        and listing.status = 'draft'
    )
  );

revoke insert (status) on public.listings from authenticated;
grant insert (status) on public.listings to authenticated;
revoke update (status) on public.listings from authenticated;
revoke delete on public.listing_images from authenticated;

drop policy "miocase_photos_insert_owner" on storage.objects;
create policy "miocase_photos_insert_owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'miocase-listing-photos'
    and (select public.is_verified())
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.listings listing
      join public.listing_images image on image.listing_id = listing.id
      where listing.id::text = (storage.foldername(name))[2]
        and listing.seller_id = (select auth.uid())
        and listing.status = 'draft'
        and image.path = name
    )
  );

drop policy "miocase_photos_delete_owner_or_admin" on storage.objects;
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
            and listing.status = 'draft'
        )
      )
    )
  );

drop policy "miocase_photos_select" on storage.objects;
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
            and listing.status in ('active', 'sold')
        )
      )
    )
  );

create or replace function public.publish_listing(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_verified()) then
    raise exception 'Only verified members can publish listings';
  end if;

  update public.listings listing
  set status = 'active'
  where listing.id = target_listing_id
    and listing.seller_id = (select auth.uid())
    and listing.status = 'draft'
    and not exists (
      select 1
      from public.listing_images image
      where image.listing_id = listing.id
        and not exists (
          select 1
          from storage.objects object
          where object.bucket_id = 'miocase-listing-photos'
            and object.name = image.path
        )
    );

  if not found then
    raise exception 'Listing is not owned by the caller or has missing photos';
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
    raise exception 'Sign in before discarding a listing';
  end if;

  delete from public.listings listing
  where listing.id = target_listing_id
    and listing.seller_id = (select auth.uid())
    and listing.status = 'draft'
    and not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'miocase-listing-photos'
        and split_part(object.name, '/', 1) = (select auth.uid())::text
        and split_part(object.name, '/', 2) = target_listing_id::text
    );

  if not found then
    raise exception 'Draft is not owned by the caller or still has stored photos';
  end if;
end;
$$;

create or replace function public.change_listing_status(
  target_listing_id uuid,
  target_status public.listing_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_listing public.listings%rowtype;
begin
  if (select auth.uid()) is null
    or target_status is null
    or target_status = 'draft' then
    raise exception 'Requested listing status change is not allowed';
  end if;

  select *
  into current_listing
  from public.listings
  where id = target_listing_id
  for update;

  if not found then
    raise exception 'Listing was not found';
  end if;

  if current_listing.status = 'draft' then
    raise exception 'Draft listings can only be published after their photos are uploaded';
  end if;

  if (select public.is_admin()) then
    update public.listings
    set status = target_status
    where id = target_listing_id;
  elsif current_listing.seller_id = (select auth.uid())
    and current_listing.status = 'active'
    and target_status = 'sold' then
    update public.listings
    set status = target_status
    where id = target_listing_id;
  else
    raise exception 'Caller cannot change this listing status';
  end if;
end;
$$;

revoke all on function public.publish_listing(uuid) from public, anon;
revoke all on function public.discard_incomplete_listing(uuid) from public, anon;
revoke all on function public.change_listing_status(uuid, public.listing_status)
  from public, anon;
grant execute on function public.publish_listing(uuid) to authenticated;
grant execute on function public.discard_incomplete_listing(uuid) to authenticated;
grant execute on function public.change_listing_status(uuid, public.listing_status)
  to authenticated;
