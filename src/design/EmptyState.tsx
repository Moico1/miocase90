import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from './AppButton';
import { font, radius, space } from './tokens';
import { useTokens } from './useTokens';

type Props = {
  title: string;
  message: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title,
  message,
  icon = 'package-variant',
  actionLabel,
  onAction,
}: Props) {
  const c = useTokens();

  return (
    <View style={styles.container}>
      <View style={[styles.icon, { backgroundColor: c.primaryContainer }]}>
        <MaterialCommunityIcons name={icon} size={36} color={c.primary} />
      </View>
      <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
      <Text style={[styles.message, { color: c.inkMuted }]}>{message}</Text>
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: space.md,
    justifyContent: 'center',
    padding: space.xl,
  },
  icon: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
  message: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
