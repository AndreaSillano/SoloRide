export const colors = {
  background: '#F4F1E9',
  backgroundRaised: '#FAF8F2',
  surface: '#FFFEFA',
  surfaceMuted: '#ECE8DE',
  text: '#1C2922',
  textSoft: '#435249',
  muted: '#758078',
  primary: '#1D5A43',
  primaryPressed: '#154533',
  primarySoft: '#DCE9E1',
  accent: '#D8754D',
  accentPressed: '#B95C38',
  accentSoft: '#F4DED2',
  border: '#DED9CD',
  borderStrong: '#C8C1B3',
  danger: '#A94235',
  dangerSurface: '#F8E2DE',
  white: '#FFFFFF',
  shadow: '#15251D',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  xxl: 44,
} as const;

export const radius = {
  xs: 10,
  sm: 14,
  md: 20,
  lg: 28,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 2,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 5,
  },
} as const;
