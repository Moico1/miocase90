
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
      'report_dismissed'
    )
  );

alter table public.moderation_actions
  add column if not exists target_user_id_snapshot uuid;
alter table public.moderation_actions
  add column if not exists target_listing_id_snapshot uuid;

update public.moderation_actions
set target_user_id_snapshot = target_user_id
where target_user_id_snapshot is null
  and target_user_id is not null;

update public.moderation_actions
set target_listing_id_snapshot = target_listing_id
where target_listing_id_snapshot is null
  and target_listing_id is not null;

alter table public.moderation_actions
  drop constraint if exists moderation_actions_check;

alter table public.moderation_actions
  add constraint moderation_actions_check
  check (target_user_id is not null or target_listing_id is not null);

drop policy if exists "miocase_photos_delete_owner_or_admin" on storage.objects;
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
            and listing.status in ('draft', 'removed')
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
    and exists (
      select 1
      from public.listing_images image
      where image.listing_id = listing.id
    )
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
    raise exception 'Listing must have at least one uploaded photo';
  end if;
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
begin
  if current_user_id is null then
    raise exception 'Sign in before updating your profile';
  end if;

  if normalized_name is null or char_length(normalized_name) not between 2 and 60 then
    raise exception 'Display name must contain between 2 and 60 characters';
  end if;

  if target_show_whatsapp is null then
    raise exception 'WhatsApp visibility must be selected';
  end if;

  if target_whatsapp is not null
    and target_whatsapp !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'WhatsApp number must use international E.164 format';
  end if;

  if target_show_whatsapp and target_whatsapp is null then
    raise exception 'Add a WhatsApp number before making it visible';
  end if;

  update public.profiles
  set display_name = normalized_name
  where id = current_user_id;

  if not found then
    raise exception 'Profile was not found';
  end if;

  insert into public.profile_contacts (user_id, whatsapp, show_whatsapp)
  values (current_user_id, target_whatsapp, target_show_whatsapp)
  on conflict (user_id) do update
  set whatsapp = excluded.whatsapp,
      show_whatsapp = excluded.show_whatsapp;
end;
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
    raise exception 'Only administrators can moderate memberships';
  end if;

  if target_status is null or target_status not in ('verified', 'rejected') then
    raise exception 'Membership decision must be verified or rejected';
  end if;

  update public.community_memberships as membership
  set status = target_status,
      verified_by = case when target_status = 'verified' then current_admin_id else null end,
      verified_at = case when target_status = 'verified' then now() else null end
  where membership.user_id = target_user_id
    and membership.status = 'pending'
  returning membership.user_id into changed_user_id;

  if changed_user_id is null then
    raise exception 'Membership was not found or is no longer pending';
  end if;

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

create or replace function public.moderate_report(
  target_report_id uuid,
  target_report_status text,
  hide_listing boolean default false,
  moderator_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := (select auth.uid());
  report_row public.reports%rowtype;
  action_note text;
begin
  if current_admin_id is null or not (select public.is_admin()) then
    raise exception 'Only administrators can moderate reports';
  end if;

  if target_report_status is null
    or target_report_status not in ('reviewed', 'dismissed') then
    raise exception 'Report decision must be reviewed or dismissed';
  end if;

  if hide_listing and target_report_status <> 'reviewed' then
    raise exception 'A hidden listing must have a reviewed report';
  end if;
  if hide_listing is null then
    raise exception 'Listing visibility decision must be selected';
  end if;

  select report.*
  into report_row
  from public.reports as report
  where report.id = target_report_id
  for update;

  if not found or report_row.status <> 'open' then
    raise exception 'Report was not found or is no longer open';
  end if;

  action_note := left(
    coalesce(nullif(btrim(moderator_note), ''), report_row.reason),
    500
  );

  if hide_listing then
    update public.listings
    set status = 'removed'
    where id = report_row.listing_id
      and status <> 'removed';

    if found then
      insert into public.moderation_actions (
        moderator_id,
        target_listing_id,
        target_listing_id_snapshot,
        action,
        note
      )
      values (
        current_admin_id,
        report_row.listing_id,
        report_row.listing_id,
        'listing_removed',
        action_note
      );
    end if;
  end if;

  update public.reports
  set status = target_report_status
  where id = report_row.id;

  insert into public.moderation_actions (
    moderator_id,
    target_listing_id,
    target_listing_id_snapshot,
    action,
    note
  )
  values (
    current_admin_id,
    report_row.listing_id,
    report_row.listing_id,
    case
      when target_report_status = 'reviewed' then 'report_reviewed'
      else 'report_dismissed'
    end,
    action_note
  );
end;
$$;

create or replace function public.prepare_own_listing_deletion(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before deleting a listing';
  end if;

  update public.listings
  set status = 'removed'
  where id = target_listing_id
    and seller_id = (select auth.uid())
    and status in ('draft', 'active', 'sold', 'removed');

  if not found then
    raise exception 'Listing was not found or is not owned by the caller';
  end if;
end;
$$;

create or replace function public.delete_own_removed_listing(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before deleting a listing';
  end if;

  delete from public.listings as listing
  where listing.id = target_listing_id
    and listing.seller_id = (select auth.uid())
    and listing.status = 'removed'
    and not exists (
      select 1
      from storage.objects as object
      where object.bucket_id = 'miocase-listing-photos'
        and split_part(object.name, '/', 1) = (select auth.uid())::text
        and split_part(object.name, '/', 2) = target_listing_id::text
    );

  if not found then
    raise exception 'Listing is not removed or still has stored photos';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text, boolean) from public, anon;
revoke all on function public.moderate_membership(uuid, public.membership_status, text)
  from public, anon;
revoke all on function public.moderate_report(uuid, text, boolean, text) from public, anon;
revoke all on function public.prepare_own_listing_deletion(uuid) from public, anon;
revoke all on function public.delete_own_removed_listing(uuid) from public, anon;

grant execute on function public.update_my_profile(text, text, boolean) to authenticated;
grant execute on function public.moderate_membership(uuid, public.membership_status, text)
  to authenticated;
grant execute on function public.moderate_report(uuid, text, boolean, text) to authenticated;
grant execute on function public.prepare_own_listing_deletion(uuid) to authenticated;
grant execute on function public.delete_own_removed_listing(uuid) to authenticated;
