export const colors = {
  // Rhodeo sunrise — sampled from the coral/orange/gold app icon.
  background: '#FFF9F3',
  backgroundRaised: '#FFFCF8',
  surface: '#FFFFFF',
  surfaceMuted: '#FCEAE1',
  text: '#3B2527',
  textSoft: '#684649',
  muted: '#8E6664',
  // Deep burnt orange stays legible when used for icons and solid controls.
  primary: '#C6532F',
  primaryPressed: '#A94126',
  primarySoft: '#FFE5D6',
  accent: '#B94C2F',
  accentPressed: '#9F3D26',
  accentSoft: '#FFF0CC',
  highlight: '#F6C658',
  border: '#F0D7CC',
  borderStrong: '#DDAF9E',
  danger: '#B72E43',
  dangerSurface: '#FFE7EA',
  white: '#FFFFFF',
  shadow: '#77333B',
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
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 5,
  },
} as const;
