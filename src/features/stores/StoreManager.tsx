import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';

import { prepareListingPhoto, type PreparedListingPhoto } from '@/features/listings/imagePreparation';
import {
  fetchMyStore,
  getStoreLogoUrl,
  type OwnStore,
  saveMyStore,
  setMyStoreLogo,
} from './storeQueries';
import { getSupabaseClient } from '@/lib/supabase';

export function StoreManager() {
  const storeQuery = useQuery({
    queryKey: ['my-store'],
    queryFn: fetchMyStore,
  });
  if (storeQuery.isPending) {
    return <Text variant="bodyMedium">Cargando la información de tu tienda…</Text>;
  }
  if (storeQuery.isError) {
    return (
      <View style={styles.state}>
        <Text variant="bodyMedium">No se pudo consultar tu tienda.</Text>
        <Button onPress={() => void storeQuery.refetch()}>Reintentar</Button>
      </View>
    );
  }
  return <StoreManagerForm initialStore={storeQuery.data} />;
}

function StoreManagerForm({ initialStore }: { initialStore: OwnStore | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [storeId, setStoreId] = useState(initialStore?.id ?? null);
  const [logoPath, setLogoPath] = useState(initialStore?.logo_path ?? null);
  const [name, setName] = useState(initialStore?.name ?? '');
  const [description, setDescription] = useState(initialStore?.description ?? '');
  const [neighborhood, setNeighborhood] = useState(initialStore?.neighborhood ?? '');
  const [openingHours, setOpeningHours] = useState(initialStore?.opening_hours ?? '');
  const [socialUrl, setSocialUrl] = useState(initialStore?.social_url ?? '');
  const [preparedLogo, setPreparedLogo] = useState<PreparedListingPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function pickLogo() {
    setErrorMessage(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        exif: false,
      });
      if (result.canceled) return;
      setPreparedLogo(await prepareListingPhoto(result.assets[0].uri));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo preparar el logo de tu tienda.'
      );
    }
  }

  async function saveStore() {
    if (name.trim().length < 2 || neighborhood.trim().length < 2) {
      setErrorMessage('Completa el nombre del negocio y el barrio o zona de Yacuiba.');
      return;
    }
    if (description.length > 300) {
      setErrorMessage('La descripción no puede superar los 300 caracteres.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const savedStoreId = await saveMyStore({
        id: storeId,
        name,
        description,
        neighborhood,
        openingHours,
        socialUrl,
      });
      setStoreId(savedStoreId);

      if (preparedLogo) {
        const path = `${savedStoreId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const logoFile = new File(preparedLogo.uri);
        const { error: uploadError } = await getSupabaseClient()
          .storage.from('miocase-store-logos')
          .upload(path, await logoFile.arrayBuffer(), {
            contentType: 'image/jpeg',
            upsert: false,
          });
        if (uploadError) throw uploadError;
        await setMyStoreLogo(savedStoreId, path);
        const previousPath = logoPath;
        if (previousPath && previousPath !== path) {
          const { error: deleteError } = await getSupabaseClient()
            .storage.from('miocase-store-logos')
            .remove([previousPath]);
          if (deleteError) throw deleteError;
        }
        setLogoPath(path);
        setPreparedLogo(null);
      }

      await queryClient.invalidateQueries({ queryKey: ['my-store'] });
      await queryClient.invalidateQueries({ queryKey: ['public-store', savedStoreId] });
      setSuccessMessage('La información de tu tienda fue guardada.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la tienda. Comprueba tu conexión e inténtalo otra vez.'
      );
    } finally {
      setBusy(false);
    }
  }

  const logoUri = preparedLogo?.uri ?? getStoreLogoUrl(logoPath);

  return (
    <View style={styles.container}>
      <Text variant="titleLarge">Mi tienda</Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Esta información se mostrará en tu página pública.
      </Text>

      {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logo} accessibilityLabel="Logo de la tienda" />
          ) : null}
          <Button mode="outlined" onPress={() => void pickLogo()} disabled={busy}>
            {logoUri ? 'Cambiar logo' : 'Elegir logo'}
          </Button>
          <TextInput
            mode="outlined"
            label="Nombre del negocio"
            value={name}
            onChangeText={setName}
            maxLength={80}
            disabled={busy}
          />
          <TextInput
            mode="outlined"
            label="Descripción"
            value={description}
            onChangeText={setDescription}
            maxLength={300}
            multiline
            disabled={busy}
          />
          <TextInput
            mode="outlined"
            label="Barrio o zona de Yacuiba"
            value={neighborhood}
            onChangeText={setNeighborhood}
            maxLength={80}
            disabled={busy}
          />
          <TextInput
            mode="outlined"
            label="Horario"
            value={openingHours}
            onChangeText={setOpeningHours}
            maxLength={120}
            disabled={busy}
          />
          <TextInput
            mode="outlined"
            label="Enlace a redes (opcional)"
            value={socialUrl}
            onChangeText={setSocialUrl}
            autoCapitalize="none"
            keyboardType="url"
            maxLength={500}
            disabled={busy}
          />
          <HelperText type="info" visible>
            Usa un enlace seguro que comience con https://.
          </HelperText>
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
          <Button mode="contained" onPress={() => void saveStore()} loading={busy} disabled={busy}>
            Guardar tienda
          </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingVertical: 20,
  },
  logo: {
    alignSelf: 'center',
    borderRadius: 16,
    height: 112,
    width: 112,
  },
  state: {
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
});
