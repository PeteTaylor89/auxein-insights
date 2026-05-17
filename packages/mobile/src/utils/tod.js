// mobile/src/utils/tod.js — time-of-day phase + per-phase overlay configuration
// Pure functions. No React, no platform-specific code.
//
// The phase bands are hard-coded clock thresholds (not solar) so behaviour is
// predictable for QA. Swap in suncalc later if you want true civil twilight.

export const PHASES = ['dawn', 'morning', 'midday', 'dusk'];

/**
 * phaseOf(date) -> 'dawn' | 'morning' | 'midday' | 'dusk'
 * 04:30–07:00 dawn · 07:00–11:30 morning · 11:30–15:00 midday · everything else dusk.
 * Out-of-band (20:00–04:30) falls through to dusk by design — keeps the hero
 * warm + low-sun until the day actually begins.
 */
export function phaseOf(date = new Date()) {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m >= 4 * 60 + 30 && m < 7 * 60)        return 'dawn';
  if (m >= 7 * 60         && m < 11 * 60 + 30) return 'morning';
  if (m >= 11 * 60 + 30   && m < 15 * 60)     return 'midday';
  return 'dusk';
}

/**
 * Greeting copy per phase. firstName is interpolated.
 */
export function greetingOf(phase, firstName = 'there') {
  switch (phase) {
    case 'dawn':    return `Early start, ${firstName}`;
    case 'morning': return `Good morning, ${firstName}`;
    case 'midday':  return `Good afternoon, ${firstName}`;
    case 'dusk':    return `Wrap up, ${firstName}`;
    default:        return `Hi, ${firstName}`;
  }
}

/**
 * Per-phase overlay configuration consumed by <ConditionsHero/>.
 * - `gradient.colors` / `gradient.locations`: arguments to <LinearGradient/>.
 * - `sun.{x,y}` are 0..1 fractions of the photo band; the component multiplies
 *   them by the band's measured width/height.
 */
export const TOD_OVERLAYS = {
  dawn: {
    label: 'DAWN',
    accent: '#3b82f6',
    gradient: {
      colors: ['rgba(35,46,82,0.55)', 'rgba(120,90,90,0.25)', 'rgba(255,184,140,0.18)', 'rgba(20,30,40,0.40)'],
      locations: [0, 0.38, 0.60, 1],
    },
    sun: { x: 0.78, y: 0.32, size: 26, color: '#ffb088', shadowRadius: 60, opacity: 0.85 },
  },
  morning: {
    label: 'MORNING',
    accent: '#5B6830',
    gradient: {
      colors: ['rgba(254,243,199,0.45)', 'rgba(253,246,227,0.22)', 'rgba(91,104,48,0.12)'],
      locations: [0, 0.50, 1],
    },
    sun: { x: 0.82, y: 0.24, size: 34, color: '#fbbf24', shadowRadius: 70, opacity: 0.85 },
  },
  midday: {
    label: 'MIDDAY',
    accent: '#5B6830',
    gradient: {
      colors: ['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.10)'],
      locations: [0, 0.40, 1],
    },
    sun: { x: 0.50, y: 0.12, size: 42, color: '#fef3c7', shadowRadius: 90, opacity: 0.70 },
  },
  dusk: {
    label: 'DUSK',
    accent: '#D1583B',
    gradient: {
      colors: ['rgba(120,40,30,0.30)', 'rgba(209,88,59,0.45)', 'rgba(120,80,40,0.40)', 'rgba(40,30,20,0.55)'],
      locations: [0, 0.30, 0.60, 1],
    },
    sun: { x: 0.20, y: 0.60, size: 30, color: '#D1583B', shadowRadius: 80, opacity: 0.85 },
  },
};

/**
 * statusBadgeFor(weather, phase) -> { label, dot, bg, border, text }
 * The wind/rain rules are the spec from the README. Light-fading takes
 * precedence over weather state when the sun is gone.
 */
export function statusBadgeFor(weather = {}, phase = 'morning') {
  if (phase === 'dusk') {
    return {
      label: 'LIGHT FADING',
      dot: '#D1583B', bg: 'rgba(209,88,59,0.12)', border: 'rgba(209,88,59,0.40)', text: '#9a3d28',
    };
  }
  const wind = Number.isFinite(weather.windKmh) ? weather.windKmh : 0;
  const rain = Number.isFinite(weather.rainMmNextHour) ? weather.rainMmNextHour : 0;
  if (wind > 20 || rain > 0.2) {
    return {
      label: 'NO SPRAY',
      dot: '#dc2626', bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.40)', text: '#991b1b',
    };
  }
  if (wind > 12) {
    return {
      label: `WIND ↑ ${Math.round(wind)}km/h`,
      dot: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.40)', text: '#92400e',
    };
  }
  return {
    label: 'SPRAY OK',
    dot: '#16a34a', bg: 'rgba(22,163,74,0.10)', border: 'rgba(22,163,74,0.35)', text: '#15803d',
  };
}
