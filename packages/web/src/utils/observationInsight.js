// Where the "Insights" action on an observation run should actually go.
//
// This used to return a `kind` of 'phenology' or 'yield' and the caller built
// `/Insights?kind=yield&runId=118&templateType=bud_count`. **The Insights page
// read none of those parameters.** Every click landed on the pill grid with
// nothing open, which looks identical to the link being broken — because it
// effectively was.
//
// It also keyed on `templateType` strings that were guessed rather than read
// from the database: the list contained `flower_count`, and the real template
// type is `flower_set`, so a Flower Count run never offered the action at all.
//
// Now the RUN says what it measures. `count_metric` is resolved server-side by
// `services/count_metrics.metric_for_template`, which matches a company's own
// template by field name as well as by type — something no client can do,
// because a client never sees `fields_json`. Greystone's own "Bud Counts"
// template carries `type='other'` and works through exactly that path.

/** Runs that have an Insights destination but no countable measurement. */
export const YIELD_TYPES = new Set([
  'pre_veraison_yield',
  'post_veraison_yield',
  'maturity_sampling',
  'growth',
  'yield_estimate',
]);

export const PHENOLOGY_TYPES = new Set(['phenology']);

/**
 * Where this run's Insights action should land, or null when there is nowhere
 * useful to send it.
 *
 * Returning null is deliberate: a button that opens a page which cannot say
 * anything about the run is worse than no button, because the user concludes
 * the feature is broken rather than absent.
 *
 * @param {{count_metric?: string, template_type?: string}} run
 * @returns {{insight: string, report?: string, metric?: string, label: string}|null}
 */
export function getInsightTarget(run) {
  if (!run) return null;

  // A countable run goes straight to its own metric in the counts report.
  if (run.count_metric) {
    return {
      insight: 'reports',
      report: 'counts',
      metric: run.count_metric,
      label: 'Counts',
    };
  }

  const type = String(run.template_type || '').toLowerCase();
  if (PHENOLOGY_TYPES.has(type)) {
    return { insight: 'phenology', label: 'Phenology' };
  }
  // Measured, but nothing aggregates it yet — land on Reports rather than
  // inventing a destination.
  if (YIELD_TYPES.has(type)) {
    return { insight: 'reports', label: 'Reports' };
  }
  return null;
}

/** The query string for a target, in the shape the Insights page reads. */
export function insightSearchParams(target) {
  if (!target) return null;
  const params = new URLSearchParams({ insight: target.insight });
  if (target.report) params.set('report', target.report);
  if (target.metric) params.set('metric', target.metric);
  return params.toString();
}
