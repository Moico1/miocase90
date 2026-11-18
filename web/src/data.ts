import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 20;
const SIGNED_URL_SECONDS = 60 * 60;
const LISTING_BUCKET = 'miocase-listing-photos';
const STORE_LOGO_BUCKET = 'miocase-store-logos';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Currency = 'BOB' | 'USD' | 'ARS';
export type SortOrder = 'recent' | 'cheapest';
export type ListingStatus = 'active' | 'sold';

export interface FeedCursor {
  createdAt: string;
  id: string;
  price: number;
}

export interface ProductCard {
  id: string;
  title: string;
  description: string | null;
  price: number;
  previousPrice: number | null;
  currency: Currency;
  categoryName: string | null;
  createdAt: string;
  status: ListingStatus;
  storeId: string | null;
  storeName: string;
  storeLogoUrl: string | null;
  isNew: boolean;
  thumbnailUrl: string | null;
}

export interface ListingDetail extends ProductCard {
  sellerName: string;
  photos: Array<{ url: string; position: number }>;
}

export interface Category {
  id: number;
  name: string;
}

export interface FeaturedStore {
  id: string;
  name: string;
  logoUrl: string | null;
  neighborhood: string;
  ratingAverage: number;
  reviewCount: number;
}

export interface PublicStore {
  id: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  neighborhood: string;
  openingHours: string | null;
  memberSince: string;
  ratingAverage: number;
  reviewCount: number;
}

export interface StoreReview {
  id: string;
  rating: number;
  comment: string | null;
  reviewerName: string;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`La respuesta de ${label} no tiene el formato esperado.`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numericValue(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`La respuesta de ${label} no tiene el formato esperado.`);
  return parsed;
}

function currencyValue(value: unknown): Currency {
  if (value === 'BOB' || value === 'USD' || value === 'ARS') return value;
  throw new Error('La respuesta de las publicaciones no tiene una moneda válida.');
}

function statusValue(value: unknown): ListingStatus {
  if (value === 'active' || value === 'sold') return value;
  throw new Error('La respuesta de las publicaciones no tiene un estado válido.');
}

function expectRows(data: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(data) || !data.every(isRecord)) {
    throw new Error(`La respuesta de ${label} no tiene el formato esperado.`);
  }
  return data;
}

function getClient(): SupabaseClient {
  if (!client) {
    throw new Error('El catálogo no está disponible porque falta configurar Supabase.');
  }
  return client;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const hasSupabaseConfig =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl?.includes('YOUR_') &&
  !supabaseAnonKey?.includes('YOUR_');
const client = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return client !== null;
}

function parseListing(row: Record<string, unknown>): ProductCard & { sellerName: string } {
  const id = requiredString(row.id, 'las publicaciones');
  if (!UUID_PATTERN.test(id)) throw new Error('La respuesta de las publicaciones no tiene un identificador válido.');
  const createdAt = requiredString(row.created_at, 'las publicaciones');
  const storeLogoPath = nullableString(row.store_logo_path);
  return {
    id,
    title: requiredString(row.title, 'las publicaciones'),
    description: nullableString(row.description),
    price: numericValue(row.price, 'las publicaciones'),
    previousPrice:
      row.previous_price === null || row.previous_price === undefined
        ? null
        : numericValue(row.previous_price, 'las publicaciones'),
    currency: currencyValue(row.currency),
    categoryName: nullableString(row.category_name),
    createdAt,
    status: statusValue(row.status),
    storeId: nullableString(row.store_id),
    storeName: requiredString(row.store_name, 'las publicaciones'),
    storeLogoUrl: storeLogoPath ? getStoreLogoUrl(storeLogoPath) : null,
    isNew: Date.now() - new Date(createdAt).getTime() < 3 * 24 * 60 * 60 * 1000,
    thumbnailUrl: null,
    sellerName: requiredString(row.seller_name, 'las publicaciones'),
  };
}

function parseStoreListing(row: Record<string, unknown>, storeName: string): ProductCard {
  const id = requiredString(row.id, 'los productos de la tienda');
  if (!UUID_PATTERN.test(id)) throw new Error('La respuesta de la tienda no tiene un identificador válido.');
  const createdAt = requiredString(row.created_at, 'los productos de la tienda');
  return {
    id,
    title: requiredString(row.title, 'los productos de la tienda'),
    description: null,
    price: numericValue(row.price, 'los productos de la tienda'),
    previousPrice:
      row.previous_price === null || row.previous_price === undefined
        ? null
        : numericValue(row.previous_price, 'los productos de la tienda'),
    currency: currencyValue(row.currency),
    categoryName: null,
    createdAt,
    status: statusValue(row.status),
    storeId: null,
    storeName,
    storeLogoUrl: null,
    isNew: Date.now() - new Date(createdAt).getTime() < 3 * 24 * 60 * 60 * 1000,
    thumbnailUrl: null,
  };
}

function getStoreLogoUrl(path: string): string | null {
  const { data } = getClient().storage.from(STORE_LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
}

async function getListingImageUrls(listingIds: string[]): Promise<Map<string, string>> {
  if (listingIds.length === 0) return new Map();
  const { data, error } = await getClient().rpc('get_public_listing_images', {
    target_listing_ids: listingIds,
  });
  if (error) throw error;
  const rows = expectRows(data, 'las fotos de las publicaciones');
  const imagePaths = rows.map((row) => ({
    listingId: requiredString(row.listing_id, 'las fotos'),
    path: requiredString(row.path, 'las fotos'),
    position: numericValue(row.position, 'las fotos'),
  }));
  const firstImages = imagePaths.filter((image) => image.position === 1);
  if (firstImages.length === 0) return new Map();
  const paths = firstImages.map((image) => image.path);
  const { data: signedRows, error: signedError } = await getClient()
    .storage.from(LISTING_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (signedError) throw signedError;
  const signedByPath = new Map<string, string>();
  signedRows.forEach((result, index) => {
    if (result.error || !result.signedUrl) {
      throw new Error(`No se pudo preparar la foto "${paths[index]}" para mostrarla.`);
    }
    signedByPath.set(paths[index], result.signedUrl);
  });
  return new Map(
    firstImages.map((image) => [image.listingId, signedByPath.get(image.path) ?? ''])
  );
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await getClient().rpc('get_public_categories');
  if (error) throw error;
  return expectRows(data, 'las categorías').map((row) => ({
    id: numericValue(row.id, 'las categorías'),
    name: requiredString(row.name, 'las categorías'),
  }));
}

export async function fetchFeedPage(options: {
  searchText: string;
  categoryId: number | null;
  cursor: FeedCursor | null;
  sortOrder: SortOrder;
}): Promise<{ items: ProductCard[]; nextCursor: FeedCursor | null }> {
  const { data, error } = await getClient().rpc('search_active_listings', {
    search_text: options.searchText.trim() || null,
    category_filter: options.categoryId,
    cursor_created_at: options.cursor?.createdAt ?? null,
    cursor_id: options.cursor?.id ?? null,
    cursor_price: options.cursor?.price ?? null,
    page_size: PAGE_SIZE,
    sort_order: options.sortOrder,
    followed_only: false,
  });
  if (error) throw error;
  const rows = expectRows(data, 'las publicaciones').map(parseListing);
  const imageUrls = await getListingImageUrls(rows.map((row) => row.id));
  const items = rows.map((row) => ({
    ...row,
    thumbnailUrl: imageUrls.get(row.id) || null,
  }));
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length === PAGE_SIZE && last
        ? { createdAt: last.createdAt, id: last.id, price: last.price }
        : null,
  };
}

export async function fetchListingDetail(id: string): Promise<ListingDetail | null> {
  const { data, error } = await getClient().rpc('get_public_listing_detail', {
    target_listing_id: id,
  });
  if (error) throw error;
  const rows = expectRows(data, 'la publicación');
  if (rows.length === 0) return null;
  const listing = parseListing(rows[0]);
  const { data: imageData, error: imageError } = await getClient().rpc('get_public_listing_images', {
    target_listing_ids: [id],
  });
  if (imageError) throw imageError;
  const imageRows = expectRows(imageData, 'las fotos de la publicación').map((row) => ({
    path: requiredString(row.path, 'las fotos de la publicación'),
    position: numericValue(row.position, 'las fotos de la publicación'),
  }));
  const photos =
    imageRows.length === 0
      ? []
      : await getSignedPhotoUrls(imageRows.map((image) => image.path)).then((urls) =>
          imageRows
            .map((image) => ({ url: urls.get(image.path) ?? '', position: image.position }))
            .filter((image) => image.url)
            .sort((a, b) => a.position - b.position)
        );
  return { ...listing, sellerName: listing.sellerName, photos };
}

async function getSignedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const { data, error } = await getClient()
    .storage.from(LISTING_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) throw error;
  const urls = new Map<string, string>();
  data.forEach((result, index) => {
    if (result.error || !result.signedUrl) {
      throw new Error(`No se pudo preparar la foto "${paths[index]}" para mostrarla.`);
    }
    urls.set(paths[index], result.signedUrl);
  });
  return urls;
}

let categoriesCache: Category[] | null = null;
let categoriesRequest: Promise<Category[]> | null = null;
export async function getCachedCategories(): Promise<Category[]> {
  if (categoriesCache) return categoriesCache;
  if (!categoriesRequest) {
    categoriesRequest = fetchCategories()
      .then((categories) => {
        categoriesCache = categories;
        return categories;
      })
      .finally(() => {
        categoriesRequest = null;
      });
  }
  return categoriesRequest;
}

export async function fetchFeaturedStores(): Promise<FeaturedStore[]> {
  const { data, error } = await getClient().rpc('get_featured_stores', { page_size: 6 });
  if (error) throw error;
  return expectRows(data, 'las tiendas destacadas').map((row) => {
    const logoPath = nullableString(row.logo_path);
    return {
      id: requiredString(row.id, 'las tiendas destacadas'),
      name: requiredString(row.name, 'las tiendas destacadas'),
      logoUrl: logoPath ? getStoreLogoUrl(logoPath) : null,
      neighborhood: requiredString(row.neighborhood, 'las tiendas destacadas'),
      ratingAverage: numericValue(row.rating_average, 'las tiendas destacadas'),
      reviewCount: numericValue(row.review_count, 'las tiendas destacadas'),
    };
  });
}

let featuredStoresCache: FeaturedStore[] | null = null;
let featuredStoresRequest: Promise<FeaturedStore[]> | null = null;
export async function getCachedFeaturedStores(): Promise<FeaturedStore[]> {
  if (featuredStoresCache) return featuredStoresCache;
  if (!featuredStoresRequest) {
    featuredStoresRequest = fetchFeaturedStores()
      .then((stores) => {
        featuredStoresCache = stores;
        return stores;
      })
      .finally(() => {
        featuredStoresRequest = null;
      });
  }
  return featuredStoresRequest;
}

export async function fetchPublicStore(id: string): Promise<PublicStore | null> {
  const { data, error } = await getClient().rpc('get_public_store', {
    target_store_id: id,
  });
  if (error) throw error;
  const rows = expectRows(data, 'la tienda');
  if (rows.length === 0) return null;
  const row = rows[0];
  const logoPath = nullableString(row.logo_path);
  return {
    id: requiredString(row.id, 'la tienda'),
    name: requiredString(row.name, 'la tienda'),
    logoUrl: logoPath ? getStoreLogoUrl(logoPath) : null,
    description: nullableString(row.description),
    neighborhood: requiredString(row.neighborhood, 'la tienda'),
    openingHours: nullableString(row.opening_hours),
    memberSince: requiredString(row.member_since, 'la tienda'),
    ratingAverage: numericValue(row.rating_average, 'la tienda'),
    reviewCount: numericValue(row.review_count, 'la tienda'),
  };
}

export async function fetchStoreListings(
  id: string,
  storeName: string
): Promise<ProductCard[]> {
  const { data, error } = await getClient().rpc('get_public_store_listings', {
    target_store_id: id,
    page_size: PAGE_SIZE,
  });
  if (error) throw error;
  const rows = expectRows(data, 'los productos de la tienda').map((row) =>
    parseStoreListing(row, storeName)
  );
  const imageUrls = await getListingImageUrls(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, thumbnailUrl: imageUrls.get(row.id) || null }));
}

export async function fetchStoreReviews(id: string): Promise<StoreReview[]> {
  const { data, error } = await getClient().rpc('get_public_store_reviews', {
    target_store_id: id,
    page_size: PAGE_SIZE,
  });
  if (error) throw error;
  return expectRows(data, 'las reseñas de la tienda').map((row) => ({
    id: requiredString(row.id, 'las reseñas'),
    rating: numericValue(row.rating, 'las reseñas'),
    comment: nullableString(row.comment),
    reviewerName: requiredString(row.reviewer_name, 'las reseñas'),
    createdAt: requiredString(row.created_at, 'las reseñas'),
  }));
}
