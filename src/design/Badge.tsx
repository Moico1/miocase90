import { StyleSheet, Text, View } from 'react-native';

import { font, radius, space } from './tokens';
import { useTokens } from './useTokens';

type Props = {
  label: string;
  backgroundColor?: string;
  color?: string;
};

export function Badge({ label, backgroundColor, color }: Props) {
  const c = useTokens();

  return (
    <View style={[styles.badge, { backgroundColor: backgroundColor ?? c.accent }]}>
      <Text style={[styles.label, { color: color ?? c.onAccent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  label: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 16,
  },
});
