import { z } from 'zod';

import { getSupabaseClient } from '@/lib/supabase';

const publicStoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  logo_path: z.string().nullable(),
  description: z.string().nullable(),
  neighborhood: z.string(),
  opening_hours: z.string().nullable(),
  social_url: z.string().nullable(),
  member_since: z.string(),
  rating_average: z.union([z.number(), z.string()]).transform(Number),
  review_count: z.union([z.number(), z.string()]).transform(Number),
  follower_count: z.union([z.number(), z.string()]).transform(Number),
  is_following: z.boolean(),
  is_own_store: z.boolean(),
});

const storeListingSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  price: z.union([z.number(), z.string()]).transform(Number),
  previous_price: z.union([z.number(), z.string()]).transform(Number).nullable(),
  currency: z.enum(['BOB', 'USD', 'ARS']),
  created_at: z.string(),
  status: z.enum(['active', 'sold']),
});

const storeReviewSchema = z.object({
  id: z.string().uuid(),
  rating: z.number().int(),
  comment: z.string().nullable(),
  reviewer_name: z.string(),
  created_at: z.string(),
});

const listingImageSchema = z.object({
  listing_id: z.string().uuid(),
  path: z.string().min(1),
  position: z.number().int(),
});

const featuredStoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  logo_path: z.string().nullable(),
  neighborhood: z.string(),
  rating_average: z.union([z.number(), z.string()]).transform(Number),
  review_count: z.union([z.number(), z.string()]).transform(Number),
});

const ownStoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  logo_path: z.string().nullable(),
  description: z.string().nullable(),
  neighborhood: z.string(),
  opening_hours: z.string().nullable(),
  social_url: z.string().nullable(),
});

export type PublicStore = z.infer<typeof publicStoreSchema>;
export type StoreListing = z.infer<typeof storeListingSchema> & {
  isNew: boolean;
  thumbnailUrl: string | null;
};
export type StoreReview = z.infer<typeof storeReviewSchema>;
export type FeaturedStore = z.infer<typeof featuredStoreSchema>;
export type OwnStore = z.infer<typeof ownStoreSchema>;

function parseArray<T>(schema: z.ZodType<T>, value: unknown, label: string): T[] {
  const parsed = z.array(schema).safeParse(value);
  if (!parsed.success) throw new Error(`La respuesta de ${label} no tiene el formato esperado.`);
  return parsed.data;
}

export function getStoreLogoUrl(path: string | null): string | null {
  if (!path) return null;
  const { data } = getSupabaseClient().storage.from('miocase-store-logos').getPublicUrl(path);
  return data.publicUrl;
}

export async function fetchPublicStore(storeId: string): Promise<PublicStore | null> {
  const { data, error } = await getSupabaseClient().rpc('get_public_store', {
    target_store_id: storeId,
  });
  if (error) throw error;
  return parseArray(publicStoreSchema, data, 'la tienda')[0] ?? null;
}

export async function fetchStoreListings(storeId: string): Promise<StoreListing[]> {
  const { data, error } = await getSupabaseClient().rpc('get_public_store_listings', {
    target_store_id: storeId,
    page_size: 20,
  });
  if (error) throw error;
  const rows = parseArray(storeListingSchema, data, 'los productos de la tienda');
  const listingIds = rows.map((row) => row.id);
  const { data: imageData, error: imageError } = listingIds.length
    ? await getSupabaseClient().rpc('get_public_listing_images', {
        target_listing_ids: listingIds,
      })
    : { data: [], error: null };
  if (imageError) throw imageError;
  const images = parseArray(listingImageSchema, imageData, 'las fotos de la tienda');
  const firstImages = images.filter((image) => image.position === 1);
  const signedUrls = new Map<string, string>();
  if (firstImages.length > 0) {
    const paths = firstImages.map((image) => image.path);
    const { data: signedData, error: signedError } = await getSupabaseClient()
      .storage.from('miocase-listing-photos')
      .createSignedUrls(paths, 60 * 60);
    if (signedError) throw signedError;
    signedData.forEach((result, index) => {
      if (result.error || !result.signedUrl) {
        throw new Error(`No se pudo preparar la foto "${paths[index]}" para mostrarla.`);
      }
      signedUrls.set(paths[index], result.signedUrl);
    });
  }
  const thumbnailByListingId = new Map(
    firstImages.map((image) => [image.listing_id, signedUrls.get(image.path) ?? null])
  );
  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    isNew: now - new Date(row.created_at).getTime() < 3 * 24 * 60 * 60 * 1000,
    thumbnailUrl: thumbnailByListingId.get(row.id) ?? null,
  }));
}

export async function fetchStoreReviews(storeId: string): Promise<StoreReview[]> {
  const { data, error } = await getSupabaseClient().rpc('get_public_store_reviews', {
    target_store_id: storeId,
    page_size: 20,
  });
  if (error) throw error;
  return parseArray(storeReviewSchema, data, 'las reseñas de la tienda');
}

export async function fetchFeaturedStores(): Promise<FeaturedStore[]> {
  const { data, error } = await getSupabaseClient().rpc('get_featured_stores', {
    page_size: 6,
  });
  if (error) throw error;
  return parseArray(featuredStoreSchema, data, 'las tiendas destacadas');
}

export async function fetchMyStore(): Promise<OwnStore | null> {
  const { data, error } = await getSupabaseClient().rpc('get_my_store');
  if (error) throw error;
  return parseArray(ownStoreSchema, data, 'tu tienda')[0] ?? null;
}

export async function fetchFavoriteListings() {
  const schema = z.object({
    id: z.string().uuid(),
    title: z.string(),
    price: z.union([z.number(), z.string()]).transform(Number),
    previous_price: z.union([z.number(), z.string()]).transform(Number).nullable(),
    currency: z.enum(['BOB', 'USD', 'ARS']),
    created_at: z.string(),
    store_id: z.string().uuid().nullable(),
    store_name: z.string(),
    store_logo_path: z.string().nullable(),
    status: z.enum(['active', 'sold']),
  });
  const { data, error } = await getSupabaseClient().rpc('get_my_favorite_listings', {
    page_size: 50,
  });
  if (error) throw error;
  const rows = parseArray(schema, data, 'tus favoritos');
  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    isNew: now - new Date(row.created_at).getTime() < 3 * 24 * 60 * 60 * 1000,
  }));
}

export async function saveMyStore(input: {
  id: string | null;
  name: string;
  description: string;
  neighborhood: string;
  openingHours: string;
  socialUrl: string;
}): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('upsert_my_store', {
    target_store_id: input.id,
    store_name: input.name.trim(),
    store_description: input.description.trim() || null,
    store_neighborhood: input.neighborhood.trim(),
    store_opening_hours: input.openingHours.trim() || null,
    store_social_url: input.socialUrl.trim() || null,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('No se pudo guardar la tienda.');
  return data;
}

export async function setMyStoreLogo(storeId: string, path: string | null): Promise<void> {
  const { error } = await getSupabaseClient().rpc('set_my_store_logo', {
    target_store_id: storeId,
    target_logo_path: path,
  });
  if (error) throw error;
}
