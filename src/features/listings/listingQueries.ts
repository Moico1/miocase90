import { z } from 'zod';

import { getSupabaseClient } from '@/lib/supabase';

const PHOTO_BUCKET = 'miocase-listing-photos';
const SIGNED_URL_SECONDS = 60 * 60;
const PAGE_SIZE = 12;

const listingRowSchema = z.object({
  id: z.string().uuid(),
  seller_id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  price: z
    .union([z.number(), z.string()])
    .transform(Number)
    .refine((value) => Number.isFinite(value)),
  currency: z.enum(['BOB', 'USD', 'ARS']),
  category_id: z.number().int(),
  category_name: z.string(),
  created_at: z.string(),
});

const listingImageSchema = z.object({
  listing_id: z.string().uuid(),
  path: z.string().min(1),
  position: z.number().int(),
});

const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

const profileSchema = z.object({
  display_name: z.string(),
});

const contactSchema = z.object({
  whatsapp: z.string().nullable(),
  show_whatsapp: z.boolean(),
});

export type FeedCursor = {
  createdAt: string;
  id: string;
};

export type ListingCard = {
  id: string;
  sellerId: string;
  title: string;
  description: string | null;
  price: number;
  currency: 'BOB' | 'USD' | 'ARS';
  categoryId: number;
  categoryName: string;
  createdAt: string;
  thumbnailUrl: string | null;
};

export type FeedPage = {
  items: ListingCard[];
  nextCursor: FeedCursor | null;
};

export type ListingDetail = Omit<ListingCard, 'thumbnailUrl'> & {
  sellerName: string;
  whatsapp: string | null;
  showWhatsapp: boolean;
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
  const { data, error } = await getSupabaseClient()
    .from('categories')
    .select('id, name')
    .order('name');

  if (error) throw error;
  return parseResponse(z.array(categorySchema), data, 'las categorías');
}

export async function fetchFeedPage(options: {
  searchText: string;
  categoryId: number | null;
  cursor: FeedCursor | null;
}): Promise<FeedPage> {
  const { data, error } = await getSupabaseClient().rpc('search_active_listings', {
    search_text: options.searchText.trim() || null,
    category_filter: options.categoryId,
    cursor_created_at: options.cursor?.createdAt ?? null,
    cursor_id: options.cursor?.id ?? null,
    page_size: PAGE_SIZE + 1,
  });

  if (error) throw error;

  const rows = parseResponse(z.array(listingRowSchema), data, 'las publicaciones');
  const hasMore = rows.length > PAGE_SIZE;
  const visibleRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const listingIds = visibleRows.map((row) => row.id);
  const { data: imageData, error: imageError } = listingIds.length
    ? await getSupabaseClient()
        .from('listing_images')
        .select('listing_id, path, position')
        .in('listing_id', listingIds)
        .eq('position', 1)
    : { data: [], error: null };

  if (imageError) throw imageError;
  const imageRows = parseResponse(z.array(listingImageSchema), imageData, 'las miniaturas');
  const signedUrls = await createSignedUrlMap(imageRows.map((image) => image.path));
  const thumbnailByListingId = new Map(
    imageRows.map((image) => [image.listing_id, signedUrls.get(image.path) ?? null])
  );
  const items = visibleRows.map((row) => ({
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    description: row.description,
    price: row.price,
    currency: row.currency,
    categoryId: row.category_id,
    categoryName: row.category_name,
    createdAt: row.created_at,
    thumbnailUrl: thumbnailByListingId.get(row.id) ?? null,
  }));
  const lastItem = visibleRows[visibleRows.length - 1];

  return {
    items,
    nextCursor:
      hasMore && lastItem
        ? { createdAt: lastItem.created_at, id: lastItem.id }
        : null,
  };
}

export async function fetchListingDetail(listingId: string): Promise<ListingDetail | null> {
  const client = getSupabaseClient();
  const { data: listingData, error: listingError } = await client
    .from('listings')
    .select('id, seller_id, title, description, price, currency, category_id, created_at')
    .eq('id', listingId)
    .eq('status', 'active')
    .maybeSingle();

  if (listingError) throw listingError;
  if (!listingData) return null;

  const [categoryResult, imageResult, profileResult, contactResult] = await Promise.all([
    client.from('categories').select('name').eq('id', listingData.category_id).maybeSingle(),
    client
      .from('listing_images')
      .select('listing_id, path, position')
      .eq('listing_id', listingId)
      .order('position'),
    client.from('profiles').select('display_name').eq('id', listingData.seller_id).maybeSingle(),
    client
      .from('profile_contacts')
      .select('whatsapp, show_whatsapp')
      .eq('user_id', listingData.seller_id)
      .maybeSingle(),
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (imageResult.error) throw imageResult.error;
  if (profileResult.error) throw profileResult.error;
  if (contactResult.error) throw contactResult.error;

  const category = parseResponse(
    categorySchema.pick({ name: true }),
    categoryResult.data,
    'la categoría'
  );
  const images = parseResponse(z.array(listingImageSchema), imageResult.data, 'las fotos');
  const profile = parseResponse(profileSchema, profileResult.data, 'el perfil del vendedor');
  const contact = contactResult.data
    ? parseResponse(contactSchema, contactResult.data, 'el contacto del vendedor')
    : null;
  const signedUrls = await createSignedUrlMap(images.map((image) => image.path));
  const listing = parseResponse(
    listingRowSchema,
    {
      ...listingData,
      category_name: category.name,
    },
    'la publicación'
  );

  return {
    id: listing.id,
    sellerId: listing.seller_id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    categoryId: listing.category_id,
    categoryName: listing.category_name,
    createdAt: listing.created_at,
    sellerName: profile.display_name,
    whatsapp: contact?.whatsapp ?? null,
    showWhatsapp: contact?.show_whatsapp === true,
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
