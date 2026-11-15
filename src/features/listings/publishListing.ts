import { File } from 'expo-file-system';

import type { ListingFormValues } from './listingSchema';
import type { PreparedListingPhoto } from './imagePreparation';
import { MAX_LISTING_PHOTO_BYTES } from './imagePreparation';
import { getSupabaseClient } from '@/lib/supabase';

const PHOTO_BUCKET = 'miocase-listing-photos';

export type PublishProgress =
  | { phase: 'saving'; completed: number; total: number }
  | { phase: 'uploading'; completed: number; total: number }
  | { phase: 'publishing'; completed: number; total: number };

function getErrorDetails(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : error instanceof Error
        ? error.message
        : '';

  if (/row-level security|permission denied|not allowed/i.test(message)) {
    return 'Tu cuenta no tiene permiso para publicar. Confirma que tu membresía esté verificada.';
  }
  if (/payload too large|file size|exceeds.*limit/i.test(message)) {
    return 'La foto supera el límite de 512 KiB. Elige otra imagen.';
  }
  if (/already exists|duplicate/i.test(message)) {
    return 'No se pudo guardar una foto porque ya existe un archivo con ese nombre. Inténtalo otra vez.';
  }

  return message ? `Detalle: ${message}` : 'Ocurrió un error inesperado.';
}

export async function publishListing(
  userId: string,
  values: ListingFormValues,
  photos: PreparedListingPhoto[],
  onProgress: (progress: PublishProgress) => void
): Promise<string> {
  const supabase = getSupabaseClient();
  const { data: membership, error: membershipError } = await supabase
    .from('community_memberships')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`No se pudo comprobar tu membresía. ${getErrorDetails(membershipError)}`);
  }
  if (membership?.status !== 'verified') {
    throw new Error('Solo las cuentas verificadas pueden publicar productos.');
  }

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .insert({
      seller_id: userId,
      category_id: values.categoryId,
      title: values.title,
      description: values.description,
      price: values.price,
      currency: values.currency,
      status: 'draft',
    })
    .select('id')
    .single();

  if (listingError) {
    throw new Error(`No se pudo crear el borrador del producto. ${getErrorDetails(listingError)}`);
  }

  const listingId = listing.id;
  const paths = photos.map((_, index) => `${userId}/${listingId}/photo-${index + 1}.jpg`);
  const attemptedPaths: string[] = [];
  let publicationOutcomeIsUncertain = false;

  try {
    onProgress({ phase: 'saving', completed: 0, total: photos.length });

    if (paths.length > 0) {
      const { error: imagesError } = await supabase.from('listing_images').insert(
        paths.map((path, index) => ({
          listing_id: listingId,
          path,
          position: index + 1,
        }))
      );

      if (imagesError) {
        throw new Error(`No se pudieron preparar las fotos. ${getErrorDetails(imagesError)}`);
      }
    }

    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      const path = paths[index];
      const file = new File(photo.uri);
      const currentSize = file.size;

      if (currentSize === null || currentSize > MAX_LISTING_PHOTO_BYTES) {
        throw new Error(`La foto ${index + 1} supera el límite de 512 KiB.`);
      }

      onProgress({ phase: 'uploading', completed: index, total: photos.length });
      attemptedPaths.push(path);

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, await file.arrayBuffer(), {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          `No se pudo subir la foto ${index + 1}. ${getErrorDetails(uploadError)}`
        );
      }

      onProgress({ phase: 'uploading', completed: index + 1, total: photos.length });
    }

    onProgress({ phase: 'publishing', completed: photos.length, total: photos.length });
    const { error: publishError } = await supabase.rpc('publish_listing', {
      target_listing_id: listingId,
    });

    if (publishError) {
      const { data: currentListing, error: statusError } = await supabase
        .from('listings')
        .select('status')
        .eq('id', listingId)
        .maybeSingle();

      if (!statusError && currentListing?.status === 'active') {
        return listingId;
      }

      if (statusError) {
        publicationOutcomeIsUncertain = true;
        throw new Error(
          'No se pudo confirmar si el producto llegó a publicarse. No lo envíes otra vez todavía; revisa tus publicaciones cuando estén disponibles.'
        );
      }

      throw new Error(`No se pudo publicar el producto. ${getErrorDetails(publishError)}`);
    }

    return listingId;
  } catch (error) {
    if (publicationOutcomeIsUncertain) {
      throw error;
    }

    const originalMessage =
      error instanceof Error ? error.message : `No se pudo publicar el producto. ${getErrorDetails(error)}`;

    try {
      let photoCleanupError: string | null = null;
      if (attemptedPaths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .remove(attemptedPaths);

        if (removeError) {
          photoCleanupError = getErrorDetails(removeError);
        }
      }

      const { error: discardError } = await supabase.rpc('discard_incomplete_listing', {
        target_listing_id: listingId,
      });

      if (discardError) {
        throw new Error(
          [
            photoCleanupError,
            getErrorDetails(discardError),
          ]
            .filter(Boolean)
            .join(' ')
        );
      }
    } catch (cleanupError) {
      throw new Error(
        `${originalMessage} Además, no se pudo terminar la limpieza: ${getErrorDetails(cleanupError)} El borrador permanece oculto y no se mostrará a otros miembros.`
      );
    }

    throw new Error(`${originalMessage} Se eliminaron los archivos y el borrador incompleto.`);
  }
}
