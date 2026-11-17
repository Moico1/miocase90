import { Image, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { font } from '@/design/tokens';
import { useTokens } from '@/design/useTokens';

const boxMark = require('../assets/brand/box-mark.png');

type BrandLogoProps = {
  variant: 'compact' | 'full';
};

export function BrandLogo({ variant }: BrandLogoProps) {
  const c = useTokens();
  const markStyle = { tintColor: c.ink };

  if (variant === 'compact') {
    return (
      <View style={styles.compact}>
        <Image source={boxMark} style={[styles.compactMark, markStyle]} accessible={false} />
        <Text style={[styles.compactWordmark, { color: c.ink }]}>
          Mío CASE
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.full}>
      <Image
        source={boxMark}
        style={[styles.fullMark, markStyle]}
        accessible={false}
      />
      <Text style={[styles.wordmark, { color: c.ink }]}>
        Mío{'\n'}CASE
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  compactMark: {
    height: 36,
    width: 36,
  },
  compactWordmark: {
    fontFamily: font.brand,
    fontSize: 17,
  },
  full: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  fullMark: {
    height: 72,
    width: 72,
  },
  wordmark: {
    fontFamily: font.brand,
    fontSize: 28,
    lineHeight: 30,
  },
});
