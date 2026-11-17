import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { font, radius, space } from './tokens';
import { useTokens } from './useTokens';

type Props = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function Chip({ label, selected = false, disabled = false, onPress }: Props) {
  const c = useTokens();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.surface,
          borderColor: selected ? c.primary : c.border,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {selected ? <MaterialCommunityIcons name="check" size={16} color={c.onPrimary} /> : null}
      <Text style={[styles.label, { color: selected ? c.onPrimary : c.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.xs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: space.lg,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
});
