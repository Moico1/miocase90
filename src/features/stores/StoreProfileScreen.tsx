import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import {
  Button,
  Card,
  Chip,
  Dialog,
  HelperText,
  Portal,
  RadioButton,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { AccountRequiredSheet } from '@/features/auth/AccountRequiredSheet';
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
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[]; resume?: string | string[] }>();
  const storeId = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';
  const resume = Array.isArray(params.resume) ? params.resume[0] : params.resume;
  const { session } = useAuth();
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
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        <View style={styles.skeletonHeader}>
          <View style={[styles.skeletonLogo, { backgroundColor: theme.colors.surfaceVariant }]} />
          <View style={[styles.skeletonLine, { backgroundColor: theme.colors.surfaceVariant }]} />
          <View style={[styles.skeletonShortLine, { backgroundColor: theme.colors.surfaceVariant }]} />
        </View>
        <View style={styles.productGrid}>
          {Array.from({ length: 4 }, (_, index) => (
            <View key={index} style={styles.skeletonCard}>
              <View style={[styles.skeletonImage, { backgroundColor: theme.colors.surfaceVariant }]} />
              <View style={[styles.skeletonLine, { backgroundColor: theme.colors.surfaceVariant }]} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }
  if (storeQuery.isError) {
    return (
      <SafeAreaView style={styles.state}>
        <Text>No se pudo cargar la tienda.</Text>
        <Button onPress={() => void storeQuery.refetch()}>Reintentar</Button>
      </SafeAreaView>
    );
  }
  if (!storeQuery.data) {
    return (
      <SafeAreaView style={styles.state}>
        <Text>Esta tienda no está disponible.</Text>
        <Button onPress={() => router.back()}>Volver</Button>
      </SafeAreaView>
    );
  }

  const store = storeQuery.data;
  const logoUri = getStoreLogoUrl(store.logo_path);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button onPress={() => router.back()} style={styles.alignStart}>Volver</Button>
        <View style={styles.storeHeader}>
          {logoUri ? (
            <ExpoImage
              source={{ uri: logoUri }}
              style={styles.logo}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityLabel={`Logo de ${store.name}`}
            />
          ) : null}
          <Text variant="headlineSmall">{store.name}</Text>
          <Chip icon="check-decagram">Vendedor verificado</Chip>
          <Text variant="bodyMedium">{store.neighborhood}</Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            ★ {store.rating_average.toFixed(1)} · {store.review_count} reseñas ·{' '}
            {store.follower_count} seguidores
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Miembro desde {new Date(store.member_since).toLocaleDateString('es-BO')}
          </Text>
          {store.description ? <Text variant="bodyMedium">{store.description}</Text> : null}
          {store.opening_hours ? <Text variant="bodyMedium">Horario: {store.opening_hours}</Text> : null}
          {store.social_url ? (
            <Button compact onPress={() => void openSocialLink(store.social_url ?? '')}>
              Ver redes sociales
            </Button>
          ) : null}
          <View style={styles.actionRow}>
            {!store.is_own_store ? (
              <Button
                mode={store.is_following ? 'outlined' : 'contained'}
                loading={followMutation.isPending}
                onPress={() => {
                  if (requireAccount('follow')) followMutation.mutate(!store.is_following);
                }}
              >
                {store.is_following ? 'Dejar de seguir' : 'Seguir tienda'}
              </Button>
            ) : null}
            <Button mode="outlined" onPress={() => void shareStore()}>Compartir</Button>
            {!store.is_own_store ? (
              <Button onPress={() => {
                setReportTarget({ type: 'store', id: store.id });
                if (!requireAccount('report')) setReportReason('');
              }}>
                Reportar tienda
              </Button>
            ) : null}
          </View>
        </View>

        {message ? <Text style={{ color: theme.colors.primary }}>{message}</Text> : null}
        {errorMessage ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {errorMessage}
          </Text>
        ) : null}

        <Text variant="titleLarge">Productos de la tienda</Text>
        {listingsQuery.isPending ? (
          <View style={styles.productGrid} accessibilityLabel="Cargando productos de la tienda">
            {Array.from({ length: 4 }, (_, index) => (
              <View key={index} style={styles.skeletonCard}>
                <View style={[styles.skeletonImage, { backgroundColor: theme.colors.surfaceVariant }]} />
                <View style={[styles.skeletonLine, { backgroundColor: theme.colors.surfaceVariant }]} />
              </View>
            ))}
          </View>
        ) : listingsQuery.isError ? (
          <Button onPress={() => void listingsQuery.refetch()}>No se pudieron cargar los productos. Reintentar</Button>
        ) : listingsQuery.data.length === 0 ? (
          <Text variant="bodyMedium">Esta tienda todavía no tiene productos disponibles.</Text>
        ) : (
          <View style={styles.productGrid}>
            {listingsQuery.data.map((listing) => (
              <Card
                key={listing.id}
                mode="outlined"
                style={styles.productCard}
                onPress={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })}
              >
                {listing.thumbnailUrl ? (
                  <ExpoImage
                    source={{ uri: listing.thumbnailUrl }}
                    style={styles.productImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    accessibilityLabel={`Foto de ${listing.title}`}
                  />
                ) : null}
                <Card.Content style={styles.productContent}>
                  <Text variant="titleSmall" numberOfLines={2}>{listing.title}</Text>
                  <Text variant="titleMedium" style={{ color: theme.colors.primary }}>
                    {formatListingPrice(listing.price, listing.currency)}
                  </Text>
                  {listing.previous_price !== null ? (
                    <Chip compact>
                      Oferta · -{Math.round((1 - listing.price / listing.previous_price) * 100)}%
                    </Chip>
                  ) : null}
                  {listing.status === 'sold' ? <Chip compact>Vendido</Chip> : null}
                  {listing.isNew ? <Chip compact>Nuevo</Chip> : null}
                </Card.Content>
              </Card>
            ))}
          </View>
        )}

        <View style={styles.reviewHeading}>
          <Text variant="titleLarge">Reseñas de la tienda</Text>
          {!store.is_own_store ? (
            <Button onPress={() => {
              if (requireAccount('review')) setReviewVisible(true);
            }}>
              {myReviewQuery.data ? 'Editar mi reseña' : 'Escribir reseña'}
            </Button>
          ) : null}
        </View>
        {reviewsQuery.isPending ? (
          <View style={styles.reviewCard} accessibilityLabel="Cargando reseñas">
            {Array.from({ length: 2 }, (_, index) => (
              <View key={index} style={[styles.skeletonLine, { backgroundColor: theme.colors.surfaceVariant }]} />
            ))}
          </View>
        ) : reviewsQuery.isError ? (
          <Button onPress={() => void reviewsQuery.refetch()}>No se pudieron cargar las reseñas. Reintentar</Button>
        ) : reviewsQuery.data.length === 0 ? (
          <Text variant="bodyMedium">Aún no hay reseñas. Tu opinión puede ayudar a otras personas.</Text>
        ) : (
          reviewsQuery.data.map((review) => (
            <Card key={review.id} mode="outlined">
              <Card.Content style={styles.reviewCard}>
                <Text variant="titleSmall">{review.reviewer_name} · {'★'.repeat(review.rating)}</Text>
                {review.comment ? <Text variant="bodyMedium">{review.comment}</Text> : null}
                {!store.is_own_store ? (
                  <Button compact onPress={() => {
                    setReportTarget({ type: 'review', id: review.id });
                    if (!requireAccount('report')) setReportReason('');
                  }}>
                    Reportar reseña
                  </Button>
                ) : null}
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>

      <Portal>
        <Dialog
          visible={reviewVisible || (resume === 'review' && Boolean(session?.user.id))}
          onDismiss={closeReview}
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
            <TextInput
              mode="outlined"
              label="Comentario opcional"
              value={reviewComment ?? myReviewQuery.data?.comment ?? ''}
              onChangeText={setReviewComment}
              maxLength={500}
              multiline
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeReview}>Cancelar</Button>
            <Button onPress={() => void submitReview()}>Guardar reseña</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={reportTarget !== null && Boolean(session?.user.id)} onDismiss={() => setReportTarget(null)}>
          <Dialog.Title>Reportar contenido</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Motivo"
              value={reportReason}
              onChangeText={setReportReason}
              maxLength={300}
              multiline
            />
            <HelperText type="info" visible>Máximo 300 caracteres.</HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setReportTarget(null)}>Cancelar</Button>
            <Button onPress={() => void submitReport()}>Enviar reporte</Button>
          </Dialog.Actions>
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
  safeArea: { flex: 1 },
  content: { gap: 16, padding: 16 },
  alignStart: { alignSelf: 'flex-start' },
  state: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  storeHeader: { alignItems: 'center', gap: 8 },
  logo: { borderRadius: 18, height: 112, width: 112 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  productCard: { flexBasis: '48%', flexGrow: 1 },
  productImage: { height: 128, width: '100%' },
  productContent: { gap: 6, padding: 12 },
  skeletonHeader: { alignItems: 'center', gap: 12, padding: 24 },
  skeletonLogo: { borderRadius: 40, height: 80, width: 80 },
  skeletonLine: { borderRadius: 6, height: 16, width: '80%' },
  skeletonShortLine: { borderRadius: 6, height: 14, width: '45%' },
  skeletonCard: { flexBasis: '48%', flexGrow: 1, gap: 8, padding: 10 },
  skeletonImage: { borderRadius: 10, height: 128 },
  reviewHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  reviewCard: { gap: 8 },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
