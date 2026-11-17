import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Button,
  Chip,
  Dialog,
  HelperText,
  Portal,
  RadioButton,
  Text,
  useTheme,
} from 'react-native-paper';

import { AccountRequiredSheet } from '@/features/auth/AccountRequiredSheet';
import { useAuth } from '@/features/auth/AuthProvider';
import { ReportDialog } from '@/features/reports/ReportDialog';
import { getSupabaseClient } from '@/lib/supabase';
import {
  fetchListingDetail,
  formatListingPrice,
} from './listingQueries';

type ListingAction = 'contact' | 'favorite' | 'report' | 'rate';

export function ListingDetailScreen({ listingId }: { listingId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ resume?: string | string[] }>();
  const { width } = useWindowDimensions();
  const [isReportVisible, setIsReportVisible] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isContacting, setIsContacting] = useState(false);
  const [isAccountSheetVisible, setIsAccountSheetVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<ListingAction>('contact');
  const [isRatingVisible, setIsRatingVisible] = useState(false);
  const [ratingValue, setRatingValue] = useState('5');
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const resumedIntent = useRef<string | null>(null);
  const resumeValue = Array.isArray(params.resume) ? params.resume[0] : params.resume;
  const resumeAction: ListingAction | null =
    resumeValue === 'contact' ||
    resumeValue === 'favorite' ||
    resumeValue === 'report' ||
    resumeValue === 'rate'
      ? resumeValue
      : null;
  const detail = useQuery({
    queryKey: ['listing-detail', listingId],
    enabled: Boolean(listingId),
    queryFn: () => fetchListingDetail(listingId),
  });

  const favoriteQuery = useQuery({
    queryKey: ['listing-favorite', session?.user.id, listingId],
    enabled: Boolean(session?.user.id && detail.data && !detail.data.isOwnListing),
    queryFn: async () => {
      if (!session?.user.id) throw new Error('Inicia sesión para consultar tus favoritos.');
      const { data, error } = await getSupabaseClient()
        .from('listing_favorites')
        .select('listing_id')
        .eq('user_id', session.user.id)
        .eq('listing_id', listingId)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });

  const ratingQuery = useQuery({
    queryKey: ['listing-rating', session?.user.id, listingId],
    enabled: Boolean(session?.user.id && detail.data && !detail.data.isOwnListing),
    queryFn: async () => {
      if (!session?.user.id) throw new Error('Inicia sesión para consultar tu calificación.');
      const { data, error } = await getSupabaseClient()
        .from('listing_ratings')
        .select('rating')
        .eq('user_id', session.user.id)
        .eq('listing_id', listingId)
        .maybeSingle();
      if (error) throw error;
      return data?.rating ?? null;
    },
  });

  const openAccountSheet = useCallback((action: ListingAction) => {
    setPendingAction(action);
    setIsAccountSheetVisible(true);
  }, []);

  function navigateToAuth(destination: '/sign-up' | '/sign-in') {
    setIsAccountSheetVisible(false);
    const returnTo = `/listing/${listingId}?resume=${pendingAction}`;
    router.push({ pathname: destination, params: { returnTo } });
  }

  const contactSeller = useCallback(async () => {
    if (!session?.user.id) {
      openAccountSheet('contact');
      return;
    }
    setIsContacting(true);
    setWhatsappError(null);
    try {
      const { data, error } = await getSupabaseClient().rpc('request_whatsapp_contact', {
        target_listing_id: listingId,
      });
      if (error) throw error;
      if (typeof data !== 'string' || !/^https:\/\/wa\.me\/[0-9]+$/.test(data)) {
        throw new Error('El servidor no devolvió un enlace de contacto válido.');
      }
      await Linking.openURL(data);
    } catch (error) {
      setWhatsappError(
        error instanceof Error
          ? error.message
          : 'No se pudo abrir WhatsApp. Comprueba tu conexión e inténtalo otra vez.'
      );
    } finally {
      setIsContacting(false);
    }
  }, [listingId, openAccountSheet, session?.user.id]);

  const toggleFavorite = useCallback(async () => {
    if (!session?.user.id) {
      openAccountSheet('favorite');
      return;
    }
    setActionError(null);
    try {
      const { error } = await getSupabaseClient().rpc('toggle_listing_favorite', {
        target_listing_id: listingId,
        should_favorite: !favoriteQuery.data,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({
        queryKey: ['listing-favorite', session.user.id, listingId],
      });
    } catch {
      setActionError('No se pudo actualizar tu favorito. Inténtalo otra vez.');
    }
  }, [favoriteQuery.data, listingId, openAccountSheet, queryClient, session]);

  function startReport() {
    if (!session?.user.id) {
      openAccountSheet('report');
      return;
    }
    setIsReportVisible(true);
  }

  function startRating() {
    if (!session?.user.id) {
      openAccountSheet('rate');
      return;
    }
    setRatingMessage(null);
    setRatingValue(String(ratingQuery.data ?? 5));
    setIsRatingVisible(true);
  }

  async function submitRating() {
    if (!session?.user.id) return;
    setRatingMessage(null);
    const rating = Number(ratingValue);
    const { error } = await getSupabaseClient().from('listing_ratings').upsert(
      { user_id: session.user.id, listing_id: listingId, rating },
      { onConflict: 'user_id,listing_id' }
    );
    if (error) {
      setRatingMessage('No se pudo guardar tu calificación. Inténtalo otra vez.');
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: ['listing-rating', session.user.id, listingId],
    });
    setIsRatingVisible(false);
  }

  useEffect(() => {
    if (!session?.user.id || !resumeAction || resumedIntent.current === resumeValue) return;
    if (resumeAction === 'favorite' && favoriteQuery.isPending) return;
    if (resumeAction === 'rate' && ratingQuery.isPending) return;
    const timeout = setTimeout(() => {
      resumedIntent.current = resumeValue ?? null;
      router.setParams({ resume: undefined });
      switch (resumeAction) {
        case 'contact':
          void contactSeller();
          break;
        case 'favorite':
          void toggleFavorite();
          break;
        case 'report':
          setIsReportVisible(true);
          break;
        case 'rate':
          setRatingValue(String(ratingQuery.data ?? 5));
          setIsRatingVisible(true);
          break;
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [
    session?.user.id,
    resumeAction,
    resumeValue,
    favoriteQuery.isPending,
    ratingQuery.data,
    ratingQuery.isPending,
    contactSeller,
    toggleFavorite,
    router,
  ]);

  if (detail.isPending) {
    return (
      <SafeAreaView style={styles.state}>
        <ActivityIndicator />
        <Text variant="bodyMedium">Cargando producto…</Text>
      </SafeAreaView>
    );
  }

  if (detail.isError) {
    return (
      <SafeAreaView style={styles.state}>
        <Text variant="bodyMedium">
          No se pudo cargar el producto. Comprueba tu conexión e inténtalo otra vez.
        </Text>
        <Button mode="outlined" onPress={() => void detail.refetch()}>
          Reintentar
        </Button>
        <Button onPress={() => router.back()}>Volver</Button>
      </SafeAreaView>
    );
  }

  if (!detail.data) {
    return (
      <SafeAreaView style={styles.state}>
        <Text variant="bodyMedium">Este producto ya no está disponible.</Text>
        <Button onPress={() => router.back()}>Volver a las ofertas</Button>
      </SafeAreaView>
    );
  }

  const product = detail.data;
  const canShowListingActions = !session?.user.id || !product.isOwnListing;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Volver a las ofertas"
        >
          Volver
        </Button>
        {product.photos.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.photoCarousel}
          >
            {product.photos.map((photo) => (
              <ExpoImage
                key={photo.path}
                source={{ uri: photo.url }}
                cachePolicy="memory-disk"
                contentFit="contain"
                style={[styles.photo, { width: width - 32 }]}
                accessibilityLabel={`Foto ${photo.position} de ${product.title}`}
              />
            ))}
          </ScrollView>
        ) : (
          <View
            style={[
              styles.noPhoto,
              { backgroundColor: theme.colors.surfaceVariant, width: width - 32 },
            ]}
          >
            <Text variant="bodyMedium">Este producto no tiene fotos.</Text>
          </View>
        )}
        {product.photos.length > 1 ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Desliza para ver las {product.photos.length} fotos.
          </Text>
        ) : null}
        <Text variant="headlineSmall" style={styles.title}>
          {product.title}
        </Text>
        <Text variant="displaySmall" style={[styles.price, { color: theme.colors.primary }]}>
          {formatListingPrice(product.price, product.currency)}
        </Text>
        {product.previousPrice !== null ? (
          <View style={styles.offerRow}>
            <Text variant="bodyMedium" style={styles.previousPrice}>
              {formatListingPrice(product.previousPrice, product.currency)}
            </Text>
            <Chip compact>
              -{Math.round((1 - product.price / product.previousPrice) * 100)}%
            </Chip>
          </View>
        ) : null}
        {product.status === 'sold' ? <Chip compact>Vendido</Chip> : null}
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Categoría: {product.categoryName}
        </Text>
        <Text variant="titleMedium">Descripción</Text>
        <Text variant="bodyLarge">{product.description || 'El vendedor no agregó una descripción.'}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Publicado por {product.sellerName}
        </Text>
        <View
          style={[
            styles.safetyBox,
            { backgroundColor: theme.colors.secondaryContainer },
          ]}
        >
          <SymbolView
            name={{ ios: 'exclamationmark.shield.fill', android: 'shield', web: 'shield' }}
            tintColor={theme.colors.onSecondaryContainer}
            size={24}
          />
          <View style={styles.safetyText}>
            <Text variant="titleSmall" style={{ color: theme.colors.onSecondaryContainer }}>
              Compra con cuidado
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSecondaryContainer }}>
              No pagues por adelantado, reúnete en lugares públicos.
            </Text>
          </View>
        </View>
        {product.status === 'active' && canShowListingActions ? (
          <Button
            mode="contained"
            loading={isContacting}
            disabled={isContacting}
            contentStyle={styles.whatsappButton}
            icon={({ color, size }) => (
              <SymbolView
                name={{ ios: 'message.fill', android: 'chat', web: 'chat' }}
                tintColor={color}
                size={size}
              />
            )}
            onPress={() => void contactSeller()}
          >
            Contactar por WhatsApp
          </Button>
        ) : null}
        {whatsappError ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {whatsappError}
          </Text>
        ) : null}
        {canShowListingActions ? (
          <View style={styles.actions}>
            <Button mode={favoriteQuery.data ? 'contained-tonal' : 'outlined'} onPress={() => void toggleFavorite()}>
              {favoriteQuery.data ? 'Quitar de favoritos' : 'Guardar favorito'}
            </Button>
            <Button mode="text" onPress={startRating}>
              {ratingQuery.data ? `Tu calificación: ${ratingQuery.data} ★` : 'Calificar'}
            </Button>
            {!reportSent ? (
              <Button mode="text" onPress={startReport}>
                Reportar publicación
              </Button>
            ) : null}
          </View>
        ) : null}
        {actionError ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {actionError}
          </Text>
        ) : null}
        {reportSent ? (
          <Text variant="bodyMedium">Gracias. El reporte fue enviado a moderación.</Text>
        ) : null}
        {session?.user.id && !product.isOwnListing ? (
          <ReportDialog
            listingId={product.id}
            reporterId={session.user.id}
            visible={isReportVisible}
            onDismiss={() => setIsReportVisible(false)}
            onReported={() => setReportSent(true)}
          />
        ) : null}
        {session?.user.id && !product.isOwnListing ? (
          <Portal>
            <Dialog visible={isRatingVisible} onDismiss={() => setIsRatingVisible(false)}>
              <Dialog.Title>Califica esta publicación</Dialog.Title>
              <Dialog.Content>
                <Text variant="bodyMedium">¿Qué te pareció esta compra?</Text>
                <RadioButton.Group value={ratingValue} onValueChange={setRatingValue}>
                  <View style={styles.ratingOptions}>
                    {['1', '2', '3', '4', '5'].map((value) => (
                      <RadioButton.Item
                        key={value}
                        label={`${value} ★`}
                        value={value}
                        style={styles.ratingOption}
                      />
                    ))}
                  </View>
                </RadioButton.Group>
                {ratingMessage ? (
                  <HelperText type="error" visible>
                    {ratingMessage}
                  </HelperText>
                ) : null}
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setIsRatingVisible(false)}>Cancelar</Button>
                <Button onPress={() => void submitRating()}>Guardar</Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        ) : null}
      </ScrollView>
      <AccountRequiredSheet
        visible={isAccountSheetVisible}
        onDismiss={() => setIsAccountSheetVisible(false)}
        onRegister={() => navigateToAuth('/sign-up')}
        onSignIn={() => navigateToAuth('/sign-in')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    gap: 12,
    padding: 16,
  },
  title: {
    fontWeight: '700',
    marginTop: 8,
  },
  price: {
    fontWeight: '800',
    marginVertical: 4,
  },
  offerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  previousPrice: {
    textDecorationLine: 'line-through',
  },
  actions: {
    gap: 4,
  },
  ratingOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  ratingOption: {
    paddingHorizontal: 0,
    width: '20%',
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  photoCarousel: {
    marginHorizontal: -16,
  },
  photo: {
    height: 320,
  },
  noPhoto: {
    alignItems: 'center',
    height: 240,
    justifyContent: 'center',
  },
  safetyBox: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    marginVertical: 8,
    padding: 16,
  },
  safetyText: {
    flex: 1,
    gap: 4,
  },
  whatsappButton: {
    minHeight: 54,
  },
  state: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
});
