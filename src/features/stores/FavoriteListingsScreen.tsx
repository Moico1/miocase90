import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/design/AppButton';
import { Badge } from '@/design/Badge';
import { EmptyState } from '@/design/EmptyState';
import { ScreenHeader } from '@/design/ScreenHeader';
import { font, radius, space } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthPage } from '@/features/auth/AuthPage';
import { formatListingPrice } from '@/features/listings/listingQueries';
import { fetchFavoriteListings } from './storeQueries';

export function FavoriteListingsScreen() {
  const c = useTokens();
  const router = useRouter();
  const { session } = useAuth();
  const favorites = useQuery({
    queryKey: ['my-favorite-listings', session?.user.id],
    enabled: Boolean(session?.user.id),
    queryFn: fetchFavoriteListings,
  });

  if (!session?.user.id) {
    return (
      <AuthPage title="Mis favoritos" subtitle="Crea tu cuenta gratis para guardar productos.">
        <AppButton label="Registrarme" onPress={() => router.push('/sign-up')} />
        <AppButton
          label="Ya tengo cuenta"
          variant="secondary"
          onPress={() => router.push('/sign-in')}
        />
      </AuthPage>
    );
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: c.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <AppButton label="Volver" variant="secondary" onPress={() => router.back()} />
        <ScreenHeader title="Mis favoritos" />
        {favorites.isPending ? (
          <Text variant="bodyMedium">Cargando tus productos guardados…</Text>
        ) : favorites.isError ? (
          <EmptyState
            title="No se pudieron cargar tus favoritos"
            message="Comprueba tu conexión e inténtalo otra vez."
            actionLabel="Reintentar"
            onAction={() => void favorites.refetch()}
          />
        ) : favorites.data.length === 0 ? (
          <EmptyState
            title="Todavía no guardaste productos"
            message="Explora el catálogo y guarda tus ofertas favoritas."
            icon="heart-outline"
          />
        ) : (
          favorites.data.map((listing) => {
            const storeId = listing.store_id;
            return (
              <FavoriteCard
                key={listing.id}
                listing={listing}
                onOpen={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })}
                onOpenStore={storeId
                  ? () => router.push({ pathname: '/store/[id]', params: { id: storeId } })
                  : undefined}
              />
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FavoriteCard({
  listing,
  onOpen,
  onOpenStore,
}: {
  listing: Awaited<ReturnType<typeof fetchFavoriteListings>>[number];
  onOpen: () => void;
  onOpenStore?: () => void;
}) {
  const c = useTokens();
  return (
    <Card mode="outlined" onPress={onOpen} style={styles.favoriteCard}>
      <Card.Content style={styles.card}>
        <Text variant="titleMedium">{listing.title}</Text>
        <Text style={[styles.price, { color: c.primary }]}>
          {formatListingPrice(listing.price, listing.currency)}
        </Text>
        <View style={styles.chips}>
          {listing.previous_price !== null ? <Badge label="Oferta" /> : null}
          {listing.status === 'sold' ? (
            <Badge label="Vendido" backgroundColor={c.ink} color={c.background} />
          ) : null}
          {listing.isNew ? (
            <Badge label="Nuevo" backgroundColor={c.accent} color={c.onAccent} />
          ) : null}
        </View>
        {onOpenStore ? (
          <Button
            mode="outlined"
            style={styles.storeButton}
            onPress={(event) => {
              event.stopPropagation();
              onOpenStore();
            }}
          >
            {listing.store_name}
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { gap: space.md, padding: space.lg },
  favoriteCard: { borderRadius: radius.lg, borderWidth: 1 },
  storeButton: { minHeight: 48, justifyContent: 'center' },
  card: { gap: space.sm },
  price: { fontFamily: font.heavy, fontSize: 20, lineHeight: 28 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
