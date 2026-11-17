import { useTheme } from 'react-native-paper';

import { darkColors, lightColors, palette } from './tokens';

export function useTokens() {
  const theme = useTheme();
  return {
    ...(theme.dark ? darkColors : lightColors),
    primaryContainer: theme.dark ? darkColors.surfaceMuted : palette.greenSoft,
  };
}
