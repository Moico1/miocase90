import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import {
  Card,
  Dialog,
  HelperText,
  Portal,
  RadioButton,
  Text,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { AccountRequiredSheet } from '@/features/auth/AccountRequiredSheet';
import { AppButton } from '@/design/AppButton';
import { Badge } from '@/design/Badge';
import { Chip as DesignChip } from '@/design/Chip';
import { EmptyState } from '@/design/EmptyState';
import { ListingCard } from '@/design/ListingCard';
import { ScreenHeader } from '@/design/ScreenHeader';
import { SectionHeader } from '@/design/SectionHeader';
import { Skeleton } from '@/design/Skeleton';
import { font, radius, shadow, space } from '@/design/tokens';
import { TextField } from '@/design/TextField';
import { useTokens } from '@/design/useTokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatListingPrice } from '@/features/listings/listingQueries';
import { getSupabaseClient } from '@/lib/supabase';
import {
  fetchPublicStore,
  fetchStoreListings,
  fetchStoreReviews,
  getStoreLogoUrl,
} from './storeQueries';

type ReportTarget = { type: 'store' | 'review'; id: string } | null;
type PendingStoreAction = 'review' | 'report' | 'follow';

export function StoreProfileScreen() {
  const c = useTokens();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[]; resume?: string | string[] }>();
  const storeId = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';
  const resume = Array.isArray(params.resume) ? params.resume[0] : params.resume;
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 32 - space.md) / 2);
  const [activeTab, setActiveTab] = useState<'products' | 'reviews'>('products');
  const [accountSheet, setAccountSheet] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingStoreAction>('review');
  const [reviewVisible, setReviewVisible] = useState(false);
  const [rating, setRating] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget>(null);
  const [reportReason, setReportReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resumedFollow = useRef(false);

  const storeQuery = useQuery({
    queryKey: ['public-store', storeId],
    enabled: Boolean(storeId),
    queryFn: () => fetchPublicStore(storeId),
  });
  const myReviewQuery = useQuery({
    queryKey: ['my-store-review', session?.user.id, storeId],
    enabled: Boolean(session?.user.id && storeQuery.data && !storeQuery.data.is_own_store),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc('get_my_store_review', {
        target_store_id: storeId,
      });
      if (error) throw error;
      const parsed = z.array(z.object({
        id: z.string().uuid(),
        rating: z.number().int(),
        comment: z.string().nullable(),
      })).safeParse(data);
      if (!parsed.success) throw new Error('No se pudo leer tu reseña guardada.');
      return parsed.data[0] ?? null;
    },
  });
  const listingsQuery = useQuery({
    queryKey: ['public-store-listings', storeId],
    enabled: Boolean(storeId && storeQuery.data),
    queryFn: () => fetchStoreListings(storeId),
  });
  const reviewsQuery = useQuery({
    queryKey: ['public-store-reviews', storeId],
    enabled: Boolean(storeId && storeQuery.data),
    queryFn: () => fetchStoreReviews(storeId),
  });

  const followMutation = useMutation({
    mutationFn: async (shouldFollow: boolean) => {
      const { error } = await getSupabaseClient().rpc('toggle_store_follow', {
        target_store_id: storeId,
        should_follow: shouldFollow,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['public-store', storeId] });
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo actualizar la lista de tiendas seguidas.'
      );
    },
  });
  const followStore = followMutation.mutate;

  useEffect(() => {
    if (resume !== 'follow') {
      resumedFollow.current = false;
      return;
    }
    if (!session?.user.id || resumedFollow.current) return;
    resumedFollow.current = true;
    followStore(true);
    router.setParams({ resume: undefined });
  }, [followStore, resume, router, session?.user.id]);

  function requireAccount(action: PendingStoreAction) {
    if (!session?.user.id) {
      setPendingAction(action);
      setAccountSheet(true);
      return false;
    }
    return true;
  }

  function goToAuth(destination: '/sign-up' | '/sign-in') {
    setAccountSheet(false);
    router.push({
      pathname: destination,
      params: { returnTo: `/store/${storeId}?resume=${pendingAction}` },
    });
  }

  async function submitReview() {
    if (!session?.user.id) {
      setAccountSheet(true);
      return;
    }
    setErrorMessage(null);
    try {
      const { error } = await getSupabaseClient().rpc('submit_store_review', {
        target_store_id: storeId,
        target_rating: Number(rating ?? myReviewQuery.data?.rating ?? 5),
        review_comment: (reviewComment ?? myReviewQuery.data?.comment ?? '').trim() || null,
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['public-store', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['public-store-reviews', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['my-store-review', session.user.id, storeId] }),
      ]);
      closeReview();
      setMessage('Tu reseña fue guardada. Puedes editarla cuando quieras.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo guardar la reseña. Inténtalo otra vez.'
      );
    }
  }

  async function submitReport() {
    if (!session?.user.id) {
      setAccountSheet(true);
      return;
    }
    if (!reportTarget || !reportReason.trim()) {
      setErrorMessage('Escribe un motivo de hasta 300 caracteres.');
      return;
    }
    try {
      const { error } = await getSupabaseClient().rpc('create_content_report', {
        target_type: reportTarget.type,
        target_id: reportTarget.id,
        report_reason: reportReason.trim(),
      });
      if (error) throw error;
      setReportTarget(null);
      setReportReason('');
      setMessage('Gracias. El reporte fue enviado a moderación.');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo enviar el reporte.'
      );
    }
  }

  async function shareStore() {
    try {
      const url = ExpoLinking.createURL(`/store/${storeId}`, { scheme: 'miocase' });
      await Share.share({
        message: `Conoce ${storeQuery.data?.name ?? 'esta tienda'} en Mío CASE: ${url}`,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo compartir la tienda.');
    }
  }

  async function openSocialLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo abrir el enlace de redes.');
    }
  }

  function closeReview() {
    setReviewVisible(false);
    if (resume === 'review') router.setParams({ resume: undefined });
  }

  if (storeQuery.isPending) {
    return (
      <SafeAreaView
        edges={['left', 'right']}
        style={[styles.safeArea, { backgroundColor: c.background }]}
      >
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} style={[styles.skeletonCard, { width: cardWidth }]}>
              <View style={[styles.skeletonImage, { backgroundColor: c.border }]} />
              <View style={[styles.skeletonLine, { backgroundColor: c.border }]} />
            </Skeleton>
          ))}
        </View>
      </SafeAreaView>
    );
  }
  if (storeQuery.isError) {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: c.background }]}>
        <EmptyState
          title="No se pudo cargar la tienda"
          message="Comprueba tu conexión e inténtalo otra vez."
          actionLabel="Reintentar"
          onAction={() => void storeQuery.refetch()}
        />
      </SafeAreaView>
    );
  }
  if (!storeQuery.data) {
    return (
      <SafeAreaView style={[styles.state, { backgroundColor: c.background }]}>
        <EmptyState
          title="Esta tienda no está disponible"
          message="Vuelve a las ofertas para descubrir otras tiendas."
          actionLabel="Volver"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const store = storeQuery.data;
  const logoUri = getStoreLogoUrl(store.logo_path);

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: c.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <AppButton label="Volver" variant="secondary" onPress={() => router.back()} />
        <View style={[styles.cover, { backgroundColor: c.primary }]} />
        <View
          style={[
            styles.storeHeader,
            { backgroundColor: c.surface, borderColor: c.border },
            shadow.card,
          ]}
        >
          <View style={[styles.logoFrame, { backgroundColor: c.surface, borderColor: c.surface }]}>
            {logoUri ? (
              <ExpoImage
                source={{ uri: logoUri }}
                style={styles.logo}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityLabel={`Logo de ${store.name}`}
              />
            ) : (
              <Text style={[styles.logoInitial, { color: c.primary }]}>
                {store.name.slice(0, 1).toLocaleUpperCase()}
              </Text>
            )}
          </View>
          <ScreenHeader title={store.name} subtitle={store.neighborhood} />
          <Badge label="Vendedor verificado" backgroundColor={c.primary} color={c.onPrimary} />
          <Text style={[styles.rating, { color: c.ink }]}>
            ★ {store.rating_average.toFixed(1)} · {store.review_count} reseñas ·{' '}
            {store.follower_count} seguidores
          </Text>
          <Text style={[styles.memberSince, { color: c.inkMuted }]}>
            Miembro desde {new Date(store.member_since).toLocaleDateString('es-BO')}
          </Text>
          {store.description ? <Text variant="bodyMedium">{store.description}</Text> : null}
          {store.opening_hours ? <Text variant="bodyMedium">Horario: {store.opening_hours}</Text> : null}
          <View style={styles.actionRow}>
            {!store.is_own_store ? (
              <AppButton
                label={store.is_following ? 'Dejar de seguir' : 'Seguir tienda'}
                variant={store.is_following ? 'secondary' : 'primary'}
                loading={followMutation.isPending}
                onPress={() => {
                  if (requireAccount('follow')) followMutation.mutate(!store.is_following);
                }}
              />
            ) : null}
            <AppButton label="Compartir" variant="secondary" onPress={() => void shareStore()} />
            {store.social_url ? (
              <AppButton
                label="Ver redes sociales"
                variant="secondary"
                onPress={() => void openSocialLink(store.social_url ?? '')}
              />
            ) : null}
            {!store.is_own_store ? (
              <AppButton
                label="Reportar tienda"
                variant="secondary"
                onPress={() => {
                  setReportTarget({ type: 'store', id: store.id });
                  if (!requireAccount('report')) setReportReason('');
                }}
              />
            ) : null}
          </View>
        </View>

        {message ? <Text style={{ color: c.primary }}>{message}</Text> : null}
        {errorMessage ? (
          <Text accessibilityRole="alert" style={{ color: c.danger }}>
            {errorMessage}
          </Text>
        ) : null}

        <View style={styles.tabs}>
          <DesignChip
            label="Productos"
            selected={activeTab === 'products'}
            onPress={() => setActiveTab('products')}
          />
          <DesignChip
            label="Reseñas"
            selected={activeTab === 'reviews'}
            onPress={() => setActiveTab('reviews')}
          />
        </View>

        {activeTab === 'products' ? (
          <View style={styles.section}>
            <SectionHeader title="Productos de la tienda" />
            {listingsQuery.isPending ? (
              <View style={styles.productGrid} accessibilityLabel="Cargando productos de la tienda">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} style={[styles.skeletonCard, { width: cardWidth }]}>
                    <View style={[styles.skeletonImage, { backgroundColor: c.border }]} />
                    <View style={[styles.skeletonLine, { backgroundColor: c.border }]} />
                  </Skeleton>
                ))}
              </View>
            ) : listingsQuery.isError ? (
              <EmptyState
                title="No se pudieron cargar los productos"
                message="Comprueba tu conexión e inténtalo otra vez."
                actionLabel="Reintentar"
                onAction={() => void listingsQuery.refetch()}
              />
            ) : listingsQuery.data.length === 0 ? (
              <EmptyState
                title="Todavía no hay productos"
                message="Cuando la tienda publique ofertas, aparecerán aquí."
              />
            ) : (
              <View style={styles.productGrid}>
                {listingsQuery.data.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    priceLabel={formatListingPrice(listing.price, listing.currency)}
                    previousPriceLabel={
                      listing.previous_price !== null
                        ? formatListingPrice(listing.previous_price, listing.currency)
                        : undefined
                    }
                    onOpen={() =>
                      router.push({ pathname: '/listing/[id]', params: { id: listing.id } })
                    }
                    style={{ width: cardWidth }}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.reviewHeading}>
              <SectionHeader title="Reseñas de la tienda" />
              {!store.is_own_store ? (
                <AppButton
                  label={myReviewQuery.data ? 'Editar mi reseña' : 'Escribir reseña'}
                  variant="secondary"
                  onPress={() => {
                    if (requireAccount('review')) setReviewVisible(true);
                  }}
                />
              ) : null}
            </View>
            {reviewsQuery.isPending ? (
              <View style={styles.reviewCard} accessibilityLabel="Cargando reseñas">
                {Array.from({ length: 2 }, (_, index) => (
                  <Skeleton key={index} style={styles.reviewSkeleton} />
                ))}
              </View>
            ) : reviewsQuery.isError ? (
              <EmptyState
                title="No se pudieron cargar las reseñas"
                message="Comprueba tu conexión e inténtalo otra vez."
                actionLabel="Reintentar"
                onAction={() => void reviewsQuery.refetch()}
              />
            ) : reviewsQuery.data.length === 0 ? (
              <EmptyState
                title="Aún no hay reseñas"
                message="Tu opinión puede ayudar a otras personas."
              />
            ) : (
              reviewsQuery.data.map((review) => (
                <Card
                  key={review.id}
                  mode="outlined"
                  style={[styles.reviewCardContainer, { backgroundColor: c.surface, borderColor: c.border }]}
                >
                  <Card.Content style={styles.reviewCard}>
                    <Text variant="titleSmall">
                      {review.reviewer_name} · {'★'.repeat(review.rating)}
                    </Text>
                    {review.comment ? <Text variant="bodyMedium">{review.comment}</Text> : null}
                    {!store.is_own_store ? (
                      <AppButton
                        label="Reportar reseña"
                        variant="secondary"
                        onPress={() => {
                          setReportTarget({ type: 'review', id: review.id });
                          if (!requireAccount('report')) setReportReason('');
                        }}
                      />
                    ) : null}
                  </Card.Content>
                </Card>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Portal>
        <Dialog
          visible={reviewVisible || (resume === 'review' && Boolean(session?.user.id))}
          onDismiss={closeReview}
          style={[styles.dialog, { backgroundColor: c.surface }]}
        >
          <Dialog.Title>Reseña de la tienda</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">Elige una calificación y agrega un comentario opcional.</Text>
            <RadioButton.Group
              value={rating ?? String(myReviewQuery.data?.rating ?? 5)}
              onValueChange={setRating}
            >
              <View style={styles.ratingRow}>
                {['1', '2', '3', '4', '5'].map((value) => (
                  <RadioButton.Item key={value} label={`${value} ★`} value={value} />
                ))}
              </View>
            </RadioButton.Group>
            <TextField
              label="Comentario opcional"
              value={reviewComment ?? myReviewQuery.data?.comment ?? ''}
              onChangeText={setReviewComment}
              maxLength={500}
              multiline
              style={styles.multilineInput}
            />
          </Dialog.Content>
          <View style={styles.dialogActions}>
            <AppButton label="Cancelar" variant="secondary" onPress={closeReview} />
            <AppButton label="Guardar reseña" onPress={() => void submitReview()} />
          </View>
        </Dialog>
        <Dialog
          visible={reportTarget !== null && Boolean(session?.user.id)}
          onDismiss={() => setReportTarget(null)}
          style={[styles.dialog, { backgroundColor: c.surface }]}
        >
          <Dialog.Title>Reportar contenido</Dialog.Title>
          <Dialog.Content>
            <TextField
              label="Motivo"
              value={reportReason}
              onChangeText={setReportReason}
              maxLength={300}
              multiline
              style={styles.multilineInput}
            />
            <HelperText type="info" visible>Máximo 300 caracteres.</HelperText>
          </Dialog.Content>
          <View style={styles.dialogActions}>
            <AppButton
              label="Cancelar"
              variant="secondary"
              onPress={() => setReportTarget(null)}
            />
            <AppButton label="Enviar reporte" onPress={() => void submitReport()} />
          </View>
        </Dialog>
      </Portal>
      <AccountRequiredSheet
        visible={accountSheet}
        onDismiss={() => setAccountSheet(false)}
        onRegister={() => goToAuth('/sign-up')}
        onSignIn={() => goToAuth('/sign-in')}
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
  state: {
    alignItems: 'center',
    flex: 1,
    gap: space.lg,
    justifyContent: 'center',
    padding: space.xl,
  },
  cover: {
    borderRadius: radius.xl,
    height: 124,
  },
  storeHeader: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: space.sm,
    marginTop: -56,
    padding: space.lg,
    paddingTop: space.sm,
  },
  logoFrame: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 4,
    height: 104,
    justifyContent: 'center',
    marginBottom: space.xs,
    width: 104,
  },
  logo: {
    borderRadius: radius.pill,
    height: 96,
    width: 96,
  },
  logoInitial: {
    fontFamily: font.heavy,
    fontSize: 36,
  },
  rating: {
    fontFamily: font.semibold,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  memberSince: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  actionRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: space.sm,
  },
  section: {
    gap: space.md,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    padding: space.lg,
  },
  skeletonCard: {
    borderRadius: radius.lg,
    gap: space.md,
    paddingBottom: space.md,
  },
  skeletonImage: {
    aspectRatio: 4 / 5,
  },
  skeletonLine: {
    borderRadius: radius.sm,
    height: 14,
    marginHorizontal: space.md,
    width: '80%',
  },
  reviewHeading: {
    gap: space.sm,
  },
  reviewCardContainer: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: space.sm,
  },
  reviewCard: {
    gap: space.md,
  },
  reviewSkeleton: {
    height: 20,
    width: '90%',
  },
  ratingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
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
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
