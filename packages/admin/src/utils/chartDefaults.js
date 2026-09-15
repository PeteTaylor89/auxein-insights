// ---------------------------------------------------------------------------
// FORKED COPY - the original is still live at:
//   packages/insights/src/utils/chartDefaults.js
//
// The public Insights SPA still uses that file, so this is a PERMANENT
// duplicate, not a staging copy: Phase 5 deletes the admin-only files from
// Insights but leaves this one where it is. A fix to one must be applied to
// the other. If these drift far enough to matter, promote the pair into
// @vineyard/shared rather than reconciling them by hand.
// ---------------------------------------------------------------------------
// packages/insights/src/utils/chartDefaults.js
/**
 * Global Chart.js legend defaults — compact across the whole app.
 *
 * Importing this module (for its side effect) once, before any chart renders,
 * shrinks every legend. Stock Chart.js uses a 40px legend box + 12px font with
 * generous padding, which on a ~240px-tall mobile chart eats a third of the
 * plot area. The compare charts don't set their own legend style, so they were
 * the worst offenders. Per-chart options still win where they override these.
 */
import 'chart.js/auto'; // registers the Legend plugin so its defaults exist below
import { Chart as ChartJS } from 'chart.js';

const legend = ChartJS.defaults.plugins.legend;
legend.labels.usePointStyle = true;
legend.labels.boxWidth = 8;
legend.labels.boxHeight = 8;
legend.labels.padding = 10;
legend.labels.font = { size: 11 };
