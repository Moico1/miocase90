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
    'public.app_settings',
    'public.stores',
    'public.store_reviews',
    'public.listing_comments',
    'public.follows',
    'public.user_blocks',
    'public.content_reports',
    'public.whatsapp_verifications'
  ]
  loop
    if has_table_privilege('anon', protected_table, 'select')
      or has_table_privilege('anon', protected_table, 'insert')
      or has_table_privilege('anon', protected_table, 'update')
      or has_table_privilege('anon', protected_table, 'delete') then
      raise exception 'anon tiene privilegios inesperados en %', protected_table;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.get_my_store_review(uuid)', 'execute')
    or has_function_privilege('anon', 'public.upsert_my_store(uuid,text,text,text,text,text)', 'execute')
    or has_function_privilege('anon', 'public.set_my_store_logo(uuid,text)', 'execute')
    or has_function_privilege('anon', 'public.submit_store_review(uuid,smallint,text)', 'execute')
    or has_function_privilege('anon', 'public.toggle_store_follow(uuid,boolean)', 'execute')
    or has_function_privilege('anon', 'public.add_listing_comment(uuid,text,uuid)', 'execute')
    or has_function_privilege('anon', 'public.set_comment_author_block(uuid,boolean)', 'execute')
    or has_function_privilege('anon', 'public.create_content_report(text,uuid,text)', 'execute')
    or has_function_privilege('anon', 'public.get_my_favorite_listings(integer)', 'execute')
    or has_function_privilege('anon', 'public.request_whatsapp_verification(text)', 'execute')
    or has_function_privilege('anon', 'public.admin_issue_whatsapp_code(uuid)', 'execute')
    or has_function_privilege('anon', 'public.verify_whatsapp_code(text)', 'execute')
    or has_function_privilege('anon', 'public.get_my_whatsapp_verification()', 'execute')
    or has_function_privilege('anon', 'public.get_admin_whatsapp_verifications()', 'execute') then
    raise exception 'anon tiene acceso a una función privada';
  end if;

  if has_column_privilege(
      'authenticated',
      'public.profile_contacts',
      'whatsapp_verified',
      'INSERT'
    )
    or has_column_privilege(
      'authenticated',
      'public.profile_contacts',
      'whatsapp_verified',
      'UPDATE'
    ) then
    raise exception 'authenticated puede modificar el estado de verificación de WhatsApp';
  end if;
  if has_table_privilege('authenticated', 'public.profile_contacts', 'insert')
    or has_table_privilege('authenticated', 'public.profile_contacts', 'update')
    or has_column_privilege('authenticated', 'public.profile_contacts', 'whatsapp', 'INSERT')
    or has_column_privilege('authenticated', 'public.profile_contacts', 'whatsapp', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profile_contacts', 'show_whatsapp', 'INSERT')
    or has_column_privilege('authenticated', 'public.profile_contacts', 'show_whatsapp', 'UPDATE') then
    raise exception 'authenticated puede cambiar WhatsApp sin pasar por las funciones seguras';
  end if;
  if not has_column_privilege(
    'authenticated',
    'public.listings',
    'previous_price',
    'INSERT'
  ) then
    raise exception 'authenticated no puede guardar el precio anterior de una publicación';
  end if;

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
  from public.get_public_store('00000000-0000-0000-0000-000000000000'::uuid);
  if anon_rows <> 0 then
    raise exception 'La consulta pública devolvió una tienda inexistente';
  end if;

  select count(*) into anon_rows
  from public.get_public_store_listings('00000000-0000-0000-0000-000000000000'::uuid, 20);
  if anon_rows <> 0 then
    raise exception 'La consulta pública devolvió productos de una tienda inexistente';
  end if;

  select count(*) into anon_rows
  from public.get_public_store_reviews('00000000-0000-0000-0000-000000000000'::uuid, 20);
  if anon_rows <> 0 then
    raise exception 'La consulta pública devolvió reseñas de una tienda inexistente';
  end if;

  select count(*) into anon_rows
  from public.get_public_listing_comments('00000000-0000-0000-0000-000000000000'::uuid, 50);
  if anon_rows <> 0 then
    raise exception 'La consulta pública devolvió comentarios de una publicación inexistente';
  end if;

  select count(*) into anon_rows
  from public.get_featured_stores(10);
  if anon_rows > 10 then
    raise exception 'La consulta de tiendas destacadas excedió el límite';
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
