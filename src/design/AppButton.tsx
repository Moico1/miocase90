import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { font, radius, space } from './tokens';
import { useTokens } from './useTokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: Props) {
  const c = useTokens();
  const backgroundColor =
    variant === 'primary' ? c.primary : variant === 'danger' ? c.danger : 'transparent';
  const color =
    variant === 'primary' ? c.onPrimary : variant === 'danger' ? c.onDanger : c.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderColor: variant === 'secondary' ? c.primary : 'transparent',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.label, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: space.xl,
  },
  label: {
    fontFamily: font.bold,
    fontSize: 16,
  },
});
