# HomeScreen.js integration patch

This describes the exact edits to make to `mobile/src/screens/HomeScreen.js`. The hero card sits **above the existing tile grid**, inside the same `<ScrollView>`, and uses the same horizontal padding pattern.

## 1. Add the import

At the top of the file, alongside the other component imports:

```js
import ConditionsHero from '../components/ConditionsHero';
```

If you don't already have a weather service wired in, add an import for it too — e.g.:

```js
import { weatherService } from '../api/services';
```

## 2. Add weather state

Inside `HomeScreen`, alongside the other `useState` hooks:

```js
const [weather, setWeather] = useState({
  temp: null, hi: null, humidity: null, windKmh: null, gustKmh: null, rainMmNextHour: 0,
});
```

## 3. Load weather in `loadData`

Inside the existing `loadData` callback's `Promise.all`, add a weather fetch:

```js
const [tasksRes, runsRes, unreadRes, visitorsRes, weatherRes] = await Promise.all([
  tasksService.getUnifiedFeed({ days_ahead: 7 }).catch(() => []),
  observationService.listRuns({ active_only: true }).catch(() => []),
  notificationService.getUnreadCount().catch(() => null),
  visitorService.listActive().catch(() => []),
  weatherService.getCurrent({ propertyId: selectedPropertyId }).catch(() => null),
]);
// ...existing setters
if (weatherRes) setWeather(weatherRes);
```

Adapt `weatherService.getCurrent(...)` to whatever your existing weather endpoint is called. The shape `ConditionsHero` expects is:

```ts
{
  temp: number,          // °C, current
  hi: number,            // °C, today's high (optional, not used by v1 card)
  humidity: number,      // %
  windKmh: number,       // current wind speed in km/h
  gustKmh: number,       // gust speed in km/h (optional, not used by v1 card)
  rainMmNextHour: number // forecast rain in the next 60 min
}
```

If your service returns a different shape, map it inside the `.then(...)` before `setWeather`.

## 4. Render the hero

Inside the `<ScrollView>`, **as the very first child of `contentContainerStyle={styles.scrollContent}`**, before the existing `<View style={styles.tileGrid}>`:

```jsx
<ConditionsHero
  firstName={user?.first_name ?? user?.name?.split(' ')[0] ?? 'there'}
  weather={weather}
  hemisphere="south"
/>
```

The component owns its own horizontal margin (`marginHorizontal: spacing.base`) and top margin (`marginTop: spacing.base`), so do NOT add additional wrapper padding — just drop it in.

## 5. Remove the redundant top padding on the tile grid

Currently the tile grid has `paddingTop: spacing.base` baked in via `styles.tileGrid`. With the hero now sitting above it, change that to keep the visual rhythm tight:

```js
tileGrid: {
  flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  paddingHorizontal: spacing.base,
  paddingTop: spacing.base,  // unchanged — gives air between the hero and the tiles
},
```

(No actual change needed unless you find the gap too generous when running it.)

## 6. Verify imports + props

Run the app. The hero should appear above the four tiles. If you only have `winter.jpg` placed so far, the same image will show year-round — that's expected; update the `PHOTOS` map in `ConditionsHero.js` as the other seasonal shots arrive.

## Optional clean-up

If you want to free up the screen's "good morning" feel, you may delete the `<Text>` element that currently renders the brand wordmark "Auxein Grow" in the header — the hero greeting now carries that role. (Up to product; leaving it in is also fine.)
