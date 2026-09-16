// packages/insights/src/utils/chartDefaults.js
/**
 * Global Chart.js legend defaults — compact across the whole app.
 *
 * Importing this module (for its side effect) once, before any chart renders,
 * shrinks every legend. Stock Chart.js uses a 40px legend box + 12px font with
 * generous padding, which on a ~240px-tall mobile chart eats a third of the
 * plot area. The compare charts don't set their own legend style, so they were
 * the worst offenders. Per-chart options still win where they override these.
 *
 * ## Why the swatch is a LINE and not a point (changed 2026-09-16)
 *
 * This file used to set `usePointStyle = true`, which draws every swatch as a
 * dot. A dot cannot show a dash: Chart.js takes the `usePointStyle` branch of
 * `drawLegendBox` and calls `drawPointLegend`, so the `borderDash` it has
 * already loaded onto the context via `setLineDash` never shapes the mark.
 *
 * That made every dashed series in the app unidentifiable from its legend, and
 * the app is full of them — baseline comparisons in `SeasonExplorer`,
 * `CurrentSeasonExplorer` and `ProjectionsExplorer`, the projection bands, and
 * the Bacchus botrytis index on both disease charts, where two lines model the
 * same disease and the dash was the only thing telling them apart.
 *
 * With `usePointStyle` off and `boxHeight: 0`, Chart.js takes the other branch
 * and strokes a rectangle instead. A zero-height rectangle is a straight line
 * (per the Canvas spec: a rect with exactly one zero dimension is a line
 * subpath, not an empty path), and it is stroked with the dataset's own
 * `borderDash`. So each entry now looks like the line it stands for.
 *
 * `boxWidth: 24` rather than the old 8: a dash pattern of [4, 3] needs roughly
 * twenty pixels before it reads as dashed rather than as a short solid stub.
 *
 * ## Bar charts
 *
 * Their swatch becomes a line too — `boxHeight` is resolved once per chart, not
 * per dataset, so this cannot be conditional. That is a change from a dot, NOT
 * from a filled box: `usePointStyle` was already on, so bar legends have been
 * drawing dots for as long as this file has existed. A bar chart that wants the
 * conventional filled box can say so locally, and that is the only thing a
 * per-chart override is needed for:
 *
 *     plugins: { legend: { labels: { boxHeight: 8 } } }
 */
import 'chart.js/auto'; // registers the Legend plugin so its defaults exist below
import { Chart as ChartJS } from 'chart.js';

const legend = ChartJS.defaults.plugins.legend;
// See the note above — this is load-bearing, not a style preference.
legend.labels.usePointStyle = false;
legend.labels.boxWidth = 24;
legend.labels.boxHeight = 0;
legend.labels.padding = 10;
legend.labels.font = { size: 11 };
