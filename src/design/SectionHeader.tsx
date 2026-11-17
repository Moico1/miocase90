import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, space } from './tokens';
import { useTokens } from './useTokens';

type Props = {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
};

export function SectionHeader({ title, onSeeAll, seeAllLabel = 'Ver todo' }: Props) {
  const c = useTokens();

  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
      {onSeeAll ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={seeAllLabel}
          onPress={onSeeAll}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: c.primary }]}>{seeAllLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 18,
    lineHeight: 24,
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingLeft: space.md,
  },
  actionText: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
});
