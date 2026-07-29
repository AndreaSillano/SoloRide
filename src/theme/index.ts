export const colors = {
  // Chalk studio — clean photo-app light
  background: '#F3F5F8',
  backgroundRaised: '#FAFBFC',
  surface: '#FFFFFF',
  surfaceMuted: '#E4E9F0',
  text: '#12151A',
  textSoft: '#3E4651',
  muted: '#7B8491',
  // Near-black ink for primary actions
  primary: '#1A1F2B',
  primaryPressed: '#0F1218',
  primarySoft: '#E6E9EF',
  // Electric cobalt — athletic signal
  accent: '#2F6BFF',
  accentPressed: '#1F54DB',
  accentSoft: '#DCE7FF',
  border: '#D5DBE4',
  borderStrong: '#AAB4C2',
  danger: '#D63B3B',
  dangerSurface: '#FCE8E8',
  white: '#FFFFFF',
  shadow: '#10141C',
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
