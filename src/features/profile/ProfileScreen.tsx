import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  HelperText,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { z } from 'zod';

import { AdminPanel } from '@/features/admin/AdminPanel';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthPage } from '@/features/auth/AuthPage';
import { useMembership } from '@/features/auth/useMembership';
import {
  profileFormSchema,
  type ProfileFormInput,
  type ProfileFormValues,
} from '@/features/profile/profileSchema';
import { deleteOwnListing } from '@/features/listings/deleteListing';
import { formatListingPrice } from '@/features/listings/listingQueries';
import { getSupabaseClient } from '@/lib/supabase';

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
  const theme = useTheme();
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
          .select('whatsapp, show_whatsapp')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (contactResult.error) throw contactResult.error;
      if (!profileResult.data) throw new Error('No se encontró el perfil de esta cuenta.');

      return {
        displayName: profileResult.data.display_name,
        whatsapp: contactResult.data?.whatsapp ?? '',
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
      whatsapp: '',
      showWhatsapp: false,
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      reset({
        displayName: profileQuery.data.displayName,
        whatsapp: profileQuery.data.whatsapp,
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
        target_whatsapp: values.whatsapp || null,
        target_show_whatsapp: values.showWhatsapp,
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

  if (!userId) {
    return (
      <AuthPage
        title="Tu perfil"
        subtitle="Inicia sesión o crea una cuenta gratis para guardar tus datos y publicar."
      >
        <Button mode="contained" onPress={() => router.push('/sign-up')}>
          Registrarme
        </Button>
        <Button mode="outlined" onPress={() => router.push('/sign-in')}>
          Ya tengo cuenta
        </Button>
      </AuthPage>
    );
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="headlineSmall">Mi cuenta</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {session?.user.email}
        </Text>

        <Text variant="titleLarge">Cuenta de comprador</Text>
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
            <Button mode="outlined" onPress={() => void requestSellerStatus()}>
              Solicitar ser vendedor
            </Button>
          </View>
        )}
        {sellerRequestError ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {sellerRequestError}
          </Text>
        ) : null}
        {sellerRequestMessage ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.primary }}>
            {sellerRequestMessage}
          </Text>
        ) : null}

        <Text variant="titleLarge">Mi perfil</Text>
        {profileQuery.isPending ? (
          <ActivityIndicator />
        ) : profileQuery.isError ? (
          <View style={styles.state}>
            <Text variant="bodyMedium">No se pudo cargar tu perfil.</Text>
            <Button onPress={() => void profileQuery.refetch()}>Reintentar</Button>
          </View>
        ) : (
          <View style={styles.form}>
            <Controller
              control={control}
              name="displayName"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Nombre para mostrar"
                  mode="outlined"
                  maxLength={60}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={Boolean(errors.displayName)}
                  disabled={isSavingProfile}
                />
              )}
            />
            <HelperText type="error" visible={Boolean(errors.displayName)}>
              {errors.displayName?.message}
            </HelperText>

            <Controller
              control={control}
              name="whatsapp"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="WhatsApp (opcional)"
                  mode="outlined"
                  keyboardType="phone-pad"
                  placeholder="+591 7XXXXXXX"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={Boolean(errors.whatsapp)}
                  disabled={isSavingProfile}
                />
              )}
            />
            <HelperText type="error" visible={Boolean(errors.whatsapp)}>
              {errors.whatsapp?.message}
            </HelperText>

            <Controller
              control={control}
              name="showWhatsapp"
              render={({ field: { onChange, value } }) => (
                <View style={styles.switchRow}>
                  <Text variant="bodyMedium">Mostrar WhatsApp en mis publicaciones</Text>
                  <Switch
                    value={value}
                    onValueChange={onChange}
                    disabled={isSavingProfile}
                  />
                </View>
              )}
            />
            {profileError ? (
              <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
                {profileError}
              </Text>
            ) : null}
            {profileMessage ? (
              <Text accessibilityRole="alert" style={{ color: theme.colors.primary }}>
                {profileMessage}
              </Text>
            ) : null}
            <Button
              mode="contained"
              contentStyle={styles.buttonContent}
              onPress={() => {
                void handleSubmit(saveProfile)();
              }}
              loading={isSavingProfile}
              disabled={isSavingProfile}
            >
              Guardar perfil
            </Button>
          </View>
        )}

        {sellerStatus.data === 'verified' ? (
          <>
        <Text variant="titleLarge">Mis publicaciones</Text>
        {listingsQuery.isPending ? (
          <ActivityIndicator />
        ) : listingsQuery.isError ? (
          <View style={styles.state}>
            <Text variant="bodyMedium">No se pudieron cargar tus publicaciones.</Text>
            <Button onPress={() => void listingsQuery.refetch()}>Reintentar</Button>
          </View>
        ) : listingsQuery.data.length === 0 ? (
          <Text variant="bodyMedium">Todavía no tienes publicaciones.</Text>
        ) : (
          listingsQuery.data.map((listing) => (
            <Card key={listing.id} mode="outlined">
              <Card.Content style={styles.listingCard}>
                <Text variant="titleMedium">{listing.title}</Text>
                <Text variant="bodyLarge">
                  {formatListingPrice(listing.price, listing.currency)}
                </Text>
                <View style={styles.statusRow}>
                  <Text variant="bodyMedium">Estado: {statusLabels[listing.status]}</Text>
                  {listing.status === 'sold' ? (
                    <Chip
                      compact
                      icon={({ color, size }) => (
                        <SymbolView
                          name={{
                            ios: 'checkmark.circle.fill',
                            android: 'check_circle',
                            web: 'check_circle',
                          }}
                          tintColor={color}
                          size={size}
                        />
                      )}
                    >
                      Vendido
                    </Chip>
                  ) : null}
                </View>
                <View style={styles.actionRow}>
                  {listing.status === 'active' ? (
                    <Button
                      compact
                      mode="outlined"
                      disabled={busyListingId !== null}
                      loading={busyListingId === listing.id}
                      onPress={() => void markAsSold(listing.id)}
                    >
                      Marcar como vendida
                    </Button>
                  ) : null}
                  <Button
                    compact
                    textColor={theme.colors.error}
                    disabled={busyListingId !== null}
                    loading={busyListingId === listing.id}
                    onPress={() => confirmDelete(listing)}
                  >
                    {listing.status === 'removed' ? 'Completar eliminación' : 'Eliminar publicación'}
                  </Button>
                </View>
              </Card.Content>
            </Card>
          ))
        )}
        {listingActionError ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {listingActionError}
          </Text>
        ) : null}
          </>
        ) : null}

        {userId && adminQuery.data === true ? <AdminPanel /> : null}
        {adminQuery.isError ? (
          <HelperText type="error" visible>
            No se pudo comprobar si esta cuenta tiene permisos administrativos.
          </HelperText>
        ) : null}

        {signOutError ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {signOutError}
          </Text>
        ) : null}
        <Button
          mode="outlined"
          contentStyle={styles.buttonContent}
          onPress={() => void handleSignOut()}
          loading={isSigningOut}
          disabled={isSigningOut}
        >
          Cerrar sesión
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    gap: 14,
    padding: 20,
  },
  form: {
    gap: 10,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  buttonContent: {
    minHeight: 48,
  },
  listingCard: {
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  state: {
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
});
