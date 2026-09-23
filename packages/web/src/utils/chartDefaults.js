// packages/web/src/utils/chartDefaults.js
/**
 * Global Chart.js legend defaults. Ported from
 * `packages/insights/src/utils/chartDefaults.js` on 2026-09-23, unchanged,
 * because the two apps now draw the same charts off the same payloads and a
 * legend that reads differently in Grow than in Insights is the same defect as
 * a number that reads differently.
 *
 * Import it for its side effect once, before any chart renders. Per-chart
 * options still win where they override these.
 *
 * ## Why the swatch is a LINE and not a point
 *
 * Chart.js draws a legend swatch as a dot when `usePointStyle` is true, and a
 * dot cannot show a dash: it takes the `usePointStyle` branch of
 * `drawLegendBox` and calls `drawPointLegend`, so the `borderDash` already
 * loaded onto the context never shapes the mark. Every dashed series then
 * becomes unidentifiable from its legend — and the baseline comparison on the
 * charts this file was added for is dashed precisely to distinguish it from the
 * site's own line.
 *
 * With `usePointStyle` off and `boxHeight: 0`, Chart.js strokes a rectangle
 * instead. A zero-height rectangle is a straight line (per the Canvas spec, a
 * rect with exactly one zero dimension is a line subpath), and it is stroked
 * with the dataset's own `borderDash`. So each entry looks like the line it
 * stands for.
 *
 * `boxWidth: 24` rather than the default 40 keeps it compact, and is still wide
 * enough that a [5, 4] dash reads as dashed rather than as a short stub.
 *
 * ## Bar charts
 *
 * Their swatch becomes a line too — `boxHeight` resolves once per chart, not
 * per dataset, so it cannot be conditional. A bar chart that wants the
 * conventional filled box says so locally, and that is the only thing a
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
