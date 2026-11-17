import { z } from 'zod';

import { getSupabaseClient } from '@/lib/supabase';

const PHOTO_BUCKET = 'miocase-listing-photos';
const SIGNED_URL_SECONDS = 60 * 60;
const PAGE_SIZE = 12;

const listingRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  price: z
    .union([z.number(), z.string()])
    .transform(Number)
    .refine((value) => Number.isFinite(value)),
  currency: z.enum(['BOB', 'USD', 'ARS']),
  previous_price: z.union([z.number(), z.string()]).transform(Number).nullable(),
  category_id: z.number().int(),
  category_name: z.string(),
  created_at: z.string(),
  seller_name: z.string(),
  status: z.enum(['active', 'sold']),
});

const listingImageSchema = z.object({
  listing_id: z.string().uuid(),
  path: z.string().min(1),
  position: z.number().int(),
});

const listingDetailRowSchema = listingRowSchema.extend({
  is_own_listing: z.boolean().nullable().transform((isOwnListing) => isOwnListing ?? false),
});

const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

export type FeedCursor = {
  createdAt: string;
  id: string;
  price: number;
};

export type ListingCard = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  previousPrice: number | null;
  currency: 'BOB' | 'USD' | 'ARS';
  categoryId: number;
  categoryName: string;
  createdAt: string;
  sellerName: string;
  status: 'active' | 'sold';
  thumbnailUrl: string | null;
};

export type FeedPage = {
  items: ListingCard[];
  nextCursor: FeedCursor | null;
};

export type ListingDetail = Omit<ListingCard, 'thumbnailUrl'> & {
  isOwnListing: boolean;
  photos: { path: string; url: string; position: number }[];
};

export type CategoryOption = z.infer<typeof categorySchema>;

function parseResponse<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`La respuesta de ${label} no tiene el formato esperado.`);
  }
  return parsed.data;
}

async function createSignedUrlMap(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const { data, error } = await getSupabaseClient()
    .storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);

  if (error) throw error;

  const urls = new Map<string, string>();
  data.forEach((result, index) => {
    const path = result.path ?? paths[index];
    if (result.error || !result.signedUrl) {
      throw new Error(`No se pudo preparar la foto "${path}" para mostrarla.`);
    }
    urls.set(path, result.signedUrl);
  });
  return urls;
}

export async function fetchListingCategories(): Promise<CategoryOption[]> {
  const { data, error } = await getSupabaseClient().rpc('get_public_categories');

  if (error) throw error;
  return parseResponse(z.array(categorySchema), data, 'las categorías');
}

export async function fetchFeedPage(options: {
  searchText: string;
  categoryId: number | null;
  cursor: FeedCursor | null;
  sortOrder: 'recent' | 'cheapest';
}): Promise<FeedPage> {
  const { data, error } = await getSupabaseClient().rpc('search_active_listings', {
    search_text: options.searchText.trim() || null,
    category_filter: options.categoryId,
    cursor_created_at: options.cursor?.createdAt ?? null,
    cursor_id: options.cursor?.id ?? null,
    cursor_price: options.cursor?.price ?? null,
    page_size: PAGE_SIZE + 1,
    sort_order: options.sortOrder,
  });

  if (error) throw error;

  const rows = parseResponse(z.array(listingRowSchema), data, 'las publicaciones');
  const hasMore = rows.length > PAGE_SIZE;
  const visibleRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const listingIds = visibleRows.map((row) => row.id);
  const { data: imageData, error: imageError } = listingIds.length
    ? await getSupabaseClient().rpc('get_public_listing_images', {
        target_listing_ids: listingIds,
      })
    : { data: [], error: null };

  if (imageError) throw imageError;
  const imageRows = parseResponse(z.array(listingImageSchema), imageData, 'las miniaturas');
  const firstImages = imageRows.filter((image) => image.position === 1);
  const signedUrls = await createSignedUrlMap(firstImages.map((image) => image.path));
  const thumbnailByListingId = new Map(
    firstImages.map((image) => [image.listing_id, signedUrls.get(image.path) ?? null])
  );
  const items = visibleRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    previousPrice: row.previous_price,
    currency: row.currency,
    categoryId: row.category_id,
    categoryName: row.category_name,
    createdAt: row.created_at,
    sellerName: row.seller_name,
    status: row.status,
    thumbnailUrl: thumbnailByListingId.get(row.id) ?? null,
  }));
  const lastItem = visibleRows[visibleRows.length - 1];

  return {
    items,
    nextCursor:
      hasMore && lastItem
        ? { createdAt: lastItem.created_at, id: lastItem.id, price: lastItem.price }
        : null,
  };
}

export async function fetchListingDetail(listingId: string): Promise<ListingDetail | null> {
  const client = getSupabaseClient();
  const { data: listingData, error: listingError } = await client.rpc(
    'get_public_listing_detail',
    { target_listing_id: listingId }
  );

  if (listingError) throw listingError;
  const parsedListingRows = parseResponse(
    z.array(listingDetailRowSchema),
    listingData,
    'la publicación'
  );
  const listingDataRow = parsedListingRows[0];
  if (!listingDataRow) return null;

  const { data: imageData, error: imageError } = await client.rpc(
    'get_public_listing_images',
    { target_listing_ids: [listingId] }
  );

  if (imageError) throw imageError;
  const images = parseResponse(z.array(listingImageSchema), imageData, 'las fotos');
  const signedUrls = await createSignedUrlMap(images.map((image) => image.path));

  return {
    id: listingDataRow.id,
    title: listingDataRow.title,
    description: listingDataRow.description,
    price: listingDataRow.price,
    previousPrice: listingDataRow.previous_price,
    currency: listingDataRow.currency,
    categoryId: listingDataRow.category_id,
    categoryName: listingDataRow.category_name,
    createdAt: listingDataRow.created_at,
    sellerName: listingDataRow.seller_name,
    status: listingDataRow.status,
    isOwnListing: listingDataRow.is_own_listing,
    photos: images.map((image) => {
      const url = signedUrls.get(image.path);
      if (!url) throw new Error('No se pudo preparar una de las fotos del producto.');
      return { path: image.path, url, position: image.position };
    }),
  };
}

export function formatListingPrice(price: number, currency: ListingCard['currency']): string {
  const amount = new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
  return `${currency === 'BOB' ? 'Bs' : currency} ${amount}`;
}
