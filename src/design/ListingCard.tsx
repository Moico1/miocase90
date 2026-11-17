import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { ListingCard as Listing } from '@/features/listings/listingQueries';
import type { StoreListing } from '@/features/stores/storeQueries';

import { Badge } from './Badge';
import { font, radius, shadow, space } from './tokens';
import { useTokens } from './useTokens';

type Props = {
  listing: Listing | StoreListing;
  priceLabel: string;
  previousPriceLabel?: string;
  onOpen: () => void;
  onOpenStore?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ListingCard({
  listing,
  priceLabel,
  previousPriceLabel,
  onOpen,
  onOpenStore,
  style,
}: Props) {
  const c = useTokens();
  const isFeedListing = 'previousPrice' in listing;
  const previousPrice = isFeedListing ? listing.previousPrice : listing.previous_price;
  const storeInfo = isFeedListing && listing.storeId
    ? { id: listing.storeId, name: listing.storeName, logoUrl: listing.storeLogoUrl }
    : null;
  const discount =
    previousPrice !== null && previousPrice > 0
      ? Math.round((1 - listing.price / previousPrice) * 100)
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver ${listing.title}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        shadow.card,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      <View style={styles.media}>
        {listing.thumbnailUrl ? (
          <ExpoImage
            source={{ uri: listing.thumbnailUrl }}
            style={styles.photo}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={`Foto de ${listing.title}`}
          />
        ) : (
          <View style={[styles.photo, styles.noImage, { backgroundColor: c.surfaceMuted }]}>
            <MaterialCommunityIcons name="image-outline" size={32} color={c.inkMuted} />
            <Text style={[styles.noImageLabel, { color: c.inkMuted }]}>Sin foto</Text>
          </View>
        )}
        <View style={styles.badges}>
          {listing.isNew ? (
            <Badge label="Nuevo" backgroundColor={c.accent} color={c.onAccent} />
          ) : null}
          {discount !== null && discount > 0 ? (
            <Badge label={`-${discount}%`} backgroundColor={c.danger} color={c.onDanger} />
          ) : null}
          {listing.status === 'sold' ? (
            <Badge label="Vendido" backgroundColor={c.ink} color={c.background} />
          ) : null}
        </View>
        {listing.status === 'sold' ? (
          <View style={[styles.soldOverlay, { backgroundColor: c.ink, opacity: 0.35 }]} />
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={[styles.price, { color: c.primary }]}>{priceLabel}</Text>
        {previousPriceLabel ? (
          <Text style={[styles.previousPrice, { color: c.inkMuted }]}>{previousPriceLabel}</Text>
        ) : null}
        <Text numberOfLines={2} style={[styles.title, { color: c.ink }]}>
          {listing.title}
        </Text>
        {storeInfo && onOpenStore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver tienda ${storeInfo.name}`}
            onPress={(event) => {
              event.stopPropagation();
              onOpenStore();
            }}
            style={styles.storeChip}
          >
            {storeInfo.logoUrl ? (
              <ExpoImage
                source={{ uri: storeInfo.logoUrl }}
                style={styles.storeLogo}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <MaterialCommunityIcons name="store-outline" size={20} color={c.primary} />
            )}
            <Text numberOfLines={1} style={[styles.storeName, { color: c.inkMuted }]}>
              {storeInfo.name}
            </Text>
          </Pressable>
        ) : null}
        {'categoryName' in listing ? (
          <Text numberOfLines={1} style={[styles.category, { color: c.inkMuted }]}>
            {listing.categoryName}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  media: {
    aspectRatio: 4 / 5,
    width: '100%',
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  noImage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  noImageLabel: {
    fontFamily: font.regular,
    fontSize: 12,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    left: space.sm,
    position: 'absolute',
    top: space.sm,
    zIndex: 1,
  },
  soldOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  body: {
    gap: space.xs,
    padding: space.md,
  },
  price: {
    fontFamily: font.heavy,
    fontSize: 20,
    lineHeight: 28,
  },
  previousPrice: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
    textDecorationLine: 'line-through',
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  category: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  storeChip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 48,
  },
  storeLogo: {
    borderRadius: radius.pill,
    height: 20,
    width: 20,
  },
  storeName: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
  },
});
