-- Ejecutar después de las migraciones, desde el SQL Editor de Supabase.
-- Cada consulta sensible debe carecer de privilegios; la prueba aborta si anon obtiene acceso.
begin;
set local role anon;

do $$
declare
  protected_table text;
  anon_rows integer;
begin
  foreach protected_table in array array[
    'public.profiles',
    'public.community_memberships',
    'public.membership_invites',
    'public.profile_contacts',
    'public.listings',
    'public.listing_images',
    'public.categories',
    'public.reports',
    'public.moderation_actions',
    'public.contact_events',
    'public.listing_favorites',
    'public.listing_ratings',
    'public.app_settings'
  ]
  loop
    if has_table_privilege('anon', protected_table, 'select')
      or has_table_privilege('anon', protected_table, 'insert')
      or has_table_privilege('anon', protected_table, 'update')
      or has_table_privilege('anon', protected_table, 'delete') then
      raise exception 'anon tiene privilegios inesperados en %', protected_table;
    end if;
  end loop;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and roles && array['anon', 'public']::name[]
  ) then
    raise exception 'anon tiene políticas de escritura inesperadas en Storage';
  end if;

  select count(*) into anon_rows
  from storage.objects object
  where object.bucket_id = 'miocase-listing-photos'
    and split_part(object.name, '/', 3) <> '';
  if anon_rows <> 0 then
    raise exception 'anon puede ver rutas antiguas con el ID del vendedor';
  end if;

  select count(*) into anon_rows
  from public.get_public_listing_images(array[]::uuid[]);
  if anon_rows <> 0 then
    raise exception 'La consulta de fotos vacía devolvió filas';
  end if;

  select count(*) into anon_rows
  from public.search_active_listings(
    null, null, null, null, 20, 'recent', null
  );
  if anon_rows > 20 then
    raise exception 'La búsqueda pública excedió el límite de página';
  end if;

  begin
    perform public.search_active_listings(
      null, null, null, null, 21, 'recent', null
    );
    raise exception 'La búsqueda pública aceptó más de 20 filas';
  exception
    when raise_exception then
      if sqlerrm = 'La búsqueda pública aceptó más de 20 filas' then
        raise;
      end if;
  end;
end;
$$;

rollback;
