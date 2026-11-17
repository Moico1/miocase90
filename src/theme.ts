import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

const brandFont = 'PlayfairDisplay_900Black_Italic';

function titleFonts(fonts: typeof MD3LightTheme.fonts) {
  return {
    ...fonts,
    displayLarge: { ...fonts.displayLarge, fontFamily: brandFont },
    displayMedium: { ...fonts.displayMedium, fontFamily: brandFont },
    displaySmall: { ...fonts.displaySmall, fontFamily: brandFont },
    headlineLarge: { ...fonts.headlineLarge, fontFamily: brandFont },
    headlineMedium: { ...fonts.headlineMedium, fontFamily: brandFont },
    headlineSmall: { ...fonts.headlineSmall, fontFamily: brandFont },
    titleLarge: { ...fonts.titleLarge, fontFamily: brandFont },
    titleMedium: { ...fonts.titleMedium, fontFamily: brandFont },
    titleSmall: { ...fonts.titleSmall, fontFamily: brandFont },
  };
}

export const miocaseLightTheme = {
  ...MD3LightTheme,
  roundness: 16,
  fonts: titleFonts(MD3LightTheme.fonts),
  colors: {
    ...MD3LightTheme.colors,
    primary: '#007934',
    onPrimary: '#FFFFFF',
    primaryContainer: '#B5E5C8',
    onPrimaryContainer: '#00210E',
    secondary: '#D52B1E',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#FFDAD4',
    onSecondaryContainer: '#410002',
    tertiary: '#F9E300',
    onTertiary: '#1C1B00',
    tertiaryContainer: '#F5E788',
    onTertiaryContainer: '#231F00',
    background: '#FAF8F1',
    surface: '#FFFEFA',
    surfaceVariant: '#E9E5D9',
    onSurface: '#1C1B17',
    onSurfaceVariant: '#56544D',
    outline: '#78756D',
    outlineVariant: '#CAC6BB',
  },
};

export const miocaseDarkTheme = {
  ...MD3DarkTheme,
  roundness: 16,
  fonts: titleFonts(MD3DarkTheme.fonts),
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#75DDB0',
    onPrimary: '#003824',
    primaryContainer: '#005137',
    onPrimaryContainer: '#B5E5C8',
    secondary: '#FFB4A9',
    onSecondary: '#690005',
    secondaryContainer: '#93000A',
    onSecondaryContainer: '#FFDAD4',
    tertiary: '#F9E300',
    onTertiary: '#1C1B00',
    tertiaryContainer: '#4A4300',
    onTertiaryContainer: '#F5E788',
    background: '#14130F',
    surface: '#1D1C17',
    surfaceVariant: '#34332B',
    onSurface: '#E7E3D8',
    onSurfaceVariant: '#C9C4B8',
    outline: '#918D81',
    outlineVariant: '#49473F',
  },
};
