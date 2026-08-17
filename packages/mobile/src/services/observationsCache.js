// services/observationsCache.js — Stale-while-revalidate wrappers for the
// observation read paths. Screens import these instead of observationService
// for reads, the same way task screens use tasksCache.
//
// Why this exists. The 2026-08-13 work made observation SUBMISSION durable —
// writes queue and replay on reconnect. Capture still died offline, because
// none of the reads it depends on were cached: the template list came back
// empty (ObservationsScreen swallows the failure into []), getTemplate threw
// outright so SpotCaptureScreen rendered a form with no fields, and any field
// with an options_source had an empty dropdown. Pete, field test 2026-08-14:
// "Observation templates do not load or work offline - therefore no
// observations work offline."
//
// A durable write queue behind a form you can't open is no use, which is what
// made this the blocker for the rest of the offline test plan.
import { swr, cacheSet, paramKey, REFERENCE_TTL_MS } from './offlineCache';
import { observationService } from '../api/services';

// Key namespace conventions:
//   obs.templates:<params>
//   obs.template:<templateId>
//   obs.runs:<params>
//   obs.spots:<runId>
//   obs.catalog:<category>

export async function getTemplatesCached(params = {}, opts = {}) {
  const key = `obs.templates:${paramKey(params)}`;
  return swr(key, async () => {
    const list = await observationService.getTemplates(params);
    // GET /observation-templates and GET /observation-templates/{id} share one
    // response model (ObservationTemplateOut), field_schema included — so the
    // list already holds everything the detail call would return. Warming each
    // template's own key here is therefore exact, not an approximation, and it
    // means every template the picker has shown can be opened offline without
    // the user having drilled into it first while online.
    if (Array.isArray(list)) {
      await Promise.all(
        list.filter(t => t?.id != null).map(t => cacheSet(`obs.template:${t.id}`, t)),
      );
    }
    return list;
  }, { ttlMs: REFERENCE_TTL_MS, ...opts });
}

export async function getTemplateCached(templateId, opts = {}) {
  const key = `obs.template:${templateId}`;
  return swr(key, () => observationService.getTemplate(templateId), {
    ttlMs: REFERENCE_TTL_MS,
    ...opts,
  });
}

export async function listRunsCached(params = {}, opts = {}) {
  const key = `obs.runs:${paramKey(params)}`;
  return swr(key, () => observationService.listRuns(params), opts);
}

export async function getSpotsCached(runId, opts = {}) {
  const key = `obs.spots:${runId}`;
  return swr(key, () => observationService.getSpots(runId), opts);
}

// EL stages come from their own endpoint but are the same kind of thing as any
// other catalog, so callers shouldn't have to care which one it is.
export async function getCatalogCached(category, opts = {}) {
  const key = `obs.catalog:${category}`;
  const fetcher = category === 'el_stage'
    ? () => observationService.getElStages()
    : () => observationService.getCatalog(category);
  return swr(key, fetcher, { ttlMs: REFERENCE_TTL_MS, ...opts });
}
