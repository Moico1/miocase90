import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Searchbar, Text, useTheme } from 'react-native-paper';

import { BrandLogo } from '@/components/BrandLogo';
import {
  fetchFeedPage,
  fetchListingCategories,
  formatListingPrice,
  type FeedCursor,
  type ListingCard,
} from './listingQueries';

export function FeedScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<'recent' | 'cheapest'>('recent');

  const categories = useQuery({
    queryKey: ['listing-categories'],
    queryFn: fetchListingCategories,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  const feedQuery = useInfiniteQuery({
    queryKey: ['active-listings', debouncedSearch, categoryId, sortOrder],
    initialPageParam: null as FeedCursor | null,
    queryFn: ({ pageParam }) =>
      fetchFeedPage({
        searchText: debouncedSearch,
        categoryId,
        cursor: pageParam,
        sortOrder,
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
      <Card
        mode="outlined"
        onPress={() => openListing(item)}
        style={styles.card}
        accessibilityLabel={`Ver ${item.title}`}
      >
        {item.thumbnailUrl ? (
          <ExpoImage
            source={{ uri: item.thumbnailUrl }}
            cachePolicy="memory-disk"
            contentFit="cover"
            style={styles.thumbnail}
            accessibilityLabel={`Foto de ${item.title}`}
          />
        ) : (
          <View
            style={[styles.thumbnail, styles.noImage, { backgroundColor: theme.colors.surfaceVariant }]}
          >
            <Text variant="bodyMedium">Sin foto</Text>
          </View>
        )}
        <Card.Content style={styles.cardContent}>
          <Text variant="titleMedium" numberOfLines={2}>
            {item.title}
          </Text>
          <Text variant="titleLarge" style={[styles.price, { color: theme.colors.primary }]}>
            {formatListingPrice(item.price, item.currency)}
          </Text>
          {item.previousPrice !== null ? (
            <View style={styles.offerRow}>
              <Text variant="bodySmall" style={styles.previousPrice}>
                {formatListingPrice(item.previousPrice, item.currency)}
              </Text>
              <Chip compact selectedColor={theme.colors.onSecondaryContainer} style={{ backgroundColor: theme.colors.secondaryContainer }}>
                -{Math.round((1 - item.price / item.previousPrice) * 100)}%
              </Chip>
            </View>
          ) : null}
          {item.status === 'sold' ? (
            <Chip compact selected>
              Vendido
            </Chip>
          ) : null}
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.categoryName}
          </Text>
        </Card.Content>
      </Card>
    );
  }

  function renderEmptyState() {
    if (feedQuery.isPending) {
      return (
        <View style={styles.skeletonGrid} accessibilityLabel="Cargando publicaciones">
          {Array.from({ length: 4 }, (_, index) => (
            <View
              key={index}
              style={[styles.skeletonCard, { backgroundColor: theme.colors.surface }]}
            >
              <View style={[styles.skeletonImage, { backgroundColor: theme.colors.surfaceVariant }]} />
              <View style={styles.skeletonText}>
                <View style={[styles.skeletonLine, { backgroundColor: theme.colors.surfaceVariant }]} />
                <View style={[styles.skeletonShortLine, { backgroundColor: theme.colors.surfaceVariant }]} />
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (feedQuery.isError) {
      return (
        <View style={styles.state}>
          <Text variant="bodyMedium">
            No se pudieron cargar las publicaciones. Comprueba tu conexión e inténtalo otra vez.
          </Text>
          <Button mode="outlined" onPress={() => void feedQuery.refetch()}>
            Reintentar
          </Button>
        </View>
      );
    }

    return (
      <View style={styles.state}>
        <Text variant="bodyMedium">
          {debouncedSearch || categoryId !== null
            ? 'No encontramos productos con esos filtros.'
            : 'Aún no hay publicaciones activas.'}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <FlatList
        data={listings}
        numColumns={2}
        columnWrapperStyle={styles.cardRow}
        keyExtractor={(item) => item.id}
        renderItem={renderListing}
        contentContainerStyle={listings.length ? styles.list : styles.emptyList}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.brandHeading}>
              <BrandLogo variant="compact" />
              <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
                YACUIBA · BUENO, BONITO, BARATO
              </Text>
            </View>
            <View style={styles.headingRow}>
              <View style={styles.heading}>
                <Text variant="headlineSmall">Encuentra tu próxima oferta</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Compra y vende dentro de la comunidad.
                </Text>
              </View>
              <Button
                mode="contained"
                contentStyle={styles.publishButtonContent}
                icon={({ color, size }) => (
                  <SymbolView
                    name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}
                    tintColor={color}
                    size={size}
                  />
                )}
                onPress={() => router.push('/publish')}
              >
                Publicar
              </Button>
            </View>
            <Searchbar
              placeholder="Buscar productos"
              maxLength={80}
              value={searchText}
              onChangeText={setSearchText}
              accessibilityLabel="Buscar productos por texto"
            />
            {categories.isError ? (
              <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                No se pudieron cargar las categorías. Puedes seguir viendo todas las ofertas.
              </Text>
            ) : null}
            {feedQuery.isError && listings.length > 0 ? (
              <Text variant="bodySmall" style={{ color: theme.colors.error }}>
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
                <Chip selected={categoryId === null} onPress={() => setCategoryId(null)}>
                  Todas
                </Chip>
              }
              renderItem={({ item: category }) => (
                <Chip
                  selected={categoryId === category.id}
                  onPress={() =>
                    setCategoryId((current) => (current === category.id ? null : category.id))
                  }
                >
                  {category.name}
                </Chip>
              )}
            />
            <View style={styles.sortOptions}>
              <Chip
                selected={sortOrder === 'recent'}
                onPress={() => setSortOrder('recent')}
              >
                Más recientes
              </Chip>
              <Chip
                selected={sortOrder === 'cheapest'}
                onPress={() => setSortOrder('cheapest')}
              >
                Más baratos
              </Chip>
            </View>
          </View>
        }
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={
          feedQuery.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator />
              <Text variant="bodySmall">Cargando más productos…</Text>
            </View>
          ) : feedQuery.isFetchNextPageError ? (
            <View style={styles.footer}>
              <Text variant="bodySmall">
                No se pudieron cargar más productos. Comprueba tu conexión.
              </Text>
              <Button mode="outlined" onPress={() => void feedQuery.fetchNextPage()}>
                Reintentar
              </Button>
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
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    gap: 14,
    padding: 16,
  },
  brandHeading: {
    alignItems: 'flex-start',
    gap: 3,
  },
  sortOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  offerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  previousPrice: {
    textDecorationLine: 'line-through',
  },
  publishButtonContent: {
    minHeight: 48,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  heading: {
    flex: 1,
    gap: 4,
  },
  chipList: {
    alignItems: 'center',
    gap: 8,
  },
  list: {
    paddingBottom: 20,
  },
  emptyList: {
    flexGrow: 1,
  },
  cardRow: {
    gap: 12,
    paddingHorizontal: 16,
  },
  card: {
    flex: 1,
    overflow: 'hidden',
  },
  thumbnail: {
    height: 148,
    width: '100%',
  },
  noImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  price: {
    fontWeight: '800',
  },
  separator: {
    height: 14,
  },
  state: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  footer: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
  },
  skeletonCard: {
    borderColor: '#75827933',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '48%',
    overflow: 'hidden',
  },
  skeletonImage: {
    height: 148,
  },
  skeletonText: {
    gap: 10,
    padding: 12,
  },
  skeletonLine: {
    borderRadius: 6,
    height: 15,
    width: '90%',
  },
  skeletonShortLine: {
    borderRadius: 6,
    height: 18,
    width: '55%',
  },
});
