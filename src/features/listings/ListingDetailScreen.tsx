import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Card,
  Dialog,
  HelperText,
  Portal,
  RadioButton,
  Text,
} from 'react-native-paper';

import { AccountRequiredSheet } from '@/features/auth/AccountRequiredSheet';
import { AppButton } from '@/design/AppButton';
import { Badge } from '@/design/Badge';
import { EmptyState } from '@/design/EmptyState';
import { font, palette, radius, shadow, space } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { ReportDialog } from '@/features/reports/ReportDialog';
import { ListingComments } from './ListingComments';
import { getSupabaseClient } from '@/lib/supabase';
import {
  fetchListingDetail,
  formatListingPrice,
} from './listingQueries';

type ListingAction = 'contact' | 'favorite' | 'report' | 'rate';

export function ListingDetailScreen({ listingId }: { listingId: string }) {
  const c = useTokens();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ resume?: string | string[] }>();
  const { width } = useWindowDimensions();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
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

  async function shareListing() {
    try {
      const url = ExpoLinking.createURL(`/listing/${listingId}`, { scheme: 'miocase' });
      await Share.share({ message: `Mira ${product.title} en Mío CASE: ${url}` });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'No se pudo compartir el producto.'
      );
    }
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
      <SafeAreaView style={[styles.state, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
        <Text variant="bodyMedium">Cargando producto…</Text>
      </SafeAreaView>
    );
  }

  if (detail.isError) {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: c.background }]}>
        <EmptyState
          title="No se pudo cargar el producto"
          message="Comprueba tu conexión e inténtalo otra vez."
          actionLabel="Reintentar"
          onAction={() => void detail.refetch()}
        />
        <AppButton label="Volver" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (!detail.data) {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: c.background }]}>
        <EmptyState
          title="Este producto ya no está disponible"
          message="Puedes volver a las ofertas para encontrar algo que te guste."
          actionLabel="Volver a las ofertas"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const product = detail.data;
  const storeId = product.storeId;
  const canShowListingActions = !session?.user.id || !product.isOwnListing;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: c.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <AppButton
          label="Volver a las ofertas"
          variant="secondary"
          onPress={() => router.back()}
        />
        {product.photos.length > 0 ? (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.photoCarousel}
              onMomentumScrollEnd={(event) => {
                setActivePhotoIndex(
                  Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width - 32))
                );
              }}
            >
              {product.photos.map((photo) => (
                <ExpoImage
                  key={photo.path}
                  source={{ uri: photo.url }}
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  style={[styles.photo, { width: width - 32 }]}
                  accessibilityLabel={`Foto ${photo.position} de ${product.title}`}
                />
              ))}
            </ScrollView>
            {product.photos.length > 1 ? (
              <View
                style={styles.photoPagination}
                accessibilityLabel={`Foto ${activePhotoIndex + 1} de ${product.photos.length}`}
              >
                {product.photos.map((photo, index) => (
                  <View
                    key={photo.path}
                    style={[
                      styles.photoDot,
                      {
                        backgroundColor: activePhotoIndex === index ? c.primary : c.border,
                        width: activePhotoIndex === index ? 20 : 6,
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View style={[styles.noPhoto, { backgroundColor: c.surfaceMuted, width: width - 32 }]}>
            <MaterialCommunityIcons name="image-off-outline" size={40} color={c.inkMuted} />
            <Text style={{ color: c.inkMuted }}>Este producto no tiene fotos.</Text>
          </View>
        )}
        <Text style={[styles.title, { color: c.ink }]}>{product.title}</Text>
        <Text style={[styles.price, { color: c.primary }]}>
          {formatListingPrice(product.price, product.currency)}
        </Text>
        {product.previousPrice !== null ? (
          <View style={styles.offerRow}>
            <Text style={[styles.previousPrice, { color: c.inkMuted }]}>
              {formatListingPrice(product.previousPrice, product.currency)}
            </Text>
            <Badge
              label={`-${Math.round((1 - product.price / product.previousPrice) * 100)}%`}
              backgroundColor={c.danger}
              color={c.onDanger}
            />
          </View>
        ) : null}
        <View style={styles.badges}>
          {product.status === 'sold' ? (
            <Badge label="Vendido" backgroundColor={c.ink} color={c.background} />
          ) : null}
          {product.isNew ? (
            <Badge label="Nuevo" backgroundColor={c.accent} color={c.onAccent} />
          ) : null}
        </View>
        <Text variant="bodyMedium" style={{ color: c.inkMuted }}>
          Categoría: {product.categoryName}
        </Text>
        <Card mode="contained" style={[styles.descriptionCard, { backgroundColor: c.surface }]}>
          <Card.Content style={styles.descriptionContent}>
            <Text variant="titleMedium">Descripción</Text>
            <Text variant="bodyLarge">
              {product.description || 'El vendedor no agregó una descripción.'}
            </Text>
          </Card.Content>
        </Card>
        {storeId ? (
          <Pressable
            onPress={() => router.push({ pathname: '/store/[id]', params: { id: storeId } })}
            style={[
              styles.storeCard,
              { backgroundColor: c.surface, borderColor: c.border },
              shadow.card,
            ]}
          >
            <View style={[styles.storeAvatar, { backgroundColor: c.surfaceMuted }]}>
              {product.storeLogoUrl ? (
                <ExpoImage
                  source={{ uri: product.storeLogoUrl }}
                  style={styles.storeLogo}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  accessibilityLabel={`Logo de ${product.storeName}`}
                />
              ) : (
                <Text style={[styles.storeInitial, { color: c.primary }]}>
                  {product.storeName.slice(0, 1).toLocaleUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.storeInfo}>
              <Text variant="titleSmall" numberOfLines={1}>{product.storeName}</Text>
              <Badge
                label="Vendedor verificado"
                backgroundColor={palette.greenSoft}
                color={c.primary}
              />
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={c.inkMuted} />
          </Pressable>
        ) : (
          <Text variant="bodyMedium" style={{ color: c.inkMuted }}>
            Publicado por {product.sellerName}
          </Text>
        )}
        <View style={[styles.safetyBox, { backgroundColor: palette.yellowSoft }]}>
          <MaterialCommunityIcons name="shield-alert" color={c.onAccent} size={24} />
          <View style={styles.safetyText}>
            <Text variant="titleSmall" style={{ color: c.onAccent }}>
              Compra con cuidado
            </Text>
            <Text variant="bodyMedium" style={{ color: c.onAccent }}>
              No pagues por adelantado, reúnete en lugares públicos.
            </Text>
          </View>
        </View>
        {product.status === 'active' && canShowListingActions ? (
          <AppButton
            label="Contactar por WhatsApp"
            loading={isContacting}
            disabled={isContacting}
            onPress={() => void contactSeller()}
          />
        ) : null}
        {whatsappError ? (
          <Text accessibilityRole="alert" style={{ color: c.danger }}>
            {whatsappError}
          </Text>
        ) : null}
        {canShowListingActions ? (
          <View style={styles.actions}>
            <AppButton
              label={favoriteQuery.data ? 'Quitar de favoritos' : 'Guardar favorito'}
              variant="secondary"
              onPress={() => void toggleFavorite()}
            />
            <AppButton
              label={ratingQuery.data ? `Tu calificación: ${ratingQuery.data} ★` : 'Calificar'}
              variant="secondary"
              onPress={startRating}
            />
            <AppButton
              label="Compartir producto"
              variant="secondary"
              onPress={() => void shareListing()}
            />
            {!reportSent ? (
              <AppButton
                label="Reportar publicación"
                variant="secondary"
                onPress={startReport}
              />
            ) : null}
          </View>
        ) : null}
        {actionError ? (
          <Text accessibilityRole="alert" style={{ color: c.danger }}>
            {actionError}
          </Text>
        ) : null}
        {reportSent ? (
          <Text variant="bodyMedium">Gracias. El reporte fue enviado a moderación.</Text>
        ) : null}
        <ListingComments listingId={product.id} isOwnListing={product.isOwnListing} />
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
            <Dialog
              visible={isRatingVisible}
              onDismiss={() => setIsRatingVisible(false)}
              style={[styles.dialog, { backgroundColor: c.surface }]}
            >
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
              <View style={styles.dialogActions}>
                <AppButton
                  label="Cancelar"
                  variant="secondary"
                  onPress={() => setIsRatingVisible(false)}
                />
                <AppButton label="Guardar" onPress={() => void submitRating()} />
              </View>
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
    gap: space.lg,
    padding: space.lg,
  },
  title: {
    fontFamily: font.brand,
    fontSize: 26,
    lineHeight: 34,
  },
  price: {
    fontFamily: font.heavy,
    fontSize: 28,
    lineHeight: 36,
  },
  offerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  previousPrice: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    textDecorationLine: 'line-through',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  descriptionCard: {
    borderRadius: radius.lg,
  },
  descriptionContent: {
    gap: space.sm,
    padding: space.lg,
  },
  storeCard: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    minHeight: 80,
    padding: space.md,
  },
  storeAvatar: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  storeLogo: {
    borderRadius: radius.pill,
    height: 48,
    width: 48,
  },
  storeInitial: {
    fontFamily: font.heavy,
    fontSize: 22,
  },
  storeInfo: {
    flex: 1,
    gap: space.xs,
  },
  actions: {
    gap: space.sm,
  },
  ratingOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  ratingOption: {
    minHeight: 48,
    paddingHorizontal: 0,
    width: '20%',
  },
  photoCarousel: {
    marginHorizontal: -16,
  },
  photo: {
    aspectRatio: 1,
  },
  noPhoto: {
    alignItems: 'center',
    aspectRatio: 1,
    gap: space.sm,
    justifyContent: 'center',
  },
  photoPagination: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
  },
  photoDot: {
    borderRadius: radius.pill,
    height: 6,
  },
  safetyBox: {
    alignItems: 'center',
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
  },
  safetyText: {
    flex: 1,
    gap: space.xs,
  },
  state: {
    alignItems: 'center',
    flex: 1,
    gap: space.lg,
    justifyContent: 'center',
    padding: space.xl,
  },
  dialog: {
    borderRadius: radius.xl,
  },
  dialogActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'flex-end',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
});
