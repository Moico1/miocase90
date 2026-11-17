export const palette = {
  green: '#007934',
  greenDark: '#00561F',
  greenSoft: '#E4F3EA',
  yellow: '#F9E300',
  yellowSoft: '#FFF9C2',
  red: '#D52B1E',
  redSoft: '#FCE8E6',
} as const;

export const lightColors = {
  background: '#FBF8F1',
  surface: '#FFFFFF',
  surfaceMuted: '#F3EEE2',
  ink: '#1C1B17',
  inkMuted: '#6B675E',
  border: '#ECE6D8',
  primary: palette.green,
  onPrimary: '#FFFFFF',
  accent: palette.yellow,
  onAccent: '#1C1B00',
  danger: palette.red,
  onDanger: '#FFFFFF',
} as const;

export const darkColors = {
  background: '#14130F',
  surface: '#1F1E19',
  surfaceMuted: '#2A2822',
  ink: '#F4F1E8',
  inkMuted: '#A9A497',
  border: '#34322A',
  primary: '#4FD18A',
  onPrimary: '#00210F',
  accent: palette.yellow,
  onAccent: '#1C1B00',
  danger: '#FF8A80',
  onDanger: '#410002',
} as const;

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const font = {
  brand: 'PlayfairDisplay_900Black_Italic',
  regular: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  heavy: 'PlusJakartaSans_800ExtraBold',
} as const;

export const shadow = {
  card: {
    shadowColor: '#2B2410',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#2B2410',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
