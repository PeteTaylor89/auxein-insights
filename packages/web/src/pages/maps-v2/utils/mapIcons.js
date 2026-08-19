// maps-v2/utils/mapIcons.js — Register custom SVG icons with Mapbox GL
// Renders lucide icon SVGs to canvas images for use as map markers

const ICON_SIZE = 32; // logical px (rendered at 2x for retina)

// The glyph occupies 55% of the badge, and its stroke is 2 device px on the
// 64px marker image. Both numbers are exported as PROPORTIONS so a swatch drawn
// at any size — a 20px legend chip on screen, a 140px one on an A0 sheet — is
// the same drawing as the marker on the map rather than a lookalike.
export const GLYPH_FRACTION = 0.55;
export const GLYPH_STROKE = 2 / ((ICON_SIZE * 2 * GLYPH_FRACTION) / 24); // in 24x24 glyph units
export const BADGE_RING_FRACTION = 3 / (ICON_SIZE * 2); // white ring, as a fraction of diameter

/**
 * SVG draw instructions from lucide-react icons (24x24 viewBox).
 * Each element is { type, attrs } matching the lucide icon definition.
 */
// Exported so the icon PICKER can render the very same instructions as SVG
// elements. Two drawings of one glyph — a canvas marker and a hand-drawn
// preview — is how a picker starts showing something the map does not.
export const ICON_DEFS = {
  // TriangleAlert (risks) — ! inside triangle
  risk: [
    { type: 'path', attrs: { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' } },
    { type: 'path', attrs: { d: 'M12 9v4' } },
    { type: 'path', attrs: { d: 'M12 17h.01' } },
  ],
  // Wrench (assets)
  wrench: [
    { type: 'path', attrs: { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' } },
  ],
  // ClipboardList (tasks)
  tasks: [
    { type: 'rect', attrs: { x: 8, y: 2, width: 8, height: 4, rx: 1 } },
    { type: 'path', attrs: { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' } },
    { type: 'path', attrs: { d: 'M12 11h4' } },
    { type: 'path', attrs: { d: 'M12 16h4' } },
    { type: 'path', attrs: { d: 'M8 11h.01' } },
    { type: 'path', attrs: { d: 'M8 16h.01' } },
  ],
  // --- Map features (POIs) ---
  // These are simple geometric glyphs rather than transcribed lucide paths.
  // Everything here is stroked (see drawElement — there is no fill path), so
  // plain M/L/arc shapes read more cleanly at 32px than a detailed outline
  // would, and there is no risk of a mis-copied bezier rendering as garbage.

  // Gate / access — two posts and two rails
  poiAccess: [
    { type: 'path', attrs: { d: 'M4 6 L4 19' } },
    { type: 'path', attrs: { d: 'M20 6 L20 19' } },
    { type: 'path', attrs: { d: 'M4 10 L20 10' } },
    { type: 'path', attrs: { d: 'M4 15 L20 15' } },
  ],
  // Infrastructure — a simple building outline with a pitched roof
  poiInfrastructure: [
    { type: 'path', attrs: { d: 'M4 20 L4 10 L12 4 L20 10 L20 20 Z' } },
    { type: 'path', attrs: { d: 'M10 20 L10 14 L14 14 L14 20' } },
  ],
  // Water — two stacked waves
  poiWater: [
    { type: 'path', attrs: { d: 'M3 9 Q7 5 12 9 T21 9' } },
    { type: 'path', attrs: { d: 'M3 15 Q7 11 12 15 T21 15' } },
  ],
  // Amenity — a circle with a centred dot
  poiAmenity: [
    { type: 'circle', attrs: { cx: 12, cy: 12, r: 8 } },
    { type: 'circle', attrs: { cx: 12, cy: 12, r: 2 } },
  ],
  // Note — a page with a folded corner and two text lines
  poiNote: [
    { type: 'path', attrs: { d: 'M6 3 L14 3 L19 8 L19 21 L6 21 Z' } },
    { type: 'path', attrs: { d: 'M14 3 L14 8 L19 8' } },
    { type: 'path', attrs: { d: 'M9 13 L16 13' } },
    { type: 'path', attrs: { d: 'M9 17 L16 17' } },
  ],
  // Binoculars (observations) — matches sidebar icon
  binoculars: [
    { type: 'path', attrs: { d: 'M10 10h4' } },
    { type: 'path', attrs: { d: 'M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3' } },
    { type: 'path', attrs: { d: 'M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z' } },
    { type: 'path', attrs: { d: 'M 22 16 L 2 16' } },
    { type: 'path', attrs: { d: 'M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z' } },
    { type: 'path', attrs: { d: 'M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3' } },
  ],

  // --- POI icon library (Phase 2, 2026-08-19) ---
  // Fifteen more glyphs, taking the pickable library to twenty with the five
  // category icons above. Same rules as those: stroked geometry only, 24x24
  // viewBox, no fill path — drawElement has no fill branch, so a shape that
  // relies on being filled renders as an outline and usually as mud at 32px.
  // Silhouettes are chosen to stay apart from each other at marker size; two
  // icons that differ only in interior detail are one icon on a phone.

  // Tank — cylinder, elliptical top and bottom
  poiTank: [
    { type: 'path', attrs: { d: 'M5 7 Q12 4 19 7' } },
    { type: 'path', attrs: { d: 'M5 7 Q12 10 19 7' } },
    { type: 'path', attrs: { d: 'M5 7 L5 17' } },
    { type: 'path', attrs: { d: 'M19 7 L19 17' } },
    { type: 'path', attrs: { d: 'M5 17 Q12 20 19 17' } },
  ],
  // Pump — body with an inlet above and an outlet to the side
  poiPump: [
    { type: 'circle', attrs: { cx: 12, cy: 13, r: 5 } },
    { type: 'path', attrs: { d: 'M12 8 L12 3' } },
    { type: 'path', attrs: { d: 'M17 13 L22 13' } },
  ],
  // Weather station — mast, crossarm, two anemometer cups
  poiWeatherStation: [
    { type: 'path', attrs: { d: 'M12 20 L12 8' } },
    { type: 'path', attrs: { d: 'M7 8 L17 8' } },
    { type: 'circle', attrs: { cx: 6, cy: 8, r: 1.6 } },
    { type: 'circle', attrs: { cx: 18, cy: 8, r: 1.6 } },
    { type: 'path', attrs: { d: 'M8 20 L16 20' } },
  ],
  // Power — bolt
  poiPower: [
    { type: 'path', attrs: { d: 'M13 3 L7 13 L11 13 L10 21 L17 10 L13 10 Z' } },
  ],
  // Bridge — deck over an arch, water beneath
  poiBridge: [
    { type: 'path', attrs: { d: 'M2 11 L22 11' } },
    { type: 'path', attrs: { d: 'M6 11 Q12 18 18 11' } },
    { type: 'path', attrs: { d: 'M3 20 Q7 17 11 20 T19 20' } },
  ],
  // Ford — a road crossing straight through the water, not over it
  poiFord: [
    { type: 'path', attrs: { d: 'M9 3 L9 21' } },
    { type: 'path', attrs: { d: 'M15 3 L15 21' } },
    { type: 'path', attrs: { d: 'M3 9 Q7 6 11 9 T19 9' } },
    { type: 'path', attrs: { d: 'M3 15 Q7 12 11 15 T19 15' } },
  ],
  // Track — two converging edges with a centre line
  poiTrack: [
    { type: 'path', attrs: { d: 'M4 21 L10 3' } },
    { type: 'path', attrs: { d: 'M20 21 L14 3' } },
    { type: 'path', attrs: { d: 'M12 18 L12 15' } },
    { type: 'path', attrs: { d: 'M12 12 L12 9' } },
  ],
  // Cattle stop — barred pit. Deliberately a grid, because the gate glyph
  // (poiAccess) is already posts-and-rails and the two would otherwise twin.
  poiCattleStop: [
    { type: 'rect', attrs: { x: 3, y: 7, width: 18, height: 10 } },
    { type: 'path', attrs: { d: 'M8 7 L8 17' } },
    { type: 'path', attrs: { d: 'M12 7 L12 17' } },
    { type: 'path', attrs: { d: 'M16 7 L16 17' } },
  ],
  // Dam — arched wall holding water back
  poiDam: [
    { type: 'path', attrs: { d: 'M4 19 Q12 5 20 19' } },
    { type: 'path', attrs: { d: 'M7 15 L17 15' } },
    { type: 'path', attrs: { d: 'M9 11 L15 11' } },
  ],
  // Bore — casing below the ground line, arrow pointing down it
  poiBore: [
    { type: 'path', attrs: { d: 'M3 13 L21 13' } },
    { type: 'path', attrs: { d: 'M10 13 L10 21' } },
    { type: 'path', attrs: { d: 'M14 13 L14 21' } },
    { type: 'path', attrs: { d: 'M12 15 L12 19' } },
    { type: 'path', attrs: { d: 'M10 17 L12 19 L14 17' } },
  ],
  // Trough — open vessel with a water line
  poiTrough: [
    { type: 'path', attrs: { d: 'M4 8 L6 18 L18 18 L20 8' } },
    { type: 'path', attrs: { d: 'M5 12 L19 12' } },
  ],
  // Slip — a failed face above the ground line
  poiSlip: [
    { type: 'path', attrs: { d: 'M3 19 L14 6' } },
    { type: 'path', attrs: { d: 'M3 19 L21 19' } },
    { type: 'path', attrs: { d: 'M9 15 L12 17' } },
    { type: 'path', attrs: { d: 'M12 11 L15 13' } },
  ],
  // Frost pocket — six-point star
  poiFrost: [
    { type: 'path', attrs: { d: 'M12 3 L12 21' } },
    { type: 'path', attrs: { d: 'M4 7 L20 17' } },
    { type: 'path', attrs: { d: 'M20 7 L4 17' } },
  ],
  // Tree — canopy and trunk
  poiTree: [
    { type: 'circle', attrs: { cx: 12, cy: 9, r: 6 } },
    { type: 'path', attrs: { d: 'M12 15 L12 21' } },
    { type: 'path', attrs: { d: 'M9 21 L15 21' } },
  ],
  // First aid — cross in a rounded box
  poiFirstAid: [
    { type: 'rect', attrs: { x: 4, y: 4, width: 16, height: 16, rx: 3 } },
    { type: 'path', attrs: { d: 'M12 8 L12 16' } },
    { type: 'path', attrs: { d: 'M8 12 L16 12' } },
  ],

  // --- Library extension to fifty (2026-08-19) ---
  // Thirty more, same rules: stroked geometry, 24x24, no fill. At fifty the
  // binding constraint is no longer "is there a glyph for this" but "can I tell
  // these two apart on a phone in the sun", so near-neighbours are deliberately
  // pushed apart. The fence is posts-and-wires, the gate is posts-and-rails, the
  // cattle stop is a boxed grid: three barrier glyphs, three silhouettes.

  // Fence — three posts, two wires
  poiFence: [
    { type: 'path', attrs: { d: 'M5 5 L5 20' } },
    { type: 'path', attrs: { d: 'M12 5 L12 20' } },
    { type: 'path', attrs: { d: 'M19 5 L19 20' } },
    { type: 'path', attrs: { d: 'M3 9 L21 9' } },
    { type: 'path', attrs: { d: 'M3 14 L21 14' } },
  ],
  // Locked gate — padlock
  poiLock: [
    { type: 'path', attrs: { d: 'M8 10 L8 7 Q8 3 12 3 Q16 3 16 7 L16 10' } },
    { type: 'rect', attrs: { x: 5, y: 10, width: 14, height: 10, rx: 2 } },
  ],
  // Sign — board on a post
  poiSign: [
    { type: 'rect', attrs: { x: 3, y: 4, width: 18, height: 9, rx: 2 } },
    { type: 'path', attrs: { d: 'M12 13 L12 21' } },
    { type: 'path', attrs: { d: 'M9 21 L15 21' } },
  ],
  // Parking — P on a plate
  poiParking: [
    { type: 'rect', attrs: { x: 4, y: 3, width: 16, height: 18, rx: 3 } },
    { type: 'path', attrs: { d: 'M10 17 L10 8 L13 8 Q16 8 16 11 Q16 14 13 14 L10 14' } },
  ],
  // Helipad — H in a circle
  poiHelipad: [
    { type: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { type: 'path', attrs: { d: 'M9 8 L9 16' } },
    { type: 'path', attrs: { d: 'M15 8 L15 16' } },
    { type: 'path', attrs: { d: 'M9 12 L15 12' } },
  ],

  // Shed — lean-to, open front
  poiShed: [
    { type: 'path', attrs: { d: 'M3 9 L21 5' } },
    { type: 'path', attrs: { d: 'M4 9 L4 20' } },
    { type: 'path', attrs: { d: 'M20 5 L20 20' } },
    { type: 'path', attrs: { d: 'M4 20 L20 20' } },
  ],
  // Silo — domed cylinder with a band
  poiSilo: [
    { type: 'path', attrs: { d: 'M7 8 Q12 3 17 8' } },
    { type: 'path', attrs: { d: 'M7 8 L7 21' } },
    { type: 'path', attrs: { d: 'M17 8 L17 21' } },
    { type: 'path', attrs: { d: 'M7 21 L17 21' } },
    { type: 'path', attrs: { d: 'M7 14 L17 14' } },
  ],
  // Glasshouse — peaked frame with glazing bars
  poiGlasshouse: [
    { type: 'path', attrs: { d: 'M3 20 L3 11 L12 4 L21 11 L21 20 Z' } },
    { type: 'path', attrs: { d: 'M8 20 L8 8' } },
    { type: 'path', attrs: { d: 'M16 20 L16 8' } },
  ],
  // Solar — tilted panel on a leg
  poiSolar: [
    { type: 'path', attrs: { d: 'M2 17 L8 7 L22 7 L16 17 Z' } },
    { type: 'path', attrs: { d: 'M7 17 L12 7' } },
    { type: 'path', attrs: { d: 'M12 17 L17 7' } },
    { type: 'path', attrs: { d: 'M11 17 L11 21' } },
  ],
  // Fuel — pump with a hose
  poiFuel: [
    { type: 'rect', attrs: { x: 4, y: 4, width: 10, height: 17, rx: 1 } },
    { type: 'path', attrs: { d: 'M6 8 L12 8' } },
    { type: 'path', attrs: { d: 'M14 10 L18 10 L18 17' } },
  ],
  // Workshop — saw-tooth industrial roof
  poiWorkshop: [
    { type: 'path', attrs: { d: 'M3 20 L3 12 L7 8 L7 12 L11 8 L11 12 L15 8 L15 12 L19 8 L19 20 Z' } },
  ],

  // Valve — inline, with a handwheel bar
  poiValve: [
    { type: 'path', attrs: { d: 'M2 12 L21 12' } },
    { type: 'circle', attrs: { cx: 12, cy: 12, r: 3.5 } },
    { type: 'path', attrs: { d: 'M12 5 L12 8.5' } },
    { type: 'path', attrs: { d: 'M9 5 L15 5' } },
  ],
  // Hydrant — capped body with side arms
  poiHydrant: [
    { type: 'path', attrs: { d: 'M9 8 L9 19 L15 19 L15 8' } },
    { type: 'path', attrs: { d: 'M8 8 Q12 4 16 8' } },
    { type: 'path', attrs: { d: 'M6 12 L9 12' } },
    { type: 'path', attrs: { d: 'M15 12 L18 12' } },
    { type: 'path', attrs: { d: 'M7 21 L17 21' } },
  ],
  // Sprinkler — riser and two throw arcs
  poiSprinkler: [
    { type: 'path', attrs: { d: 'M12 21 L12 13' } },
    { type: 'circle', attrs: { cx: 12, cy: 11, r: 1.6 } },
    { type: 'path', attrs: { d: 'M5 9 Q8 4 12 6' } },
    { type: 'path', attrs: { d: 'M19 9 Q16 4 12 6' } },
  ],
  // Drip line — lateral with three emitters
  poiDripLine: [
    { type: 'path', attrs: { d: 'M3 8 L21 8' } },
    { type: 'path', attrs: { d: 'M8 8 L8 12' } },
    { type: 'path', attrs: { d: 'M12 8 L12 12' } },
    { type: 'path', attrs: { d: 'M16 8 L16 12' } },
    { type: 'circle', attrs: { cx: 8, cy: 15, r: 1.4 } },
    { type: 'circle', attrs: { cx: 12, cy: 15, r: 1.4 } },
    { type: 'circle', attrs: { cx: 16, cy: 15, r: 1.4 } },
  ],
  // Filter — funnel and stem
  poiFilter: [
    { type: 'path', attrs: { d: 'M4 5 L20 5 L14 12 L14 19 L10 21 L10 12 Z' } },
  ],
  // Creek — a channel with two banks, so it does not read as the track glyph
  poiCreek: [
    { type: 'path', attrs: { d: 'M7 3 Q13 8 9 12 Q5 16 11 21' } },
    { type: 'path', attrs: { d: 'M13 3 Q19 8 15 12 Q11 16 17 21' } },
  ],

  // Rock — faceted boulder
  poiRock: [
    { type: 'path', attrs: { d: 'M4 19 L7 10 L13 7 L19 12 L20 19 Z' } },
    { type: 'path', attrs: { d: 'M13 7 L12 14 L20 19' } },
    { type: 'path', attrs: { d: 'M12 14 L4 19' } },
  ],
  // Wet area — standing water and reeds
  poiWetArea: [
    { type: 'path', attrs: { d: 'M3 18 Q8 14 12 18 Q16 22 21 18' } },
    { type: 'path', attrs: { d: 'M8 14 L8 8' } },
    { type: 'path', attrs: { d: 'M11 14 L11 6' } },
    { type: 'path', attrs: { d: 'M14 14 L14 9' } },
  ],
  // Shelter belt — a row of trees
  poiShelterBelt: [
    { type: 'path', attrs: { d: 'M3 18 L6 9 L9 18 Z' } },
    { type: 'path', attrs: { d: 'M9 18 L12 6 L15 18 Z' } },
    { type: 'path', attrs: { d: 'M15 18 L18 9 L21 18 Z' } },
    { type: 'path', attrs: { d: 'M2 21 L22 21' } },
  ],
  // Scrub — low bushes
  poiScrub: [
    { type: 'path', attrs: { d: 'M3 18 Q6 11 9 18' } },
    { type: 'path', attrs: { d: 'M8 18 Q12 9 16 18' } },
    { type: 'path', attrs: { d: 'M15 18 Q18 12 21 18' } },
    { type: 'path', attrs: { d: 'M2 18 L22 18' } },
  ],
  // Compost — heap with a turning arrow
  poiCompost: [
    { type: 'path', attrs: { d: 'M3 19 Q12 9 21 19 Z' } },
    { type: 'path', attrs: { d: 'M9 16 Q12 13 15 16' } },
    { type: 'path', attrs: { d: 'M13 15 L15 16 L14 18' } },
  ],

  // Vine — trained on a two-wire trellis
  poiVine: [
    { type: 'path', attrs: { d: 'M7 21 L7 4' } },
    { type: 'path', attrs: { d: 'M7 9 L20 9' } },
    { type: 'path', attrs: { d: 'M7 15 L20 15' } },
    { type: 'path', attrs: { d: 'M10 15 Q13 13 12 9 Q11 7 14 7' } },
  ],
  // Flag — block or row marker
  poiFlag: [
    { type: 'path', attrs: { d: 'M6 21 L6 3' } },
    { type: 'path', attrs: { d: 'M6 4 L18 7 L6 11 Z' } },
  ],
  // Nursery — potted seedling
  poiNursery: [
    { type: 'path', attrs: { d: 'M7 14 L9 21 L15 21 L17 14 Z' } },
    { type: 'path', attrs: { d: 'M12 14 L12 8' } },
    { type: 'path', attrs: { d: 'M12 11 Q8 10 8 6 Q12 6 12 11' } },
    { type: 'path', attrs: { d: 'M12 12 Q16 11 16 7 Q12 7 12 12' } },
  ],
  // Beehive — stacked boxes
  poiBeehive: [
    { type: 'rect', attrs: { x: 5, y: 15, width: 14, height: 5 } },
    { type: 'rect', attrs: { x: 6, y: 10, width: 12, height: 5 } },
    { type: 'rect', attrs: { x: 7, y: 5, width: 10, height: 5 } },
    { type: 'path', attrs: { d: 'M11 20 L13 20' } },
  ],

  // Toilet / amenity block — figure
  poiToilet: [
    { type: 'circle', attrs: { cx: 12, cy: 5, r: 2.5 } },
    { type: 'path', attrs: { d: 'M12 7.5 L12 15' } },
    { type: 'path', attrs: { d: 'M7 11 L17 11' } },
    { type: 'path', attrs: { d: 'M8 21 L12 15 L16 21' } },
  ],
  // Smoko — mug
  poiSmoko: [
    { type: 'path', attrs: { d: 'M4 7 L17 7 L17 16 Q17 19 13 19 L8 19 Q4 19 4 16 Z' } },
    { type: 'path', attrs: { d: 'M17 9 Q21 9 21 12 Q21 15 17 15' } },
    { type: 'path', attrs: { d: 'M8 5 L8 2' } },
    { type: 'path', attrs: { d: 'M12 5 L12 2' } },
  ],
  // Fire extinguisher
  poiFireExtinguisher: [
    { type: 'rect', attrs: { x: 8, y: 8, width: 8, height: 13, rx: 2 } },
    { type: 'path', attrs: { d: 'M11 8 L11 5 L14 5' } },
    { type: 'path', attrs: { d: 'M14 5 L18 3' } },
    { type: 'path', attrs: { d: 'M8 12 L16 12' } },
  ],
  // Muster point — converge on a circle
  poiMuster: [
    { type: 'circle', attrs: { cx: 12, cy: 12, r: 4 } },
    { type: 'path', attrs: { d: 'M12 2 L12 6' } },
    { type: 'path', attrs: { d: 'M10 4 L12 6 L14 4' } },
    { type: 'path', attrs: { d: 'M12 22 L12 18' } },
    { type: 'path', attrs: { d: 'M10 20 L12 18 L14 20' } },
    { type: 'path', attrs: { d: 'M2 12 L6 12' } },
    { type: 'path', attrs: { d: 'M4 10 L6 12 L4 14' } },
    { type: 'path', attrs: { d: 'M22 12 L18 12' } },
    { type: 'path', attrs: { d: 'M20 10 L18 12 L20 14' } },
  ],
};

/**
 * Draw a lucide icon element onto a canvas context.
 */
function drawElement(ctx, el) {
  if (el.type === 'path') {
    const path = new Path2D(el.attrs.d);
    ctx.stroke(path);
  } else if (el.type === 'rect') {
    const { x, y, width, height, rx } = el.attrs;
    const r = rx || 0;
    if (r > 0) {
      // Rounded rect
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.arcTo(x + width, y, x + width, y + r, r);
      ctx.lineTo(x + width, y + height - r);
      ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
      ctx.lineTo(x + r, y + height);
      ctx.arcTo(x, y + height, x, y + height - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, width, height);
    }
  } else if (el.type === 'circle') {
    ctx.beginPath();
    ctx.arc(el.attrs.cx, el.attrs.cy, el.attrs.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * Create a circular marker image with a lucide icon inside.
 */
function createMarkerImage(bgColor, iconColor, elements) {
  const size = ICON_SIZE * 2; // 2x for retina
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Circle background
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw icon scaled from 24x24 viewBox to fit ~55% of circle
  const iconScale = (size * GLYPH_FRACTION) / 24;
  const offsetX = (size - 24 * iconScale) / 2;
  const offsetY = (size - 24 * iconScale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(iconScale, iconScale);
  ctx.strokeStyle = iconColor;
  ctx.lineWidth = GLYPH_STROKE; // Keep consistent stroke weight
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  elements.forEach((el) => drawElement(ctx, el));
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(imageData.data.buffer) };
}

/**
 * Register all custom marker icons with the map.
 * Safe to call multiple times — skips already-registered icons.
 */
/**
 * Every marker image the map registers, in one place.
 *
 * The legend renders its swatches from this same list (see MapLegend.jsx), so
 * a marker whose colour or glyph changes here changes in the legend too — the
 * failure mode of a hand-maintained legend is that it quietly starts lying.
 */
export const MARKER_SPECS = [
  { id: 'v2-tasks-icon', bg: '#D1583B', fg: '#ffffff', def: ICON_DEFS.tasks, label: 'Task' },
  { id: 'v2-tasks-icon-inactive', bg: '#94a3b8', fg: '#ffffff', def: ICON_DEFS.tasks, label: 'Task (done / cancelled)' },
  { id: 'v2-obs-icon', bg: '#5B6830', fg: '#ffffff', def: ICON_DEFS.binoculars, label: 'Observation' },
  { id: 'v2-risk-icon-low', bg: '#28a745', fg: '#ffffff', def: ICON_DEFS.risk, label: 'Risk — low' },
  { id: 'v2-risk-icon-medium', bg: '#f59e0b', fg: '#ffffff', def: ICON_DEFS.risk, label: 'Risk — medium' },
  { id: 'v2-risk-icon-high', bg: '#dc2626', fg: '#ffffff', def: ICON_DEFS.risk, label: 'Risk — high' },
  { id: 'v2-risk-icon-critical', bg: '#7c2d12', fg: '#ffffff', def: ICON_DEFS.risk, label: 'Risk — critical' },
  { id: 'v2-asset-icon', bg: '#5B6830', fg: '#ffffff', def: ICON_DEFS.wrench, label: 'Asset' },
  // Map features (POIs). One image per feature_type — the layer picks between
  // them with a `match` on the type, so adding a type means adding a spec here
  // AND an entry in MAP_FEATURE_TYPES (components/mapFeatureTypes.js).
  // There is deliberately no `hazard` type: hazards live in SiteRisk.
  { id: 'v2-poi-access', bg: '#0369a1', fg: '#ffffff', def: ICON_DEFS.poiAccess, label: 'Access' },
  { id: 'v2-poi-infrastructure', bg: '#6b7280', fg: '#ffffff', def: ICON_DEFS.poiInfrastructure, label: 'Infrastructure' },
  { id: 'v2-poi-water', bg: '#0891b2', fg: '#ffffff', def: ICON_DEFS.poiWater, label: 'Water' },
  { id: 'v2-poi-amenity', bg: '#7c3aed', fg: '#ffffff', def: ICON_DEFS.poiAmenity, label: 'Amenity' },
  { id: 'v2-poi-note', bg: '#2F2F2F', fg: '#ffffff', def: ICON_DEFS.poiNote, label: 'Note' },
];

const SPEC_BY_ID = Object.fromEntries(MARKER_SPECS.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// The pickable icon library, and markers for company-defined POI types.
//
// MARKER_SPECS above is a fixed list because every entity marker has exactly
// one appearance. A company-defined type does not: it is any of the twenty
// icons in any of the eight colours, so pre-baking 160 images would be absurd
// and hardcoding them impossible. Instead a marker image is built on demand for
// each (icon, colour) pair a type actually uses, and remembered here so the
// legend can draw the same badge.
//
// This registry is what makes drawMarkerSwatch work for custom types. Without
// it a custom POI would render on the map and leave a blank row in the legend —
// on screen AND on the printed sheet, which is the failure nobody notices until
// the sheet is in a grower's hand.
// ---------------------------------------------------------------------------

/**
 * The fifty glyphs a user may choose from, grouped as the picker shows them.
 *
 * Grouping is not decoration at this size: fifty ungrouped tiles is a wall, and
 * the person picking one is usually looking for a category ("something for the
 * irrigation") rather than a specific glyph. Order within a group runs from the
 * most common to the least.
 */
export const POI_ICON_LIBRARY = [
  {
    group: 'Access',
    icons: [
      { key: 'poiAccess', label: 'Gate' },
      { key: 'poiTrack', label: 'Track' },
      { key: 'poiBridge', label: 'Bridge' },
      { key: 'poiFord', label: 'Ford' },
      { key: 'poiCattleStop', label: 'Cattle stop' },
      { key: 'poiFence', label: 'Fence' },
      { key: 'poiLock', label: 'Locked' },
      { key: 'poiSign', label: 'Sign' },
      { key: 'poiParking', label: 'Parking' },
      { key: 'poiHelipad', label: 'Helipad' },
    ],
  },
  {
    group: 'Structures',
    icons: [
      { key: 'poiInfrastructure', label: 'Building' },
      { key: 'poiShed', label: 'Shed' },
      { key: 'poiWorkshop', label: 'Workshop' },
      { key: 'poiTank', label: 'Tank' },
      { key: 'poiSilo', label: 'Silo' },
      { key: 'poiPump', label: 'Pump' },
      { key: 'poiWeatherStation', label: 'Weather station' },
      { key: 'poiPower', label: 'Power' },
      { key: 'poiSolar', label: 'Solar' },
      { key: 'poiFuel', label: 'Fuel' },
      { key: 'poiGlasshouse', label: 'Glasshouse' },
    ],
  },
  {
    group: 'Water',
    icons: [
      { key: 'poiWater', label: 'Water' },
      { key: 'poiDam', label: 'Dam' },
      { key: 'poiBore', label: 'Bore' },
      { key: 'poiTrough', label: 'Trough' },
      { key: 'poiCreek', label: 'Creek' },
      { key: 'poiValve', label: 'Valve' },
      { key: 'poiHydrant', label: 'Hydrant' },
      { key: 'poiSprinkler', label: 'Sprinkler' },
      { key: 'poiDripLine', label: 'Drip line' },
      { key: 'poiFilter', label: 'Filter' },
    ],
  },
  {
    group: 'Ground',
    icons: [
      { key: 'poiSlip', label: 'Slip' },
      { key: 'poiFrost', label: 'Frost pocket' },
      { key: 'poiWetArea', label: 'Wet area' },
      { key: 'poiRock', label: 'Rock' },
      { key: 'poiTree', label: 'Tree' },
      { key: 'poiShelterBelt', label: 'Shelter belt' },
      { key: 'poiScrub', label: 'Scrub' },
      { key: 'poiCompost', label: 'Compost' },
    ],
  },
  {
    group: 'Vineyard',
    icons: [
      { key: 'poiVine', label: 'Vine / trellis' },
      { key: 'poiFlag', label: 'Marker' },
      { key: 'poiNursery', label: 'Nursery' },
      { key: 'poiBeehive', label: 'Beehive' },
    ],
  },
  {
    group: 'Amenity',
    icons: [
      { key: 'poiAmenity', label: 'Amenity' },
      { key: 'poiNote', label: 'Note' },
      { key: 'poiToilet', label: 'Toilet' },
      { key: 'poiSmoko', label: 'Smoko' },
      { key: 'poiFirstAid', label: 'First aid' },
      { key: 'poiFireExtinguisher', label: 'Fire extinguisher' },
      { key: 'poiMuster', label: 'Muster point' },
    ],
  },
];

/** Flat allow-list. Must stay in step with ALLOWED_ICONS in the API. */
export const POI_ICON_KEYS = POI_ICON_LIBRARY.flatMap((g) => g.icons.map((i) => i.key));

/**
 * Bounded palette, not a colour picker.
 *
 * No yellow and nothing lighter than these: a marker has to hold its own over
 * satellite imagery, and a pale badge with a white ring disappears against
 * bare dirt in midsummer — which is most of the imagery, most of the season.
 */
export const POI_COLOURS = [
  { value: '#0369a1', label: 'Blue' },
  { value: '#0891b2', label: 'Teal' },
  { value: '#15803d', label: 'Green' },
  { value: '#b45309', label: 'Amber' },
  { value: '#b91c1c', label: 'Red' },
  { value: '#7c3aed', label: 'Purple' },
  { value: '#6b7280', label: 'Grey' },
  { value: '#2F2F2F', label: 'Charcoal' },
];

/** Stable, derivable image id for an (icon, colour) pair. */
export function poiMarkerId(icon, colour) {
  const hex = String(colour || '').replace('#', '').toLowerCase();
  return `v2-poi-t-${icon}-${hex}`;
}

// id -> spec, for pairs seen so far. Populated by registerPoiTypeMarkers and
// read by drawMarkerSwatch.
const POI_TYPE_SPECS = new Map();

/**
 * Replay every POI marker image registered so far onto another map.
 *
 * This is what the EXPORT clone needs. Marker images live outside the style
 * JSON, so a cloned style has none of them, and the clone cannot recompute the
 * set on its own — it has no access to the vocabulary or the decorated data.
 * The registry already holds exactly the pairs the live map is drawing, which
 * is exactly what the clone must draw.
 *
 * Without this a company POI type renders on screen and comes out BLANK on the
 * printed sheet, which is the failure mode nobody catches until the sheet is
 * in a grower hand.
 *
 * Safe to call repeatedly; skips images the map already holds.
 */
export function registerKnownPoiMarkers(map) {
  if (!map) return 0;
  let added = 0;
  POI_TYPE_SPECS.forEach((spec, id) => {
    if (map.hasImage(id)) return;
    try {
      map.addImage(id, createMarkerImage(spec.bg, spec.fg, spec.def), { pixelRatio: 2 });
      added += 1;
    } catch (e) {
      console.warn('Failed to replay POI icon:', id, e);
    }
  });
  return added;
}

/**
 * Register a marker image for every (icon, colour) pair passed in.
 *
 * Accepts anything with {icon, colour, label} — the vocabulary rows, or the
 * `specs` list decorateFeatures returns. Prefer the latter at the layer: it is
 * built from the FEATURES, so a per-feature style override and a feature whose
 * type has since been retired both get their image, and walking the type list
 * would miss both.
 *
 * Safe to call repeatedly; skips images the map already holds. Returns the
 * count of NEW images.
 */
export function registerPoiTypeMarkers(map, types) {
  if (!map || !Array.isArray(types)) return 0;
  let added = 0;
  types.forEach((t) => {
    const def = ICON_DEFS[t.icon];
    if (!def) {
      console.warn('Unknown POI icon key, falling back to note:', t.icon);
      return;
    }
    const id = poiMarkerId(t.icon, t.colour);
    // Remember the spec even if the image is already registered — a second map
    // (the export clone) shares this registry, and the legend needs the spec
    // whether or not this particular map had to build the image.
    POI_TYPE_SPECS.set(id, {
      id, bg: t.colour, fg: '#ffffff', def, label: t.label || t.slug,
    });
    if (map.hasImage(id)) return;
    try {
      map.addImage(id, createMarkerImage(t.colour, '#ffffff', def), { pixelRatio: 2 });
      added += 1;
    } catch (e) {
      console.warn('Failed to register POI type icon:', id, e);
    }
  });
  return added;
}

/**
 * Paint one marker badge onto a 2D context, centred on (cx, cy).
 *
 * This is the same drawing as the map image — same badge, same ring, same glyph
 * paths, same proportions — just at an arbitrary radius, so the printed legend
 * shows the marker rather than an approximation of it. Returns false for an
 * unknown id so the caller can fall back rather than leave a blank row.
 */
export function drawMarkerSwatch(ctx, specId, cx, cy, radius, appearance = null) {
  // An explicit {icon, colour} wins, so a caller that already knows how the row
  // looks never depends on the registry having been populated. Company-defined
  // POI types have no MARKER_SPECS entry, and a type with no features on the map
  // yet has no dynamic entry either — it would have printed as a blank row in
  // the key while still being listed.
  const spec = appearance?.icon && ICON_DEFS[appearance.icon]
    ? { bg: appearance.colour, fg: '#ffffff', def: ICON_DEFS[appearance.icon] }
    : (SPEC_BY_ID[specId] || POI_TYPE_SPECS.get(specId));
  if (!spec || !spec.def) return false;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = spec.bg;
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 2 * BADGE_RING_FRACTION);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  const glyph = radius * 2 * GLYPH_FRACTION;
  const scale = glyph / 24;
  ctx.translate(cx - glyph / 2, cy - glyph / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = spec.fg;
  // Proportional to the badge, but never finer than 2 output pixels — below
  // that a stroked glyph disappears into the paper. At print sizes the
  // proportional term always wins, so the swatch matches the marker exactly.
  ctx.lineWidth = Math.max(GLYPH_STROKE, 2 / scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  spec.def.forEach((el) => drawElement(ctx, el));
  ctx.restore();
  return true;
}

export function registerMapIcons(map) {
  if (!map) return;

  MARKER_SPECS.forEach(({ id, bg, fg, def }) => {
    if (map.hasImage(id)) return;
    try {
      const img = createMarkerImage(bg, fg, def);
      map.addImage(id, img, { pixelRatio: 2 });
    } catch (e) {
      console.warn('Failed to register map icon:', id, e);
    }
  });
}
