// utils/thresholdPlugin.js — one horizontal rule at an absolute value.
//
// A local plugin, not a dependency. `chartjs-plugin-annotation` would do this
// and more, and it is 40 kB to draw one rule.
//
// It exists for the BACCHUS THRESHOLD, the one line on a disease chart that
// means something absolute: at 1.0 the infection period is complete. It is
// drawn on the right-hand axis, so it is a rule rather than a shaded band.
//
// SHARED, because it is drawn on two charts that must agree. `SitePopup`
// (a Pro site) and `DiseaseChart` (a region) plot the same model at two
// spatial grains, and a threshold that drifted between them would make the
// same index mean two different things on two screens.
//
// Options, passed per chart under `plugins.threshold`:
//   at      the value to rule at. Nothing is drawn when null/undefined
//   axis    scale id, default 'y'
//   colour  stroke and label colour
//   label   optional text, right-aligned just above the rule
export const thresholdPlugin = {
  id: 'threshold',
  beforeDatasetsDraw(chart, _args, opts) {
    if (opts?.at == null) return;
    const { ctx, chartArea, scales } = chart;
    const axis = scales[opts.axis || 'y'];
    if (!chartArea || !axis) return;
    const y = axis.getPixelForValue(opts.at);
    if (y < chartArea.top || y > chartArea.bottom) return;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = opts.colour || 'rgba(185, 28, 28, 0.65)';
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (opts.label) {
      ctx.fillStyle = opts.colour || 'rgba(185, 28, 28, 0.9)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(opts.label, chartArea.right - 4, y - 2);
    }
    ctx.restore();
  },
};

// The Bacchus threshold is exactly 1.0 by definition of the index — a sum of
// 1/I terms where I is the wet hours required at that temperature. It is not a
// tunable, and nothing should pass its own number for it.
export const BACCHUS_THRESHOLD = 1.0;

// One green, used for every Bacchus series on every chart.
export const BACCHUS_COLOUR = '#2f6f4f';

export default thresholdPlugin;
