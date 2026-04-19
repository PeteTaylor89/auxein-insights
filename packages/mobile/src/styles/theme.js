// mobile/src/styles/theme.js — Auxein design tokens for React Native
export const colors = {
  olive: '#5B6830',
  oliveLight: 'rgba(91, 104, 48, 0.1)',
  oliveBorder: 'rgba(91, 104, 48, 0.25)',
  sand: '#FDF6E3',
  terracotta: '#D1583B',
  terracottaDark: '#B84A2E',
  charcoal: '#2F2F2F',
  white: '#FFFFFF',

  primary: '#5B6830',
  primaryHover: '#4a5a28',
  accent: '#D1583B',
  surface: '#FFFFFF',
  surfaceWarm: '#FDF6E3',
  text: '#1f2937',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  borderLight: '#f3f4f6',

  // Wireframe backgrounds
  background: '#f8fafc',
  backgroundWarm: '#f1f5f9',

  // Context-colored headers
  headerObs: '#5B6830',
  headerIncident: '#991b1b',
  headerIncidentGrad: '#b91c1c',
  headerTask: '#5B6830',

  // GPS section
  gps: '#166534',
  gpsBg: '#f0fdf4',
  gpsBorder: '#bbf7d0',
  gpsActive: '#22c55e',

  // Status
  success: '#16a34a',
  successLight: '#22c55e',
  successBg: '#dcfce7',
  successBorder: '#86efac',
  warning: '#f59e0b',
  warningDark: '#92400e',
  warningBg: '#fef3c7',
  warningBorder: '#f59e0b',
  danger: '#dc2626',
  dangerDark: '#991b1b',
  dangerBg: '#fee2e2',
  dangerBorder: '#fca5a5',
  info: '#2d5a87',
  infoBg: '#dbeafe',

  // Track map
  trackBlue: '#3b82f6',
  trackBlueDark: '#2563eb',
  trackLive: '#ef4444',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  pill: 999,
};

export const fontFamily = 'System';

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
};
