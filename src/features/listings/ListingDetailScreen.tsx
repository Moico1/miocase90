import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';

import { useAuth } from '@/features/auth/AuthProvider';
import { ReportDialog } from '@/features/reports/ReportDialog';
import {
  fetchListingDetail,
  formatListingPrice,
} from './listingQueries';

export function ListingDetailScreen({ listingId }: { listingId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const [isReportVisible, setIsReportVisible] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['listing-detail', listingId],
    enabled: Boolean(listingId) && Boolean(session?.user.id),
    queryFn: () => fetchListingDetail(listingId),
  });

  async function contactSeller() {
    const product = detail.data;
    if (!product?.showWhatsapp || !product.whatsapp) return;

    const phone = product.whatsapp.replace(/\D/g, '');
    const message = encodeURIComponent(`Hola, me interesa "${product.title}" que vi en MioCASE.`);
    try {
      await Linking.openURL(`https://wa.me/${phone}?text=${message}`);
      setWhatsappError(null);
    } catch {
      setWhatsappError('No se pudo abrir WhatsApp. Comprueba que esté instalado e inténtalo otra vez.');
    }
  }

  if (!session?.user.id) return null;

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
        {product.showWhatsapp && product.whatsapp ? (
          <Button
            mode="contained"
            buttonColor="#20A65A"
            textColor="#FFFFFF"
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
        {session?.user.id !== product.sellerId && !reportSent ? (
          <Button mode="text" onPress={() => setIsReportVisible(true)}>
            Reportar publicación
          </Button>
        ) : null}
        {reportSent ? (
          <Text variant="bodyMedium">Gracias. El reporte fue enviado a moderación.</Text>
        ) : null}
        {session?.user.id ? (
          <ReportDialog
            listingId={product.id}
            reporterId={session.user.id}
            visible={isReportVisible}
            onDismiss={() => setIsReportVisible(false)}
            onReported={() => setReportSent(true)}
          />
        ) : null}
      </ScrollView>
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
