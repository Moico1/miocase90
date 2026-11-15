import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

export const miocaseLightTheme = {
  ...MD3LightTheme,
  roundness: 16,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#087A55',
    onPrimary: '#FFFFFF',
    primaryContainer: '#B9F0D8',
    onPrimaryContainer: '#002115',
    secondary: '#B85C18',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#FFDBC5',
    onSecondaryContainer: '#3C1600',
    background: '#F6F8F5',
    surface: '#FFFFFF',
    surfaceVariant: '#E2EAE4',
    onSurface: '#17211B',
    onSurfaceVariant: '#536158',
    outline: '#748279',
    outlineVariant: '#C4CEC6',
  },
};

export const miocaseDarkTheme = {
  ...MD3DarkTheme,
  roundness: 16,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#75DDB0',
    onPrimary: '#003824',
    primaryContainer: '#005137',
    onPrimaryContainer: '#B9F0D8',
    secondary: '#FFB987',
    onSecondary: '#542200',
    secondaryContainer: '#773500',
    onSecondaryContainer: '#FFDBC5',
    background: '#101713',
    surface: '#17211B',
    surfaceVariant: '#303B34',
    onSurface: '#E0E9E2',
    onSurfaceVariant: '#BFCAC2',
    outline: '#89958C',
    outlineVariant: '#414C44',
  },
};
