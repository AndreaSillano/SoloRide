export const colors = {
  // Rhodeo sunrise — sampled from the coral/orange/gold app icon.
  background: '#FFF6EE',
  backgroundRaised: '#FFFCF8',
  surface: '#FFFFFF',
  surfaceMuted: '#FCEAE1',
  text: '#3B2527',
  textSoft: '#684649',
  muted: '#8E6664',
  // Bright apricot-orange from the center of the Rhodeo icon.
  primary: '#FF5C1A',
  primaryPressed: '#E04E12',
  primarySoft: '#FFE4D3',
  accent: '#E87645',
  accentPressed: '#CF5F35',
  accentSoft: '#FFF0CF',
  highlight: '#F8C957',
  border: '#F0D7CC',
  borderStrong: '#DDAF9E',
  danger: '#B72E43',
  dangerSurface: '#FFE7EA',
  // Soft warm info chrome (aliases of muted / surfaceMuted — no blue drift).
  info: '#8E6664',
  infoSurface: '#FCEAE1',
  white: '#FFFFFF',
  shadow: '#77333B',
  glassFill: 'rgba(255, 246, 238, 0.72)',
  glassBorder: 'rgba(221, 175, 158, 0.45)',
  glassFillDark: 'rgba(28, 16, 14, 0.38)',
  glassBorderDark: 'rgba(255, 255, 255, 0.28)',
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
  sm: 16,
  md: 22,
  lg: 30,
  xl: 36,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 6,
  },
  glow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  challenge: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 12,
  },
} as const;
