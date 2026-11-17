import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import { AuthPage } from '@/features/auth/AuthPage';
import { formatListingPrice } from '@/features/listings/listingQueries';
import { fetchFavoriteListings } from './storeQueries';

export function FavoriteListingsScreen() {
  const theme = useTheme();
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
        <Button mode="contained" onPress={() => router.push('/sign-up')}>Registrarme</Button>
        <Button mode="outlined" onPress={() => router.push('/sign-in')}>Ya tengo cuenta</Button>
      </AuthPage>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button onPress={() => router.back()} style={styles.alignStart}>Volver</Button>
        <Text variant="headlineSmall">Mis favoritos</Text>
        {favorites.isPending ? (
          <Text variant="bodyMedium">Cargando tus productos guardados…</Text>
        ) : favorites.isError ? (
          <View style={styles.state}>
            <Text variant="bodyMedium">No se pudieron cargar tus favoritos.</Text>
            <Button onPress={() => void favorites.refetch()}>Reintentar</Button>
          </View>
        ) : favorites.data.length === 0 ? (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Todavía no guardaste productos. Explora el catálogo y toca “Guardar favorito”.
          </Text>
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
  const theme = useTheme();
  return (
    <Card mode="outlined" onPress={onOpen}>
      <Card.Content style={styles.card}>
        <Text variant="titleMedium">{listing.title}</Text>
        <Text variant="titleLarge" style={{ color: theme.colors.primary }}>
          {formatListingPrice(listing.price, listing.currency)}
        </Text>
        <View style={styles.chips}>
          {listing.previous_price !== null ? <Chip compact>Oferta</Chip> : null}
          {listing.status === 'sold' ? <Chip compact>Vendido</Chip> : null}
          {listing.isNew ? <Chip compact>Nuevo</Chip> : null}
        </View>
        {onOpenStore ? (
          <Button compact onPress={(event) => {
            event.stopPropagation();
            onOpenStore();
          }}>
            {listing.store_name}
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { gap: 12, padding: 16 },
  alignStart: { alignSelf: 'flex-start' },
  state: { alignItems: 'center', gap: 8, padding: 12 },
  card: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
