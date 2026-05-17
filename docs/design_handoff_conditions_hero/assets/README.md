# Hero photos — placement & guidance

## TL;DR — where the winter photo goes

```
mobile/assets/hero/winter.jpg
```

Create the `hero` folder if it doesn't exist. The component references the file via:

```js
require('../../assets/hero/winter.jpg')
```

so the path is relative to `mobile/src/components/ConditionsHero.js`.

## Full set (as photos arrive)

```
mobile/assets/hero/
├── winter.jpg     ← PROVIDE FIRST
├── spring.jpg     ← future
├── summer.jpg     ← future
└── autumn.jpg     ← future
```

Update the `PHOTOS` constant in `ConditionsHero.js` to point at the new file as each one arrives:

```js
// before (only winter exists)
const PHOTOS = {
  winter: require('../../assets/hero/winter.jpg'),
  spring: require('../../assets/hero/winter.jpg'),
  summer: require('../../assets/hero/winter.jpg'),
  autumn: require('../../assets/hero/winter.jpg'),
};

// after spring.jpg is added
const PHOTOS = {
  winter: require('../../assets/hero/winter.jpg'),
  spring: require('../../assets/hero/spring.jpg'),  // ← updated
  summer: require('../../assets/hero/winter.jpg'),
  autumn: require('../../assets/hero/winter.jpg'),
};
```

## Image guidance

- **Dimensions**: ≥ 800 × 600 px, ideally 1200 × 900 px. The card renders the photo at 120 × full-card-width (~360 × 120 on a typical phone) with `resizeMode: 'cover'`, so anything wider/taller is fine.
- **File size**: keep under 250 KB per image so the bundle stays slim. Export at quality 80 JPEG.
- **Tonality**: pick **neutral, low-saturation** photographs. The time-of-day overlay does the mood work. A photograph already heavily golden, already deeply blue, or backlit-with-flare will fight the overlay.
- **Composition**: horizon roughly 60 % down the frame. The sun-glow circle sits in the upper third for dawn/morning/midday; for dusk it's in the lower-left. Avoid having a real sun in the photo at the same position — they'll fight.
- **Format**: JPEG. Auxein has no animated-hero requirements yet.

## Season-by-season direction (suggested)

| Season | Suggested subject                                                  |
|--------|---------------------------------------------------------------------|
| winter | Bare unpruned vines or pruned canes against frost-pale ground. Low contrast, slightly cool but not blue. |
| spring | Budbreak / young shoots, soft greens, flat directional light.       |
| summer | Full canopy catching ambient light, no harsh shadows.               |
| autumn | Leaves turning copper / yellow, low-angle ambient light, no fog.    |

## Quick sanity check

After dropping `winter.jpg` and running the app, open Home and confirm:

1. The hero card renders without a "missing module" error.
2. The image fills the photo band cleanly (no letterboxing, no obvious crop loss).
3. The time-of-day overlay is visible on top — you should see a coloured wash (terracotta if it's afternoon/evening, warm gold if morning, etc.) and a small circular sun glow.
4. The greeting + status badge update when you change the device clock to a different hour.

If any of those fail, see `../implementation/HomeScreen.diff.md` step 6.
