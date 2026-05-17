// brand.jsx — Auxein brand tokens lifted from /mobile/src/styles/theme.js
// Kept identical to RN tokens so these mocks stay in sync with prod.

const AX = {
  olive: '#5B6830',
  oliveDeep: '#4a5a28',
  oliveLight: 'rgba(91,104,48,0.10)',
  oliveBorder: 'rgba(91,104,48,0.25)',
  oliveOnLight: '#3f4a1f',
  sand: '#FDF6E3',
  sandWarm: '#F6EFD6',
  terracotta: '#D1583B',
  terracottaDark: '#B84A2E',
  charcoal: '#2F2F2F',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#1f2937',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
  bg: '#f8fafc',
  bgWarm: '#f5f1e6',
  success: '#16a34a',
  successBg: '#dcfce7',
  successBorder: '#86efac',
  warning: '#f59e0b',
  warningBg: '#fef3c7',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  info: '#2d5a87',
  infoBg: '#dbeafe',
  // satellite-style synthesized palette (no real imagery)
  satDark: '#3b3a2a',
  satMid: '#5a5e3a',
  satField: '#7a8a4a',
  satEarth: '#7a6347',
};

const TYPE = {
  // matches RN `fontFamily: 'System'`
  ui: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", system-ui, sans-serif',
  display: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};

// ─────────────────────────────────────────────────────────────
// Feather icons (matches React Native @expo/vector-icons set).
// Stroke 2, round caps. Sized via `size` prop.
// ─────────────────────────────────────────────────────────────
const FEATHER_PATHS = {
  home: 'M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  'map-pin': 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-left': 'M15 18l-6-6 6-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  clipboard: 'M9 2h6a2 2 0 0 1 2 2v2H7V4a2 2 0 0 1 2-2z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'alert-triangle': 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  'alert-octagon': 'M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z M12 8v4 M12 16h.01',
  tool: 'M14.7 6.3a4 4 0 0 0 5.4 5.4l-9.4 9.4a2 2 0 0 1-2.8 0l-3-3a2 2 0 0 1 0-2.8l9.4-9.4a4 4 0 0 0 0 .4z',
  package: 'M16.5 9.4L7.5 4.21 M21 16V8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0L4 6.27A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'user-plus': 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M20 8v6 M23 11h-6',
  plus: 'M12 5v14 M5 12h14',
  x: 'M18 6L6 18 M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  'check-circle': 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  map: 'M1 6v15l7-3 8 3 7-3V3l-7 3-8-3-7 3z M8 3v15 M16 6v15',
  cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  'cloud-rain': 'M16 13v8 M8 13v8 M12 15v8 M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  wind: 'M9.59 4.59A2 2 0 1 1 11 8H2 M12.59 19.41A2 2 0 1 0 14 16H2 M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2',
  droplet: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
  thermometer: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22V15',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  'trending-up': 'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  layers: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  'arrow-right': 'M5 12h14 M12 5l7 7-7 7',
  navigation: 'M3 11l19-9-9 19-2-8-8-2z',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'log-in': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3',
  'log-out': 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  pin: 'M12 17v5 M9 10.76A2 2 0 0 1 8 8.42V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4.42a2 2 0 0 1-1 1.74L12 13 9 10.76z',
};

function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 2, style = {} }) {
  const d = FEATHER_PATHS[name];
  if (!d) return <span style={{ color: 'red', fontSize: 10 }}>?{name}</span>;
  const paths = d.split('M').filter(Boolean).map((p) => 'M' + p.trim());
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
    >
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Auxein logo mark — simple geometric “sprout in a square” glyph.
// (Placeholder. Replace with real /assets/brand/logo-mark.png export later.)
// ─────────────────────────────────────────────────────────────
function LogoMark({ size = 28, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="none" stroke={color} strokeWidth="2.2" />
      <path
        d="M16 23 V14 M16 14 C 12 14 10 11 10 8 C 14 8 16 11 16 14 Z M16 14 C 20 14 22 11 22 8 C 18 8 16 11 16 14 Z"
        fill={color} fillOpacity="0.92" stroke="none"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Synthesized "satellite map" backdrop. Pure CSS — no imagery.
// Wraps children so blocks/pins can be positioned over it.
// ─────────────────────────────────────────────────────────────
function SatBackdrop({ children, style = {} }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `
        radial-gradient(120% 80% at 25% 30%, #6b7a44 0%, transparent 55%),
        radial-gradient(80% 60% at 75% 70%, #7a8a4a 0%, transparent 60%),
        radial-gradient(60% 40% at 60% 20%, #8a7a4f 0%, transparent 55%),
        radial-gradient(40% 30% at 15% 85%, #5a4f33 0%, transparent 55%),
        linear-gradient(160deg, #4a5230 0%, #3e4628 50%, #3a3a26 100%)
      `,
      ...style,
    }}>
      {/* faint vine row striations */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(38deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 9px)',
        opacity: 0.6, pointerEvents: 'none',
      }} />
      {/* corner vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 90% at 50% 60%, transparent 50%, rgba(0,0,0,0.35) 100%)',
        pointerEvents: 'none',
      }} />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Horizon illustration — sky → field → soil, stylized for hero card.
// All CSS, no SVG drawing beyond simple ellipses.
// ─────────────────────────────────────────────────────────────
function HorizonIllustration({ height = 120, mood = 'morning' }) {
  const moods = {
    morning: { sky1: '#fef3c7', sky2: '#FDF6E3', sun: '#f59e0b', hill1: '#6b7a44', hill2: '#4a5a28' },
    midday:  { sky1: '#dbeafe', sky2: '#f0f9ff', sun: '#fbbf24', hill1: '#6b7a44', hill2: '#5B6830' },
    dusk:    { sky1: '#fed7aa', sky2: '#fca5a5', sun: '#D1583B', hill1: '#4a5a28', hill2: '#3a4220' },
  };
  const m = moods[mood] || moods.morning;
  return (
    <div style={{
      position: 'relative', height, overflow: 'hidden',
      background: `linear-gradient(180deg, ${m.sky1} 0%, ${m.sky2} 100%)`,
    }}>
      {/* sun */}
      <div style={{
        position: 'absolute', right: 28, top: 18,
        width: 38, height: 38, borderRadius: '50%',
        background: m.sun, opacity: 0.85,
        boxShadow: `0 0 40px ${m.sun}80`,
      }} />
      {/* back hill */}
      <div style={{
        position: 'absolute', bottom: -30, left: '-15%', right: '-15%', height: 90,
        background: m.hill1, borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
        opacity: 0.7,
      }} />
      {/* front hill */}
      <div style={{
        position: 'absolute', bottom: -40, left: '-25%', right: '20%', height: 80,
        background: m.hill2, borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
      }} />
      {/* vine rows on front hill (subtle stripes) */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 36,
        backgroundImage: 'repeating-linear-gradient(95deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 7px)',
      }} />
    </div>
  );
}

Object.assign(window, { AX, TYPE, Icon, LogoMark, SatBackdrop, HorizonIllustration });
