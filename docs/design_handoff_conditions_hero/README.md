# Handoff: Conditions Hero (Direction A · time-of-day overlays)

## Overview

This handoff implements the new hero card for the Auxein Grow mobile home screen. The card sits at the top of `HomeScreen.js` (above the existing 4-tile stat grid) and shows:

- A **time-aware greeting** ("Good morning, Sam")
- A **seasonal vineyard photograph** (winter / spring / summer / autumn — picked from the device date)
- A **time-of-day CSS overlay** stacked on top of the photo (dawn / morning / midday / dusk — also picked from the device clock)
- A **status badge** (e.g. "SPRAY OK", "WIND ↑") driven by the existing weather API
- A **weather strip** with temperature, humidity, wind, and rain (also from the existing weather API)

The end effect is that the home screen visually shifts through the day on a single photo, and shifts across the year as new seasonal photos are dropped in. **One photo per season; four CSS overlays do all the mood work.**

## About the design files

The files in `design-references/` are **HTML prototypes** that demonstrate intended look and behaviour. They are not production code to copy directly. Your task is to **recreate them in the existing React Native (Expo) codebase** at `mobile/`, using its established patterns (`react-native-safe-area-context`, `@expo/vector-icons` for Feather icons, the design tokens in `mobile/src/styles/theme.js`, etc.).

To open the prototype: open `design-references/A4 + A6 Drill-down.html` in a browser. The "A4 · Time-of-day overlays" section shows the four target states (dawn / morning / midday / dusk); the "Interactive · scrub through the day" section lets you drag through all four to see transitions.

A ready-to-paste React Native version of the component is in `implementation/ConditionsHero.js`. Use it as a starting point — adjust style values and imports to match your codebase conventions.

## Fidelity

**High-fidelity.** Colours, spacing, type sizes, and the overlay gradients are final. Use the exact values in this README. The photographs are placeholders pending real seasonal shots — see "Assets" below.

## Screens / Views

There is one new component (`ConditionsHero`) that mounts at the top of one existing screen (`HomeScreen`).

### `ConditionsHero`

A self-contained card that owns its own time-of-day state and re-derives the overlay every minute. Receives weather data + user name as props.

**Layout** (top to bottom, inside a single rounded-16 card with 1px `colors.border` outline + light shadow):

1. **Photo band** — fixed height 120 px, full width of the card.
   - `<ImageBackground>` with the seasonal photo (see "Asset placement" below).
   - On top of the image, two stacked overlay `<View>`s — see "Time-of-day overlay spec" below.
   - A small circular `<View>` ("sun") absolutely positioned to suggest light direction.
   - A pill in the top-left corner: `HH:MM · DAWN` (or MORNING/MIDDAY/DUSK), in monospace, white text on a 45%-opaque black blurred chip (use `BlurView` from `expo-blur` if available, otherwise a translucent dark background).
2. **Content band** — `padding: 12 14 14`. A flex row:
   - **Left column**: a small uppercased date line in `colors.textMuted` (e.g. "Friday · 17 May"), and below it the greeting in 20 px SF Display, weight 700, `colors.text`, letter-spacing −0.2 (e.g. "Good morning, Sam").
   - **Right column**: a pill with a 6 px coloured dot + uppercase label, e.g. "SPRAY OK" (green), "WIND ↑ 18km/h" (amber). Background and border colours match the dot.
3. **Weather strip** — a flex row, 14 px above the bottom of the content band, 4 px gap. Four cells, each centred:
   - Feather icon (18 px, `colors.olive`) — `thermometer`, `droplet`, `wind`, `cloud-rain`
   - Value: SF Display, 17 px, weight 700, `colors.text`
   - Label: 10 px, weight 600, `colors.textMuted`, letter-spacing 0.3, uppercased — `Temp`, `Humid`, `km/h`, `mm`

## Interactions & behaviour

- The card recomputes its time-of-day every 60 seconds (or whenever the screen regains focus). No animation on the transition is required for v1 — a snap is fine. (A 600 ms cross-fade between overlays is a nice-to-have for v2; see "Out of scope" below.)
- The status badge label and colour are driven by **weather state**, not by time of day. Map of weather state → badge:
  - Wind ≤ 12 km/h AND no rain forecast → `SPRAY OK` (green, `colors.success`)
  - Wind 12–20 km/h → `WIND ↑ <speed>km/h` (amber, `colors.warning`)
  - Wind > 20 km/h OR rain forecast in next hour → `NO SPRAY` (red, `colors.danger`)
  - Falls outside daylight hours → `LIGHT FADING` (terracotta, `colors.terracotta`) **takes precedence**
- The greeting text changes with time of day:
  - dawn → "Early start, {firstName}"
  - morning → "Good morning, {firstName}"
  - midday → "Good afternoon, {firstName}"
  - dusk → "Wrap up, {firstName}"
- Tap on the card does nothing in v1 (it is purely informational). If you want to make it tappable later, route to a "Conditions detail" screen showing the next 24 h forecast.

## Time-of-day overlay spec

The card uses **one neutral seasonal photograph** as the base. Four CSS-equivalent overlay packs are stacked on top to produce dawn / morning / midday / dusk. The web prototype uses CSS gradients; in React Native use **`expo-linear-gradient`** for the linear gradients and absolutely-positioned `<View>` blocks with `borderRadius` + `shadowColor` (iOS) / `elevation` (Android) for the radial "sun glow."

The four overlay packs, each as exact stops, are:

### Dawn (≈ 04:30 – 07:00 local)
- Layer 1 (linear, top → bottom):
  - 0%   `rgba(35, 46, 82, 0.55)`
  - 38%  `rgba(120, 90, 90, 0.25)`
  - 60%  `rgba(255, 184, 140, 0.18)`
  - 100% `rgba(20, 30, 40, 0.40)`
- Layer 2 (radial – fake with a 60×60 px circular `View` with `backgroundColor: rgba(255, 180, 140, 0.45)`, `borderRadius: 30`, positioned at 78 % x / 32 % y of the photo band, with a heavy shadow):
  - View: `width: 26, height: 26, borderRadius: 13, backgroundColor: '#ffb088', opacity: 0.85, shadowColor: '#ffb088', shadowOffset: { width: 0, height: 0 }, shadowRadius: 60, shadowOpacity: 0.6, elevation: 8`
- Greeting accent dot: `#3b82f6`
- Status badge precedence: light-fading not yet active; falls to weather-driven badge unless before sunrise.

### Morning (≈ 07:00 – 11:30 local)
- Layer 1 (linear):
  - 0%   `rgba(254, 243, 199, 0.45)`
  - 50%  `rgba(253, 246, 227, 0.22)`
  - 100% `rgba(91, 104, 48, 0.12)`
- Layer 2 (sun View): 34×34, `#fbbf24`, shadow radius 70, at 82 % x / 24 % y, opacity 0.85
- Greeting accent dot: `colors.olive`

### Midday (≈ 11:30 – 15:00 local)
- Layer 1 (linear):
  - 0%   `rgba(255, 255, 255, 0.30)`
  - 40%  `rgba(255, 255, 255, 0.05)`
  - 100% `rgba(0, 0, 0, 0.10)`
- Layer 2 (sun View): 42×42, `#fef3c7`, shadow radius 90, at 50 % x / 12 % y, opacity 0.7
- Greeting accent dot: `colors.olive`

### Dusk (≈ 15:00 – 20:00 local)
- Layer 1 (linear):
  - 0%   `rgba(120, 40, 30, 0.30)`
  - 30%  `rgba(209, 88, 59, 0.45)`
  - 60%  `rgba(120, 80, 40, 0.40)`
  - 100% `rgba(40, 30, 20, 0.55)`
- Layer 2 (sun View): 30×30, `colors.terracotta`, shadow radius 80, at 20 % x / 60 % y, opacity 0.85
- Greeting accent dot: `colors.terracotta`

### Out of band (20:00 – 04:30)
- Treat as dusk for v1. (The card stays terracotta + low-sun until dawn returns.)

A precomputed `TOD_OVERLAYS` constant + a `phaseOf(date)` helper are in `implementation/tod.js`. **Use them; do not re-derive the colour stops in the component itself.**

## Season → photograph mapping

The base photograph is picked once per render from the device clock.

**Hemisphere matters.** Auxein is New Zealand-based, so default to the **Southern Hemisphere**. Make this configurable for future expansion.

| Months (NZ)     | Season  | Photo filename     |
|-----------------|---------|--------------------|
| Dec / Jan / Feb | summer  | `summer.jpg`       |
| Mar / Apr / May | autumn  | `autumn.jpg`       |
| Jun / Jul / Aug | winter  | `winter.jpg`       |
| Sep / Oct / Nov | spring  | `spring.jpg`       |

A `seasonOf(date, hemisphere)` helper is in `implementation/seasons.js`.

### Asset placement

Place the seasonal photographs at:

```
mobile/assets/hero/
├── winter.jpg     ← the FIRST photo provided by the user — drop here
├── spring.jpg     ← future
├── summer.jpg     ← future
└── autumn.jpg     ← future
```

**Image guidance**
- Dimensions: at least **800 × 600 px**, ideally 1200 × 900 px. Aspect ratio is forgiving (the card crops to 120 × full-card-width, which is roughly 16:5 on a phone). The photo is rendered with `resizeMode: 'cover'`.
- The photograph should be **tonally neutral** — the time-of-day overlay does the mood work. A photo already heavily golden or already deeply blue will fight the overlay.
- Pick a composition with the horizon roughly 60 % down the frame so the sun-glow View doesn't crash into a horizon line.
- For **winter**: bare unpruned vines / pruned canes against frost-pale ground, low contrast, slightly cool but not blue.
- For **spring**: budbreak / young shoots, soft greens, no strong directional light.
- For **summer**: full canopy, leaves catching ambient light, no harsh shadows.
- For **autumn**: leaves turning copper / yellow, low-angle ambient light, no fog.

### Fallback while photos arrive

Until all four seasons have a photograph, fall back to whichever is available. The `getSeasonPhoto()` function in `implementation/ConditionsHero.js` does this with a fixed map — when only `winter.jpg` exists, every season points at it. Update the map as new photos arrive:

```js
const PHOTOS = {
  winter: require('../../assets/hero/winter.jpg'),
  // until real photos arrive, point them all at winter.jpg:
  spring: require('../../assets/hero/winter.jpg'),
  summer: require('../../assets/hero/winter.jpg'),
  autumn: require('../../assets/hero/winter.jpg'),
};
```

## State management

`ConditionsHero` owns one piece of internal state — the current time-of-day phase — and re-evaluates it on a 60-second `setInterval` and on `useFocusEffect`. All other inputs (weather, user name, date) come in as props.

```js
<ConditionsHero
  firstName={user?.first_name ?? user?.name?.split(' ')[0] ?? 'there'}
  weather={weather}              // shape: { temp, hi, humidity, windKmh, gustKmh, rainMmNextHour }
  date={new Date()}              // pass through so it's testable
  hemisphere="south"             // optional, default "south"
/>
```

The existing `weatherService` (whatever you have wired up — confirm in `mobile/src/api/services.js`) should return the same shape, or be adapted into it inside `HomeScreen.js` before passing in.

## Design tokens

All values come from `mobile/src/styles/theme.js`. The handoff introduces no new tokens. Specifically:

- Primary olive: `colors.olive` (`#5B6830`)
- Terracotta accent: `colors.terracotta` (`#D1583B`)
- Sand: `colors.sand` (`#FDF6E3`)
- Card surface: `colors.surface` (`#FFFFFF`)
- Card border: `colors.border` (`#e5e7eb`)
- Status colours: `colors.success`, `colors.warning`, `colors.danger`
- Spacing: `spacing.base` (16), `spacing.sm` (8), `spacing.md` (12)
- Radius: `radius.lg` (12), `radius.xl` (16)
- Type sizes: greeting `fontSize.xl` (24 — note: card uses 20, override locally), weather value uses 17 (locally — also override)

## Dependencies

- `expo-linear-gradient` — already used elsewhere in Expo apps; verify it's in `package.json`. If not: `npx expo install expo-linear-gradient`.
- `expo-blur` (optional, for the time chip background) — if not present, fall back to a 45 % opaque black `View`.
- `@expo/vector-icons` (Feather) — already used in `HomeScreen.js`.

## Integration

See `implementation/HomeScreen.diff.md` for the exact edits to `mobile/src/screens/HomeScreen.js`. In short:

1. Import `ConditionsHero` from `../components/ConditionsHero`.
2. Inside the `<ScrollView>`, **above** the existing `<View style={styles.tileGrid}>`, render the hero. Pass `weather`, `firstName`, and a fresh `Date()`.

## Out of scope (v1)

- Crossfade animation between time-of-day overlays — v1 snaps. (For v2: keep both layers mounted, animate opacity over 600 ms when phase changes.)
- Continuous interpolation between phases instead of four discrete bands. (For v2: derive a 0..1 `t` between adjacent phases and interpolate every numeric value in the overlay stack.)
- "Night" overlay (20:00 – 04:30) — currently falls back to dusk.
- A tappable card linking to a 24 h forecast detail screen.

## Files in this handoff

```
design_handoff_conditions_hero/
├── README.md                              # this file
├── implementation/
│   ├── ConditionsHero.js                  # ready-to-paste RN component
│   ├── tod.js                             # time-of-day util (pure functions)
│   ├── seasons.js                         # season-from-date util (pure functions)
│   └── HomeScreen.diff.md                 # how to wire into existing HomeScreen
├── assets/
│   └── README.md                          # where the photos go (just a copy of the table above)
└── design-references/
    ├── A4 + A6 Drill-down.html            # open this in a browser
    ├── Auxein Hero Home.html              # the four-direction parent canvas (for context)
    ├── brand.jsx                          # design tokens used in the HTML prototypes
    ├── shared.jsx                         # shared chrome (header, tab bar, FAB)
    ├── hero-visuals.jsx                   # the eight earlier visual treatments
    ├── hero-drill.jsx                     # the four time-of-day variants
    ├── hero-a.jsx, hero-b.jsx, hero-c.jsx, hero-d.jsx  # the parent four-direction screens
    ├── design-canvas.jsx, ios-frame.jsx   # canvas + iOS frame components
    └── theme.js, HomeScreen.js, AppNavigator.js  # current production source for reference
```
