import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { font, radius, space } from './tokens';
import { useTokens } from './useTokens';

type Props = TextInputProps & {
  label: string;
  error?: string;
  disabled?: boolean;
};

export function TextField({
  label,
  error,
  disabled,
  onFocus,
  onBlur,
  style,
  ...inputProps
}: Props) {
  const c = useTokens();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: c.ink }]}>{label}</Text>
      <TextInput
        {...inputProps}
        editable={disabled ? false : inputProps.editable}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={c.inkMuted}
        style={[
          styles.input,
          {
            backgroundColor: c.surface,
            borderColor: error ? c.danger : focused ? c.primary : c.border,
            color: c.ink,
            opacity: disabled ? 0.6 : 1,
          },
          style,
        ]}
      />
      {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 52,
    paddingHorizontal: space.lg,
  },
  error: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
  },
});
