import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  HelperText,
  ProgressBar,
  Text,
  Card,
} from 'react-native-paper';

import { AppButton } from '@/design/AppButton';
import { Chip } from '@/design/Chip';
import { ScreenHeader } from '@/design/ScreenHeader';
import { TextField } from '@/design/TextField';
import { font, radius, space } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMembership } from '@/features/auth/useMembership';
import {
  MAX_LISTING_PHOTOS,
  prepareListingPhoto,
  type PreparedListingPhoto,
} from '@/features/listings/imagePreparation';
import {
  listingFormSchema,
  type ListingFormInput,
  type ListingFormValues,
} from '@/features/listings/listingSchema';
import { publishListing, type PublishProgress } from '@/features/listings/publishListing';
import { getSupabaseClient } from '@/lib/supabase';

type Category = { id: number; name: string };

const currencyOptions = [
  { value: 'BOB', label: 'Bs' },
  { value: 'USD', label: 'USD' },
  { value: 'ARS', label: 'ARS' },
] as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'Ocurrió un error inesperado. Inténtalo otra vez.';
}

export function PublishListingScreen() {
  const c = useTokens();
  const router = useRouter();
  const { session } = useAuth();
  const membership = useMembership(session?.user.id);
  const [photos, setPhotos] = useState<PreparedListingPhoto[]>([]);
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoProgress, setPhotoProgress] = useState('');
  const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['listing-categories', 'publishing'],
    enabled: Boolean(session?.user.id),
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await getSupabaseClient()
        .from('categories')
        .select('id, name')
        .order('name');

      if (error) throw error;
      return data.map((category) => ({ id: Number(category.id), name: category.name }));
    },
  });

  const categoryIds = useMemo(
    () => new Set(categoriesQuery.data?.map((category) => category.id) ?? []),
    [categoriesQuery.data]
  );

  const {
    control,
    formState: { errors },
    getValues,
    handleSubmit,
    reset,
    setValue,
  } = useForm<ListingFormInput, undefined, ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      title: '',
      price: '',
      previousPrice: '',
      currency: 'BOB',
      description: '',
      categoryId: 0,
      photoCount: 0,
    },
  });
  const currency = useWatch({ control, name: 'currency' });

  useEffect(() => {
    const firstCategory = categoriesQuery.data?.[0];
    if (firstCategory && !categoryIds.has(getValues('categoryId'))) {
      setValue('categoryId', firstCategory.id, { shouldValidate: true });
    }
  }, [categoriesQuery.data, categoryIds, getValues, setValue]);

  const verified = membership.data === 'verified';
  const busy = isPreparingPhotos || isSubmitting;

  async function pickPhotos() {
    const remaining = MAX_LISTING_PHOTOS - photos.length;
    if (remaining <= 0) return;

    setErrorMessage(null);
    setIsPreparingPhotos(true);
    const newlyPrepared: PreparedListingPhoto[] = [];

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
        exif: false,
      });

      if (result.canceled) return;

      for (let index = 0; index < result.assets.length; index += 1) {
        setPhotoProgress(`Preparando foto ${index + 1} de ${result.assets.length}…`);
        newlyPrepared.push(await prepareListingPhoto(result.assets[index].uri));
      }

      const nextPhotos = [...photos, ...newlyPrepared].slice(0, MAX_LISTING_PHOTOS);
      setValue('photoCount', nextPhotos.length, { shouldValidate: true });
      setPhotos(nextPhotos);
      setPhotoProgress('');
    } catch (error) {
      let cleanupFailed = false;
      for (const photo of newlyPrepared) {
        try {
          new File(photo.uri).delete();
        } catch {
          cleanupFailed = true;
        }
      }
      setPhotoProgress('');
      setErrorMessage(
        `No se pudieron preparar las fotos. ${getErrorMessage(error)}${
          cleanupFailed ? ' No se pudo liberar uno de los archivos temporales.' : ''
        }`
      );
    } finally {
      setIsPreparingPhotos(false);
    }
  }

  function removePhoto(index: number) {
    const photo = photos[index];
    if (photo) {
      try {
        new File(photo.uri).delete();
      } catch (error) {
        setErrorMessage(
          `Se quitó la foto, pero no se pudo liberar su archivo temporal. ${getErrorMessage(error)}`
        );
      }
    }
    const nextPhotos = photos.filter((_, photoIndex) => photoIndex !== index);
    setValue('photoCount', nextPhotos.length, { shouldValidate: true });
    setPhotos(nextPhotos);
  }

  async function submit(values: ListingFormValues) {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!session?.user.id) {
      setErrorMessage('Tu sesión ya no está activa. Inicia sesión de nuevo.');
      return;
    }
    if (!verified) {
      setErrorMessage('Solo las cuentas verificadas pueden publicar productos.');
      return;
    }
    if (categoriesQuery.isError || categoriesQuery.isLoading || !categoryIds.has(values.categoryId)) {
      setErrorMessage('Selecciona una categoría disponible antes de publicar.');
      return;
    }

    setIsSubmitting(true);
    setPublishProgress(null);

    try {
      const listingId = await publishListing(
        session.user.id,
        values,
        photos,
        setPublishProgress
      );
      let temporaryFileCleanupFailed = false;
      for (const photo of photos) {
        try {
          new File(photo.uri).delete();
        } catch {
          temporaryFileCleanupFailed = true;
        }
      }
      setPhotos([]);
      reset({
        title: '',
        price: '',
        previousPrice: '',
        currency: 'BOB',
        description: '',
        categoryId: categoriesQuery.data?.[0]?.id ?? 0,
        photoCount: 0,
      });
      setSuccessMessage(`¡Producto publicado! Código: ${listingId.slice(0, 8)}.`);
      if (temporaryFileCleanupFailed) {
        setErrorMessage('El producto se publicó, pero no se pudieron liberar todas las fotos temporales.');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
      setPublishProgress(null);
    }
  }

  const progressValue =
    publishProgress && publishProgress.total > 0
      ? publishProgress.completed / publishProgress.total
      : undefined;
  const progressLabel =
    publishProgress?.phase === 'uploading'
      ? publishProgress.completed < publishProgress.total
        ? `Subiendo foto ${publishProgress.completed + 1} de ${publishProgress.total}…`
        : 'Fotos subidas. Publicando producto…'
      : publishProgress?.phase === 'publishing'
        ? 'Fotos subidas. Publicando producto…'
        : 'Guardando el borrador…';

  if (!session?.user.id) return null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: c.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <AppButton label="Volver" variant="secondary" onPress={() => router.back()} />
          <ScreenHeader
            title="Publicar producto"
            subtitle="Comparte una oferta con los miembros verificados de Yacuiba."
          />

          <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Card.Content style={styles.cardContent}>
              {membership.isLoading ? (
                <Text variant="bodyMedium">Comprobando tu membresía…</Text>
              ) : !verified ? (
                <Text variant="bodyMedium">
                  Tu cuenta debe estar verificada para publicar productos.
                </Text>
              ) : null}

              <Controller
                control={control}
                name="title"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Título"
                    maxLength={100}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.title?.message}
                    disabled={busy}
                  />
                )}
              />
            </Card.Content>
          </Card>

          <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">Precio</Text>
              <Controller
                control={control}
                name="currency"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.currencyOptions}>
                    {currencyOptions.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={value === option.value}
                        disabled={busy}
                        onPress={() => onChange(option.value)}
                      />
                    ))}
                  </View>
                )}
              />
            <Controller
              control={control}
              name="price"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label={`Precio (${currency === 'BOB' ? 'Bs' : currency})`}
                  keyboardType="decimal-pad"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.price?.message}
                  disabled={busy}
                />
              )}
            />
              <Controller
                control={control}
                name="previousPrice"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Precio anterior (opcional)"
                    keyboardType="decimal-pad"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.previousPrice?.message}
                    disabled={busy}
                  />
                )}
              />
            </Card.Content>
          </Card>

          <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Card.Content style={styles.cardContent}>
          <Text variant="titleMedium">Categoría</Text>
          {categoriesQuery.isLoading ? (
            <Text variant="bodyMedium">Cargando categorías…</Text>
          ) : categoriesQuery.isError ? (
            <Text variant="bodyMedium" style={{ color: c.danger }}>
              No se pudieron cargar las categorías. Comprueba tu conexión e inténtalo otra vez.
            </Text>
          ) : categoriesQuery.data?.length ? (
            <Controller
              control={control}
              name="categoryId"
              render={({ field: { onChange, value } }) => (
                <View style={styles.categoryList}>
                  {categoriesQuery.data?.map((category) => (
                    <Chip
                      key={category.id}
                      label={category.name}
                      selected={value === category.id}
                      disabled={busy}
                      onPress={() => onChange(category.id)}
                    />
                  ))}
                </View>
              )}
            />
          ) : (
            <Text variant="bodyMedium" style={{ color: c.danger }}>
              Aún no hay categorías disponibles. Pide al administrador que las cargue.
            </Text>
          )}
          <HelperText type="error" visible={Boolean(errors.categoryId)}>
            {errors.categoryId?.message}
          </HelperText>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Card.Content style={styles.cardContent}>
              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Descripción (opcional)"
                    multiline
                    numberOfLines={4}
                    maxLength={1000}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.description?.message}
                    disabled={busy}
                    style={styles.multilineInput}
                  />
                )}
              />
            </Card.Content>
          </Card>

          <Card mode="outlined" style={[styles.sectionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.photoHeading}>
                <Text variant="titleMedium">Fotos</Text>
                <Text variant="bodySmall" style={{ color: c.inkMuted }}>
                  {photos.length}/{MAX_LISTING_PHOTOS}
                </Text>
              </View>
              <Text variant="bodySmall" style={{ color: c.inkMuted }}>
                Se reducirán en el teléfono y se guardarán como JPEG de hasta 512 KiB.
              </Text>
              <Text variant="bodySmall" style={{ color: c.inkMuted }}>
                Mío CASE solo accede a las fotos que elijas para publicar productos.
              </Text>
              {photoProgress ? <Text variant="bodySmall">{photoProgress}</Text> : null}
              <View style={styles.photoGrid}>
                {Array.from({ length: MAX_LISTING_PHOTOS }, (_, index) => {
                  const photo = photos[index];
                  if (photo) {
                    return (
                      <View
                        key={`${photo.uri}-${index}`}
                        style={[
                          styles.photoSlot,
                          { backgroundColor: c.surface, borderColor: c.border },
                        ]}
                      >
                        <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                        <Text variant="labelSmall">{Math.ceil(photo.size / 1024)} KiB</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Quitar foto ${index + 1}`}
                          disabled={busy}
                          onPress={() => removePhoto(index)}
                          style={({ pressed }) => [
                            styles.removePhoto,
                            { backgroundColor: c.danger, opacity: pressed ? 0.8 : 1 },
                          ]}
                        >
                          <MaterialCommunityIcons name="close" size={20} color={c.onDanger} />
                        </Pressable>
                      </View>
                    );
                  }
                  if (index === photos.length && photos.length < MAX_LISTING_PHOTOS) {
                    return (
                      <Pressable
                        key={`add-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel="Agregar fotos"
                        onPress={() => void pickPhotos()}
                        disabled={busy || !verified}
                        style={({ pressed }) => [
                          styles.addPhotoSlot,
                          {
                            backgroundColor: c.surfaceMuted,
                            borderColor: c.border,
                            opacity: busy || !verified ? 0.5 : pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <View style={[styles.addPhotoIcon, { backgroundColor: c.primary }]}>
                          <MaterialCommunityIcons name="plus" size={24} color={c.onPrimary} />
                        </View>
                        <Text style={[styles.addPhotoLabel, { color: c.primary }]}>Agregar</Text>
                      </Pressable>
                    );
                  }
                  return (
                    <View
                      key={`empty-${index}`}
                      style={[styles.emptyPhotoSlot, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}
                    >
                      <MaterialCommunityIcons name="image-outline" size={24} color={c.inkMuted} />
                    </View>
                  );
                })}
              </View>
              <HelperText type="error" visible={Boolean(errors.photoCount)}>
                {errors.photoCount?.message}
              </HelperText>
            </Card.Content>
          </Card>

          {isSubmitting ? (
            <View style={styles.progressContainer}>
              <Text variant="bodyMedium">{progressLabel}</Text>
              <ProgressBar
                indeterminate={progressValue === undefined}
                progress={progressValue}
                color={c.primary}
              />
            </View>
          ) : null}
          {errorMessage ? (
            <Text accessibilityRole="alert" style={{ color: c.danger }}>
              {errorMessage}
            </Text>
          ) : null}
          {successMessage ? (
            <Text accessibilityRole="alert" style={{ color: c.primary }}>
              {successMessage}
            </Text>
          ) : null}

          <AppButton
            label="Publicar"
            onPress={() => {
              if (photos.length < 1) {
                setErrorMessage('Agrega al menos una foto');
              }
              void handleSubmit(submit)();
            }}
            loading={isSubmitting}
            disabled={
              busy ||
              !verified ||
              membership.isLoading ||
              categoriesQuery.isLoading ||
              categoriesQuery.isError ||
              categoriesQuery.data?.length === 0
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    gap: space.md,
    padding: space.lg,
  },
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  cardContent: {
    gap: space.md,
    padding: space.lg,
  },
  multilineInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  currencyOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  photoHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  photoSlot: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.xs,
    overflow: 'hidden',
    padding: space.xs,
    width: '30%',
  },
  photoPreview: {
    aspectRatio: 4 / 5,
    borderRadius: radius.sm,
    width: '100%',
  },
  removePhoto: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 48,
  },
  addPhotoSlot: {
    alignItems: 'center',
    aspectRatio: 0.8,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: space.sm,
    justifyContent: 'center',
    width: '30%',
  },
  addPhotoIcon: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  addPhotoLabel: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  emptyPhotoSlot: {
    alignItems: 'center',
    aspectRatio: 0.8,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    width: '30%',
  },
  progressContainer: {
    gap: space.sm,
  },
});
