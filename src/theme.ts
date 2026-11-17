import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

import { darkColors, font, lightColors, palette } from './design/tokens';

const normalWeight: 'normal' = 'normal';

function withTypefaces(fonts: typeof MD3LightTheme.fonts) {
  return {
    ...fonts,
    displayLarge: { ...fonts.displayLarge, fontFamily: font.heavy, fontWeight: normalWeight },
    displayMedium: { ...fonts.displayMedium, fontFamily: font.heavy, fontWeight: normalWeight },
    displaySmall: { ...fonts.displaySmall, fontFamily: font.heavy, fontWeight: normalWeight },
    headlineLarge: { ...fonts.headlineLarge, fontFamily: font.heavy, fontWeight: normalWeight },
    headlineMedium: { ...fonts.headlineMedium, fontFamily: font.semibold, fontWeight: normalWeight },
    headlineSmall: { ...fonts.headlineSmall, fontFamily: font.semibold, fontWeight: normalWeight },
    titleLarge: { ...fonts.titleLarge, fontFamily: font.bold, fontWeight: normalWeight },
    titleMedium: { ...fonts.titleMedium, fontFamily: font.semibold, fontWeight: normalWeight },
    titleSmall: { ...fonts.titleSmall, fontFamily: font.semibold, fontWeight: normalWeight },
    bodyLarge: { ...fonts.bodyLarge, fontFamily: font.regular, fontWeight: normalWeight },
    bodyMedium: { ...fonts.bodyMedium, fontFamily: font.regular, fontWeight: normalWeight },
    bodySmall: { ...fonts.bodySmall, fontFamily: font.regular, fontWeight: normalWeight },
    labelLarge: { ...fonts.labelLarge, fontFamily: font.semibold, fontWeight: normalWeight },
    labelMedium: { ...fonts.labelMedium, fontFamily: font.semibold, fontWeight: normalWeight },
    labelSmall: { ...fonts.labelSmall, fontFamily: font.semibold, fontWeight: normalWeight },
  };
}

const lightFonts = withTypefaces(MD3LightTheme.fonts);
const darkFonts = withTypefaces(MD3DarkTheme.fonts);

export const miocaseLightTheme = {
  ...MD3LightTheme,
  fonts: lightFonts,
  roundness: 16,
  colors: {
    ...MD3LightTheme.colors,
    primary: lightColors.primary,
    onPrimary: lightColors.onPrimary,
    primaryContainer: palette.greenSoft,
    onPrimaryContainer: palette.greenDark,
    secondary: lightColors.danger,
    onSecondary: lightColors.onDanger,
    secondaryContainer: palette.redSoft,
    onSecondaryContainer: palette.red,
    tertiary: lightColors.accent,
    onTertiary: lightColors.onAccent,
    tertiaryContainer: palette.yellowSoft,
    onTertiaryContainer: lightColors.onAccent,
    background: lightColors.background,
    surface: lightColors.surface,
    surfaceVariant: lightColors.surfaceMuted,
    onSurface: lightColors.ink,
    onSurfaceVariant: lightColors.inkMuted,
    outline: lightColors.inkMuted,
    outlineVariant: lightColors.border,
    error: lightColors.danger,
    onError: lightColors.onDanger,
  },
};

export const miocaseDarkTheme = {
  ...MD3DarkTheme,
  fonts: darkFonts,
  roundness: 16,
  colors: {
    ...MD3DarkTheme.colors,
    primary: darkColors.primary,
    onPrimary: darkColors.onPrimary,
    primaryContainer: darkColors.surfaceMuted,
    onPrimaryContainer: darkColors.primary,
    secondary: darkColors.danger,
    onSecondary: darkColors.onDanger,
    secondaryContainer: darkColors.surfaceMuted,
    onSecondaryContainer: darkColors.danger,
    tertiary: darkColors.accent,
    onTertiary: darkColors.onAccent,
    tertiaryContainer: darkColors.surfaceMuted,
    onTertiaryContainer: darkColors.onAccent,
    background: darkColors.background,
    surface: darkColors.surface,
    surfaceVariant: darkColors.surfaceMuted,
    onSurface: darkColors.ink,
    onSurfaceVariant: darkColors.inkMuted,
    outline: darkColors.inkMuted,
    outlineVariant: darkColors.border,
    error: darkColors.danger,
    onError: darkColors.onDanger,
  },
};
