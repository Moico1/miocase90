import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import { BrandLogo } from '@/components/BrandLogo';
import { AppButton } from '@/design/AppButton';
import { Badge } from '@/design/Badge';
import { Chip } from '@/design/Chip';
import { EmptyState } from '@/design/EmptyState';
import { ListingCard as ListingCardView } from '@/design/ListingCard';
import { ScreenHeader } from '@/design/ScreenHeader';
import { SectionHeader } from '@/design/SectionHeader';
import { Skeleton } from '@/design/Skeleton';
import { font, palette, radius, space } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchFeaturedStores, getStoreLogoUrl } from '@/features/stores/storeQueries';
import {
  fetchFeedPage,
  fetchListingCategories,
  formatListingPrice,
  type FeedCursor,
  type ListingCard,
} from './listingQueries';

const CONTENT_MAX_WIDTH = 1120;

export function FeedScreen() {
  const c = useTokens();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { session } = useAuth();
  const contentWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH);
  const cardWidth = Math.floor((contentWidth - 32 - space.md) / 2);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<'recent' | 'cheapest'>('recent');
  const [followedOnly, setFollowedOnly] = useState(false);

  const categories = useQuery({
    queryKey: ['listing-categories'],
    queryFn: fetchListingCategories,
  });
  const featuredStores = useQuery({
    queryKey: ['featured-stores'],
    queryFn: fetchFeaturedStores,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  const feedQuery = useInfiniteQuery({
    queryKey: ['active-listings', session?.user.id, debouncedSearch, categoryId, sortOrder, followedOnly],
    initialPageParam: null as FeedCursor | null,
    queryFn: ({ pageParam }) =>
      fetchFeedPage({
        searchText: debouncedSearch,
        categoryId,
        cursor: pageParam,
        sortOrder,
        followedOnly: Boolean(session?.user.id && followedOnly),
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const listings = useMemo(
    () => feedQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [feedQuery.data]
  );
  const isRefreshing = feedQuery.isRefetching && !feedQuery.isFetchingNextPage;

  function openListing(listing: ListingCard) {
    router.push({ pathname: '/listing/[id]', params: { id: listing.id } });
  }

  function renderListing({ item }: { item: ListingCard }) {
    return (
      <ListingCardView
        listing={item}
        priceLabel={formatListingPrice(item.price, item.currency)}
        previousPriceLabel={
          item.previousPrice !== null
            ? formatListingPrice(item.previousPrice, item.currency)
            : undefined
        }
        onOpen={() => openListing(item)}
        onOpenStore={() => {
          if (item.storeId) {
            router.push({ pathname: '/store/[id]', params: { id: item.storeId } });
          }
        }}
        style={{ width: cardWidth }}
      />
    );
  }

  function renderEmptyState() {
    if (feedQuery.isPending) {
      return (
        <View style={styles.skeletonGrid} accessibilityLabel="Cargando publicaciones">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton
              key={index}
              style={[styles.skeletonCard, { width: cardWidth }]}
            >
              <View style={[styles.skeletonImage, { backgroundColor: c.border }]} />
              <View style={styles.skeletonText}>
                <View style={[styles.skeletonLine, { backgroundColor: c.border }]} />
                <View style={[styles.skeletonShortLine, { backgroundColor: c.border }]} />
              </View>
            </Skeleton>
          ))}
        </View>
      );
    }

    if (feedQuery.isError) {
      return (
        <EmptyState
          title="No se pudieron cargar las publicaciones"
          message="Comprueba tu conexión e inténtalo otra vez."
          icon="wifi-alert"
          actionLabel="Reintentar"
          onAction={() => void feedQuery.refetch()}
        />
      );
    }

    return (
      <EmptyState
        title={debouncedSearch || categoryId !== null ? 'Sin resultados' : 'Aún no hay ofertas'}
        message={
          debouncedSearch || categoryId !== null
            ? 'No encontramos productos con esos filtros.'
            : 'Cuando haya publicaciones activas, aparecerán aquí.'
        }
      />
    );
  }

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: c.background }]}
    >
      <View style={styles.frame}>
        <FlatList
          data={listings}
          numColumns={2}
          columnWrapperStyle={styles.cardRow}
          keyExtractor={(item) => item.id}
          renderItem={renderListing}
          style={styles.listFlex}
          contentContainerStyle={listings.length ? styles.list : styles.emptyList}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.brandHeader}>
                <View style={styles.brandRow}>
                  <BrandLogo variant="compact" />
                  <Text style={[styles.tagline, { color: c.inkMuted }]}>
                    Bueno, bonito, barato
                  </Text>
                </View>
                <View style={[styles.locationChip, { backgroundColor: c.surfaceMuted }]}>
                  <MaterialCommunityIcons name="map-marker" size={14} color={c.primary} />
                  <Text style={[styles.locationLabel, { color: c.primary }]}>Yacuiba, BO</Text>
                </View>
              </View>
              <View style={styles.brandStripe}>
                <View style={{ backgroundColor: palette.red, flex: 1 }} />
                <View style={{ backgroundColor: palette.yellow, flex: 1 }} />
                <View style={{ backgroundColor: palette.green, flex: 1 }} />
              </View>
              <ScreenHeader title="Encuentra tu próxima oferta" />
              <View style={styles.searchRow}>
                <View
                  style={[
                    styles.searchBox,
                    { backgroundColor: c.surface, borderColor: c.border },
                  ]}
                >
                  <MaterialCommunityIcons name="magnify" size={24} color={c.inkMuted} />
                  <TextInput
                    accessibilityLabel="Buscar productos por texto"
                    placeholder="Buscar productos"
                    placeholderTextColor={c.inkMuted}
                    maxLength={80}
                    value={searchText}
                    onChangeText={setSearchText}
                    returnKeyType="search"
                    style={[styles.searchInput, { color: c.ink }]}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ordenar productos. Orden actual: ${
                    sortOrder === 'recent' ? 'más recientes' : 'más baratos'
                  }`}
                  onPress={() =>
                    setSortOrder((current) => (current === 'recent' ? 'cheapest' : 'recent'))
                  }
                  style={({ pressed }) => [
                    styles.sortButton,
                    {
                      backgroundColor: c.surface,
                      borderColor: c.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="sort-variant" size={22} color={c.primary} />
                </Pressable>
              </View>
              {categories.isError ? (
                <Text style={[styles.statusMessage, { color: c.danger }]}>
                  No se pudieron cargar las categorías. Puedes seguir viendo todas las ofertas.
                </Text>
              ) : null}
              {feedQuery.isError && listings.length > 0 ? (
                <Text style={[styles.statusMessage, { color: c.danger }]}>
                  No se pudieron actualizar las ofertas. Se muestran los resultados guardados.
                </Text>
              ) : null}
              <FlatList
                horizontal
                data={categories.data ?? []}
                keyExtractor={(category) => String(category.id)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipList}
                ListHeaderComponent={
                  <Chip
                    label="Todas"
                    selected={categoryId === null}
                    onPress={() => setCategoryId(null)}
                  />
                }
                renderItem={({ item: category }) => (
                  <Chip
                    label={category.name}
                    selected={categoryId === category.id}
                    onPress={() =>
                      setCategoryId((current) => (current === category.id ? null : category.id))
                    }
                  />
                )}
              />
              {featuredStores.data?.length ? (
                <View style={styles.featuredSection}>
                  <SectionHeader title="Tiendas destacadas" />
                  <FlatList
                    horizontal
                    data={featuredStores.data}
                    keyExtractor={(store) => store.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredList}
                    renderItem={({ item: store }) => {
                      const logoUrl = getStoreLogoUrl(store.logo_path);
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Ver tienda ${store.name}`}
                          onPress={() =>
                            router.push({ pathname: '/store/[id]', params: { id: store.id } })
                          }
                          style={({ pressed }) => [
                            styles.featuredStore,
                            { opacity: pressed ? 0.8 : 1 },
                          ]}
                        >
                          <View style={[styles.featuredAvatar, { borderColor: c.primary }]}>
                            {logoUrl ? (
                              <ExpoImage
                                source={{ uri: logoUrl }}
                                style={styles.featuredLogo}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                              />
                            ) : (
                              <Text style={[styles.avatarLetter, { color: c.primary }]}>
                                {store.name.slice(0, 1).toLocaleUpperCase()}
                              </Text>
                            )}
                            <View
                              style={[styles.verifiedBadge, { backgroundColor: c.surface }]}
                              accessibilityLabel="Tienda verificada"
                            >
                              <MaterialCommunityIcons
                                name="check-decagram"
                                size={18}
                                color={c.primary}
                              />
                            </View>
                          </View>
                          <Text
                            numberOfLines={1}
                            style={[styles.featuredName, { color: c.ink }]}
                          >
                            {store.name}
                          </Text>
                          {store.review_count === 0 ? (
                            <Badge
                              label="Nueva tienda"
                              backgroundColor={c.accent}
                              color={c.onAccent}
                            />
                          ) : (
                            <Text style={[styles.rating, { color: c.inkMuted }]}>
                              ★ {store.rating_average.toFixed(1)}
                            </Text>
                          )}
                        </Pressable>
                      );
                    }}
                  />
                </View>
              ) : null}
              <View style={styles.feedSection}>
                <Chip
                  label="Tiendas que sigo"
                  selected={Boolean(session?.user.id && followedOnly)}
                  disabled={!session?.user.id}
                  onPress={() => setFollowedOnly((current) => !current)}
                />
                <SectionHeader title="Ofertas para ti" />
              </View>
            </View>
          }
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={
            feedQuery.isFetchingNextPage ? (
              <View style={styles.footer}>
                <ActivityIndicator color={c.primary} />
                <Text style={[styles.statusMessage, { color: c.inkMuted }]}>
                  Cargando más productos…
                </Text>
              </View>
            ) : feedQuery.isFetchNextPageError ? (
              <View style={styles.footer}>
                <Text style={[styles.statusMessage, { color: c.danger }]}>
                  No se pudieron cargar más productos. Comprueba tu conexión.
                </Text>
                <AppButton
                  label="Reintentar"
                  variant="secondary"
                  onPress={() => void feedQuery.fetchNextPage()}
                />
              </View>
            ) : undefined
          }
          onEndReached={() => {
            if (
              feedQuery.hasNextPage &&
              !feedQuery.isFetchingNextPage &&
              !feedQuery.isFetchNextPageError
            ) {
              void feedQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.45}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void feedQuery.refetch()}
              tintColor={c.primary}
              colors={[c.primary]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    alignItems: 'center',
    flex: 1,
  },
  frame: {
    flex: 1,
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  brandHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  tagline: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  locationChip: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.xs,
    minHeight: 32,
    paddingHorizontal: space.sm,
  },
  locationLabel: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  brandStripe: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 3,
    overflow: 'hidden',
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    flex: 1,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.lg,
  },
  searchInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 48,
    paddingVertical: 0,
  },
  sortButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
    minHeight: 52,
    width: 52,
  },
  listFlex: {
    flex: 1,
  },
  header: {
    gap: space.lg,
    paddingBottom: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  featuredSection: {
    gap: space.sm,
  },
  featuredList: {
    alignItems: 'flex-start',
    gap: space.md,
  },
  featuredStore: {
    alignItems: 'center',
    gap: space.xs,
    minHeight: 120,
    width: 88,
  },
  featuredAvatar: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  featuredLogo: {
    borderRadius: radius.pill,
    height: 50,
    width: 50,
  },
  avatarLetter: {
    fontFamily: font.heavy,
    fontSize: 22,
  },
  verifiedBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: -5,
    top: -5,
    width: 22,
  },
  featuredName: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    width: '100%',
  },
  rating: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  feedSection: {
    gap: space.sm,
  },
  chipList: {
    alignItems: 'center',
    gap: space.sm,
  },
  list: {
    paddingBottom: space.xl,
  },
  emptyList: {
    flexGrow: 1,
  },
  cardRow: {
    alignItems: 'flex-start',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  separator: {
    height: space.md,
  },
  statusMessage: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  skeletonCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  skeletonImage: {
    aspectRatio: 4 / 5,
  },
  skeletonText: {
    gap: space.sm,
    padding: space.md,
  },
  skeletonLine: {
    borderRadius: radius.sm,
    height: 14,
    width: '90%',
  },
  skeletonShortLine: {
    borderRadius: radius.sm,
    height: 18,
    width: '55%',
  },
});
