import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Button,
  HelperText,
  ProgressBar,
  RadioButton,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

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
  const theme = useTheme();
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
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Button
            mode="text"
            onPress={() => router.back()}
            contentStyle={styles.backButtonContent}
            icon={({ color, size }) => (
              <SymbolView
                name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }}
                tintColor={color}
                size={size}
              />
            )}
          >
            Volver
          </Button>
          <Text variant="headlineSmall">Publicar producto</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Comparte una oferta con los miembros verificados de Yacuiba.
          </Text>

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
              <TextInput
                label="Título"
                mode="outlined"
                contentStyle={styles.inputContent}
                maxLength={100}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={Boolean(errors.title)}
                disabled={busy}
              />
            )}
          />
          <HelperText type="error" visible={Boolean(errors.title)}>
            {errors.title?.message}
          </HelperText>

          <View style={styles.priceSection}>
            <Controller
              control={control}
              name="price"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Precio"
                  mode="outlined"
                  contentStyle={styles.inputContent}
                  keyboardType="decimal-pad"
                  left={<TextInput.Affix text={currency === 'BOB' ? 'Bs' : currency} />}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={Boolean(errors.price)}
                  disabled={busy}
                />
              )}
            />
            <Controller
              control={control}
              name="currency"
              render={({ field: { onChange, value } }) => (
                <RadioButton.Group
                  value={value}
                  onValueChange={onChange}
                >
                  <View style={styles.currencyOptions}>
                    {currencyOptions.map((option) => (
                      <RadioButton.Item
                        key={option.value}
                        label={option.label}
                        value={option.value}
                        disabled={busy}
                        style={styles.currencyOption}
                        labelStyle={styles.currencyLabel}
                      />
                    ))}
                  </View>
                </RadioButton.Group>
              )}
            />
          </View>
          <HelperText type="error" visible={Boolean(errors.price)}>
            {errors.price?.message}
          </HelperText>
          <Controller
            control={control}
            name="previousPrice"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Precio anterior (opcional)"
                mode="outlined"
                contentStyle={styles.inputContent}
                keyboardType="decimal-pad"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={Boolean(errors.previousPrice)}
                disabled={busy}
              />
            )}
          />
          <HelperText type="error" visible={Boolean(errors.previousPrice)}>
            {errors.previousPrice?.message}
          </HelperText>

          <Text variant="titleMedium">Categoría</Text>
          {categoriesQuery.isLoading ? (
            <Text variant="bodyMedium">Cargando categorías…</Text>
          ) : categoriesQuery.isError ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
              No se pudieron cargar las categorías. Comprueba tu conexión e inténtalo otra vez.
            </Text>
          ) : categoriesQuery.data?.length ? (
            <Controller
              control={control}
              name="categoryId"
              render={({ field: { onChange, value } }) => (
                <RadioButton.Group
                  value={String(value)}
                  onValueChange={(selected) => onChange(Number(selected))}
                >
                  <View style={styles.categoryList}>
                    {categoriesQuery.data?.map((category) => (
                      <RadioButton.Item
                        key={category.id}
                        label={category.name}
                        value={String(category.id)}
                        disabled={busy}
                        style={styles.categoryItem}
                      />
                    ))}
                  </View>
                </RadioButton.Group>
              )}
            />
          ) : (
            <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
              Aún no hay categorías disponibles. Pide al administrador que las cargue.
            </Text>
          )}
          <HelperText type="error" visible={Boolean(errors.categoryId)}>
            {errors.categoryId?.message}
          </HelperText>

          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                label="Descripción (opcional)"
                mode="outlined"
                contentStyle={styles.multilineInputContent}
                multiline
                numberOfLines={4}
                maxLength={1000}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={Boolean(errors.description)}
                disabled={busy}
              />
            )}
          />
          <HelperText type="error" visible={Boolean(errors.description)}>
            {errors.description?.message}
          </HelperText>

          <View style={styles.photoHeading}>
            <Text variant="titleMedium">Fotos (máximo 5)</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {photos.length}/{MAX_LISTING_PHOTOS}
            </Text>
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Se reducirán en el teléfono y se guardarán como JPEG de hasta 512 KiB.
          </Text>
          <Button
            mode="outlined"
            contentStyle={styles.buttonContent}
            onPress={pickPhotos}
            loading={isPreparingPhotos}
            disabled={busy || photos.length >= MAX_LISTING_PHOTOS || !verified}
          >
            Elegir fotos
          </Button>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Mío CASE solo accede a las fotos que elijas para publicar productos.
          </Text>
          {photoProgress ? <Text variant="bodySmall">{photoProgress}</Text> : null}
          {photos.length > 0 ? (
            <View style={styles.photoList}>
              {photos.map((photo, index) => (
                <View key={`${photo.uri}-${index}`} style={styles.photoItem}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <Text variant="labelSmall">{Math.ceil(photo.size / 1024)} KiB</Text>
                  <Button
                    compact
                    onPress={() => removePhoto(index)}
                    disabled={busy}
                    accessibilityLabel={`Quitar foto ${index + 1}`}
                  >
                    Quitar
                  </Button>
                </View>
              ))}
            </View>
          ) : null}
          <HelperText type="error" visible={Boolean(errors.photoCount)}>
            {errors.photoCount?.message}
          </HelperText>

          {isSubmitting ? (
            <View style={styles.progressContainer}>
              <Text variant="bodyMedium">{progressLabel}</Text>
              <ProgressBar
                indeterminate={progressValue === undefined}
                progress={progressValue}
              />
            </View>
          ) : null}
          {errorMessage ? (
            <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
              {errorMessage}
            </Text>
          ) : null}
          {successMessage ? (
            <Text accessibilityRole="alert" style={{ color: theme.colors.primary }}>
              {successMessage}
            </Text>
          ) : null}

          <Button
            mode="contained"
            contentStyle={styles.buttonContent}
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
          >
            Publicar
          </Button>
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
    gap: 12,
    padding: 20,
  },
  backButtonContent: {
    minHeight: 48,
  },
  inputContent: {
    minHeight: 50,
  },
  multilineInputContent: {
    minHeight: 100,
    paddingTop: 12,
  },
  buttonContent: {
    minHeight: 52,
  },
  priceSection: {
    gap: 4,
  },
  currencyOptions: {
    alignItems: 'center',
    flexDirection: 'row',
    width: '100%',
  },
  currencyOption: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
  },
  currencyLabel: {
    fontSize: 12,
  },
  categoryList: {
    borderColor: '#80808055',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  categoryItem: {
    minHeight: 44,
  },
  photoHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photoList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoItem: {
    alignItems: 'center',
    width: 92,
  },
  photoPreview: {
    borderRadius: 8,
    height: 84,
    width: 84,
  },
  progressContainer: {
    gap: 8,
  },
});
