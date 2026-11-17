import { Image, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

const boxMark = require('../assets/brand/box-mark.png');

type BrandLogoProps = {
  variant: 'compact' | 'full';
};

export function BrandLogo({ variant }: BrandLogoProps) {
  const theme = useTheme();
  const markStyle = { tintColor: theme.colors.onSurface };

  if (variant === 'compact') {
    return (
      <View style={styles.compact}>
        <Image source={boxMark} style={[styles.compactMark, markStyle]} accessible={false} />
        <Text style={[styles.compactWordmark, { color: theme.colors.onSurface }]}>
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
      <Text style={[styles.wordmark, { color: theme.colors.onSurface }]}>
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
    fontFamily: 'PlayfairDisplay_900Black_Italic',
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
    fontFamily: 'PlayfairDisplay_900Black_Italic',
    fontSize: 28,
    lineHeight: 30,
  },
});
