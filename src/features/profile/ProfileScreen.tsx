import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Card,
  HelperText,
  Switch,
  Text,
} from 'react-native-paper';
import { z } from 'zod';

import { AdminPanel } from '@/features/admin/AdminPanel';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthPage } from '@/features/auth/AuthPage';
import { useMembership } from '@/features/auth/useMembership';
import { AppButton } from '@/design/AppButton';
import { Badge } from '@/design/Badge';
import { EmptyState } from '@/design/EmptyState';
import { ScreenHeader } from '@/design/ScreenHeader';
import { SectionHeader } from '@/design/SectionHeader';
import { TextField } from '@/design/TextField';
import { font, radius, shadow, space } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';
import {
  profileFormSchema,
  type ProfileFormInput,
  type ProfileFormValues,
} from '@/features/profile/profileSchema';
import { deleteOwnListing } from '@/features/listings/deleteListing';
import { formatListingPrice } from '@/features/listings/listingQueries';
import { getSupabaseClient } from '@/lib/supabase';
import { StoreManager } from '@/features/stores/StoreManager';
import { WhatsAppVerificationManager } from './WhatsAppVerificationManager';

const myListingSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  price: z.union([z.number(), z.string()]).transform(Number),
  currency: z.enum(['BOB', 'USD', 'ARS']),
  status: z.enum(['draft', 'active', 'sold', 'removed']),
});

type MyListing = z.infer<typeof myListingSchema>;

const statusLabels: Record<MyListing['status'], string> = {
  draft: 'Borrador',
  active: 'Activa',
  sold: 'Vendida',
  removed: 'Oculta',
};

function deletionErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'No se pudo eliminar la publicación. Inténtalo otra vez.';
}

export function ProfileScreen() {
  const c = useTokens();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const sellerStatus = useMembership(userId);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [listingActionError, setListingActionError] = useState<string | null>(null);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [sellerRequestError, setSellerRequestError] = useState<string | null>(null);
  const [sellerRequestMessage, setSellerRequestMessage] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ['own-profile', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) throw new Error('Inicia sesión para ver tu perfil.');
      const client = getSupabaseClient();
      const [profileResult, contactResult] = await Promise.all([
        client.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
        client
          .from('profile_contacts')
          .select('whatsapp, whatsapp_verified, show_whatsapp')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (contactResult.error) throw contactResult.error;
      if (!profileResult.data) throw new Error('No se encontró el perfil de esta cuenta.');

      return {
        displayName: profileResult.data.display_name,
        whatsapp: contactResult.data?.whatsapp ?? '',
        whatsappVerified: contactResult.data?.whatsapp_verified ?? false,
        showWhatsapp: contactResult.data?.show_whatsapp ?? false,
      };
    },
  });

  const listingsQuery = useQuery({
    queryKey: ['my-listings', userId],
    enabled: Boolean(userId && sellerStatus.data === 'verified'),
    queryFn: async (): Promise<MyListing[]> => {
      if (!userId) throw new Error('Inicia sesión para ver tus publicaciones.');
      const { data, error } = await getSupabaseClient()
        .from('listings')
        .select('id, title, price, currency, status')
        .eq('seller_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const parsed = z.array(myListingSchema).safeParse(data);
      if (!parsed.success) {
        throw new Error('La lista de publicaciones no tiene el formato esperado.');
      }
      return parsed.data;
    },
  });

  const adminQuery = useQuery({
    queryKey: ['account-is-admin', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc('is_admin');
      if (error) throw error;
      if (typeof data !== 'boolean') {
        throw new Error('No se pudo confirmar el permiso de administración.');
      }
      return data;
    },
  });

  const {
    control,
    formState: { errors },
    handleSubmit,
    reset,
  } = useForm<ProfileFormInput, undefined, ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: '',
      showWhatsapp: false,
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      reset({
        displayName: profileQuery.data.displayName,
        showWhatsapp: profileQuery.data.showWhatsapp,
      });
    }
  }, [profileQuery.data, reset]);

  async function saveProfile(values: ProfileFormValues) {
    if (!userId) {
      setProfileError('Inicia sesión para guardar los cambios.');
      return;
    }

    setProfileError(null);
    setProfileMessage(null);
    setIsSavingProfile(true);

    try {
      const { error } = await getSupabaseClient().rpc('update_my_profile', {
        target_display_name: values.displayName,
        target_whatsapp: profileQuery.data?.whatsapp || null,
        target_show_whatsapp: values.showWhatsapp && Boolean(profileQuery.data?.whatsappVerified),
      });
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['own-profile', userId] });
      setProfileMessage('Perfil actualizado.');
    } catch {
      setProfileError('No se pudo guardar el perfil. Comprueba tu conexión e inténtalo otra vez.');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function markAsSold(listingId: string) {
    setListingActionError(null);
    setBusyListingId(listingId);

    try {
      const { error } = await getSupabaseClient().rpc('change_listing_status', {
        target_listing_id: listingId,
        target_status: 'sold',
      });
      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-listings', userId] }),
        queryClient.invalidateQueries({ queryKey: ['active-listings'] }),
        queryClient.invalidateQueries({ queryKey: ['listing-detail', listingId] }),
      ]);
    } catch {
      setListingActionError('No se pudo marcar como vendida. Actualiza la lista e inténtalo otra vez.');
    } finally {
      setBusyListingId(null);
    }
  }

  async function deleteListing(listingId: string) {
    if (!userId) return;
    setListingActionError(null);
    setBusyListingId(listingId);

    try {
      await deleteOwnListing(userId, listingId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-listings', userId] }),
        queryClient.invalidateQueries({ queryKey: ['active-listings'] }),
        queryClient.invalidateQueries({ queryKey: ['listing-detail', listingId] }),
      ]);
    } catch (error) {
      setListingActionError(deletionErrorMessage(error));
      await queryClient.invalidateQueries({ queryKey: ['my-listings', userId] });
    } finally {
      setBusyListingId(null);
    }
  }

  function confirmDelete(listing: MyListing) {
    const confirmLabel = listing.status === 'removed' ? 'Completar eliminación' : 'Eliminar';
    Alert.alert(
      'Eliminar publicación',
      'La publicación se ocultará inmediatamente. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: confirmLabel,
          style: 'destructive',
          onPress: () => void deleteListing(listing.id),
        },
      ]
    );
  }

  async function handleSignOut() {
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/');
    } catch {
      setSignOutError('No se pudo cerrar sesión. Comprueba tu conexión e inténtalo otra vez.');
    } finally {
      setIsSigningOut(false);
    }
  }

  async function requestSellerStatus() {
    setSellerRequestError(null);
    setSellerRequestMessage(null);
    try {
      const { error } = await getSupabaseClient().rpc('apply_for_seller');
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['community-membership', userId] });
      setSellerRequestMessage('Tu solicitud para vender fue enviada. Te avisaremos cuando se revise.');
    } catch (error) {
      setSellerRequestError(
        error instanceof Error ? error.message : 'No se pudo enviar la solicitud. Inténtalo otra vez.'
      );
    }
  }

  const profileName = profileQuery.data?.displayName || session?.user.email || 'Mi cuenta';
  const profileInitials = profileName.trim().slice(0, 2).toLocaleUpperCase() || 'M';
  const accountLabel =
    sellerStatus.data === 'verified'
      ? 'Vendedor aprobado'
      : sellerStatus.data === 'pending'
        ? 'Solicitud de vendedor pendiente'
        : 'Comprador';

  if (!userId) {
    return (
      <AuthPage
        title="Tu perfil"
        subtitle="Inicia sesión o crea una cuenta gratis para guardar tus datos y publicar."
      >
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.profileHeader, { backgroundColor: c.surface, borderColor: c.border }, shadow.card]}>
          <View style={[styles.avatar, { backgroundColor: c.primary }]}>
            <Text style={[styles.avatarText, { color: c.onPrimary }]}>{profileInitials}</Text>
          </View>
          <View style={styles.profileIdentity}>
            <ScreenHeader title={profileName} />
            <Badge label={accountLabel} backgroundColor={c.primary} color={c.onPrimary} />
            <Text style={[styles.email, { color: c.inkMuted }]}>{session?.user.email}</Text>
          </View>
        </View>

        <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Card.Content style={styles.sectionContent}>
            <View style={styles.sectionHeading}>
              <MaterialCommunityIcons name="account-outline" size={24} color={c.primary} />
              <SectionHeader title="Cuenta de comprador" />
            </View>
            {sellerStatus.data === 'verified' ? (
              <Text variant="bodyMedium">Vendedor aprobado: ya puedes publicar productos.</Text>
            ) : sellerStatus.data === 'pending' ? (
              <Text variant="bodyMedium">
                Tu solicitud para vender está pendiente. Puedes seguir comprando mientras esperas.
              </Text>
            ) : (
              <View style={styles.form}>
                <Text variant="bodyMedium">
                  Comprar es gratis. Para publicar, solicita la aprobación como vendedor.
                </Text>
                <AppButton
                  label="Solicitar ser vendedor"
                  variant="secondary"
                  onPress={() => void requestSellerStatus()}
                />
              </View>
            )}
            {sellerRequestError ? (
              <Text accessibilityRole="alert" style={{ color: c.danger }}>
                {sellerRequestError}
              </Text>
            ) : null}
            {sellerRequestMessage ? (
              <Text accessibilityRole="alert" style={{ color: c.primary }}>
                {sellerRequestMessage}
              </Text>
            ) : null}
          </Card.Content>
        </Card>

        <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Card.Content style={styles.sectionContent}>
            <View style={styles.sectionHeading}>
              <MaterialCommunityIcons name="account-edit-outline" size={24} color={c.primary} />
              <SectionHeader title="Mi perfil" />
            </View>
            {profileQuery.isPending ? (
              <ActivityIndicator color={c.primary} />
            ) : profileQuery.isError ? (
              <EmptyState
                title="No se pudo cargar tu perfil"
                message="Comprueba tu conexión e inténtalo otra vez."
                actionLabel="Reintentar"
                onAction={() => void profileQuery.refetch()}
              />
            ) : (
              <View style={styles.form}>
                <Controller
                  control={control}
                  name="displayName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextField
                      label="Nombre para mostrar"
                      maxLength={60}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.displayName?.message}
                      disabled={isSavingProfile}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="showWhatsapp"
                  render={({ field: { onChange, value } }) => (
                    <View style={styles.switchRow}>
                      <Text variant="bodyMedium">Mostrar WhatsApp en mis publicaciones</Text>
                      <Switch
                        value={value}
                        onValueChange={onChange}
                        disabled={isSavingProfile || !profileQuery.data?.whatsappVerified}
                      />
                    </View>
                  )}
                />
                {!profileQuery.data?.whatsappVerified ? (
                  <HelperText type="info" visible>
                    Primero verifica tu número para poder mostrarlo en tus publicaciones.
                  </HelperText>
                ) : null}
                {profileError ? (
                  <Text accessibilityRole="alert" style={{ color: c.danger }}>
                    {profileError}
                  </Text>
                ) : null}
                {profileMessage ? (
                  <Text accessibilityRole="alert" style={{ color: c.primary }}>
                    {profileMessage}
                  </Text>
                ) : null}
                <AppButton
                  label="Guardar perfil"
                  onPress={() => {
                    void handleSubmit(saveProfile)();
                  }}
                  loading={isSavingProfile}
                  disabled={isSavingProfile}
                />
              </View>
            )}
          </Card.Content>
        </Card>

        <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Card.Content style={styles.sectionContent}>
            <View style={styles.sectionHeading}>
              <MaterialCommunityIcons name="heart-outline" size={24} color={c.primary} />
              <SectionHeader title="Favoritos" />
            </View>
            <AppButton
              label="Ver mis favoritos"
              variant="secondary"
              onPress={() => router.push('/favorites')}
            />
          </Card.Content>
        </Card>

        {sellerStatus.data === 'verified' ? (
          <>
            <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Card.Content style={styles.sectionContent}>
                <View style={styles.sectionHeading}>
                  <MaterialCommunityIcons name="store-outline" size={24} color={c.primary} />
                  <SectionHeader title="Mi tienda" />
                </View>
                <StoreManager />
              </Card.Content>
            </Card>
            <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Card.Content style={styles.sectionContent}>
                <View style={styles.sectionHeading}>
                  <MaterialCommunityIcons name="whatsapp" size={24} color={c.primary} />
                  <SectionHeader title="WhatsApp" />
                </View>
                <WhatsAppVerificationManager
                  key={profileQuery.data?.whatsapp ?? 'no-verified-number'}
                  userId={userId}
                  verifiedNumber={profileQuery.data?.whatsappVerified ? profileQuery.data.whatsapp : null}
                />
              </Card.Content>
            </Card>
            <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Card.Content style={styles.sectionContent}>
                <View style={styles.sectionHeading}>
                  <MaterialCommunityIcons name="tag-multiple-outline" size={24} color={c.primary} />
                  <SectionHeader title="Mis publicaciones" />
                </View>
                {listingsQuery.isPending ? (
                  <ActivityIndicator color={c.primary} />
                ) : listingsQuery.isError ? (
                  <EmptyState
                    title="No se pudieron cargar tus publicaciones"
                    message="Comprueba tu conexión e inténtalo otra vez."
                    actionLabel="Reintentar"
                    onAction={() => void listingsQuery.refetch()}
                  />
                ) : listingsQuery.data.length === 0 ? (
                  <EmptyState
                    title="Todavía no tienes publicaciones"
                    message="Cuando publiques un producto, podrás gestionarlo desde aquí."
                  />
                ) : (
                  listingsQuery.data.map((listing) => (
                    <Card
                      key={listing.id}
                      mode="outlined"
                      style={[styles.listingCardContainer, { backgroundColor: c.surface, borderColor: c.border }]}
                    >
                      <Card.Content style={styles.listingCard}>
                        <Text variant="titleMedium">{listing.title}</Text>
                        <Text variant="bodyLarge">
                          {formatListingPrice(listing.price, listing.currency)}
                        </Text>
                        <View style={styles.statusRow}>
                          <Text variant="bodyMedium">Estado: {statusLabels[listing.status]}</Text>
                          {listing.status === 'sold' ? (
                            <Badge label="Vendida" backgroundColor={c.surfaceMuted} color={c.ink} />
                          ) : null}
                        </View>
                        <View style={styles.actionRow}>
                          {listing.status === 'active' ? (
                            <AppButton
                              label="Marcar como vendida"
                              variant="secondary"
                              disabled={busyListingId !== null}
                              loading={busyListingId === listing.id}
                              onPress={() => void markAsSold(listing.id)}
                            />
                          ) : null}
                          <AppButton
                            label={
                              listing.status === 'removed'
                                ? 'Completar eliminación'
                                : 'Eliminar publicación'
                            }
                            variant="danger"
                            disabled={busyListingId !== null}
                            loading={busyListingId === listing.id}
                            onPress={() => confirmDelete(listing)}
                          />
                        </View>
                      </Card.Content>
                    </Card>
                  ))
                )}
                {listingActionError ? (
                  <Text accessibilityRole="alert" style={{ color: c.danger }}>
                    {listingActionError}
                  </Text>
                ) : null}
              </Card.Content>
            </Card>
          </>
        ) : null}

        {userId && adminQuery.data === true ? (
          <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Card.Content>
              <View style={styles.sectionHeading}>
                <MaterialCommunityIcons name="shield-account-outline" size={24} color={c.primary} />
                <SectionHeader title="Administración" />
              </View>
              <AdminPanel />
            </Card.Content>
          </Card>
        ) : null}
        {adminQuery.isError ? (
          <HelperText type="error" visible>
            No se pudo comprobar si esta cuenta tiene permisos administrativos.
          </HelperText>
        ) : null}

        {signOutError ? (
          <Text accessibilityRole="alert" style={{ color: c.danger }}>
            {signOutError}
          </Text>
        ) : null}
        <AppButton
          label="Cerrar sesión"
          variant="secondary"
          onPress={() => void handleSignOut()}
          loading={isSigningOut}
          disabled={isSigningOut}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    gap: space.md,
    padding: space.lg,
  },
  profileHeader: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  avatarText: {
    fontFamily: font.heavy,
    fontSize: 22,
  },
  profileIdentity: {
    flex: 1,
    gap: space.xs,
  },
  email: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  sectionContent: {
    gap: space.md,
    padding: space.lg,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  form: {
    gap: space.md,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  listingCard: {
    gap: space.sm,
  },
  listingCardContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: space.sm,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
});
