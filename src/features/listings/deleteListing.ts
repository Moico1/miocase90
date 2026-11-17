import { getSupabaseClient } from '@/lib/supabase';

const PHOTO_BUCKET = 'miocase-listing-photos';

async function listStoredFiles(folder: string): Promise<string[]> {
  const { data, error } = await getSupabaseClient().storage
    .from(PHOTO_BUCKET)
    .list(folder, { limit: 100 });

  if (error) throw error;

  const entries = data ?? [];
  const files = entries
    .filter((entry) => Boolean(entry.id))
    .map((entry) => `${folder}/${entry.name}`);
  const subfolders = entries.filter((entry) => !entry.id);
  const nestedFiles = await Promise.all(
    subfolders.map((entry) => listStoredFiles(`${folder}/${entry.name}`))
  );

  return files.concat(...nestedFiles);
}

export async function deleteOwnListing(userId: string, listingId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error: prepareError } = await client.rpc('prepare_own_listing_deletion', {
    target_listing_id: listingId,
  });
  if (prepareError) {
    throw new Error('No se pudo ocultar la publicación antes de eliminarla. Comprueba tu conexión e inténtalo otra vez.');
  }

  try {
    const folders = [listingId, `${userId}/${listingId}`];
    const paths = (await Promise.all(folders.map(listStoredFiles))).flat();
    const uniquePaths = [...new Set(paths)];

    if (uniquePaths.length > 0) {
      const { error: removeError } = await client.storage
        .from(PHOTO_BUCKET)
        .remove(uniquePaths);
      if (removeError) throw removeError;
    }

    const { error: deleteError } = await client.rpc('delete_own_removed_listing', {
      target_listing_id: listingId,
    });
    if (deleteError) throw deleteError;
  } catch {
    throw new Error(
      'La publicación quedó oculta, pero no se pudo terminar su eliminación. Puedes volver a intentarlo desde esta pantalla.'
    );
  }
}
