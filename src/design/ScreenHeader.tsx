import { StyleSheet, Text, View } from 'react-native';

import { font, space } from './tokens';
import { useTokens } from './useTokens';

type Props = {
  title: string;
  subtitle?: string;
};

export function ScreenHeader({ title, subtitle }: Props) {
  const c = useTokens();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: c.inkMuted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
  title: {
    fontFamily: font.brand,
    fontSize: 28,
    lineHeight: 38,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 17,
    lineHeight: 24,
  },
});
