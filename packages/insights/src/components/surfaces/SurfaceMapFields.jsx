// components/surfaces/SurfaceMapFields.jsx — the author's controls for one embedded surface map.
//
// Extracted from `ClimateWidgetInserter` on 2026-09-04, the moment research
// reports needed the same controls. It is the authoring half of what
// `surfaceMapConfig` is the storage half of: one form, one config shape, two
// (soon more) authoring systems.
//
// It is CONTROLLED — it owns no config state, only the catalogue it needs to
// offer real choices. The host owns the value and decides what saving means: a
// Tiptap `insertContent` in the article editor, a `PUT /sections/{id}` in the
// research editor. That split is why the same form can sit in a modal and in an
// inline panel without either knowing about the other.
//
// THREE RULES ARE ENFORCED HERE RATHER THAN LEFT TO THE AUTHOR, because each of
// them produces a widget that fails silently rather than visibly:
//
//   1. A cadence the variable does not publish (`daily` on a seasonal GDD
//      layer) 404s every tile. `cadenceFor` decides, not the picker.
//   2. A statistic the layer does not publish 404s every tile. The server's
//      `meta.statistics` is the list, never a local guess.
//   3. A step is offered only if the catalogue holds it, so a month inside a
//      gap cannot be pinned.
//
// AND ONE IS ONLY WARNED ABOUT, because it is a judgement call: a DAILY layer
// is Pro, so every reader sees the map and only Pro readers can click it for a
// value. The author is signed in and almost certainly Pro, so their own
// catalogue looks complete and they cannot see this from where they sit.
// (The monthly ARCHIVE needs no such warning since 2026-09-04 — `/probe` runs
// the cadence rule without the date rule, so any published month is clickable
// by anyone. See `surfaces._gate_steps`.)
import { useEffect } from 'react';
import useSurfaceAvailability from '../../hooks/useSurfaceAvailability';
import {
  cadenceFor,
  statisticFor,
  granularityFor,
  DAILY_CAPABLE,
  DEFAULT_STATISTIC,
  SURFACE_VARIABLES,
} from '../../services/surfaceService';
import { statLabel, stepLabel } from './surfaceLabels';
import { normaliseConfig } from './surfaceMapConfig';

// The layers an author may embed. Deliberately the same six the Atlas offers
// and not everything in `SURFACE_VARIABLES` — `rh` and `pet` are in the
// vocabulary but are not published as map layers, and offering them would
// insert a map that 404s its own tiles.
export const SURFACE_LAYERS = ['temp_mean', 'temp_min', 'temp_max', 'rainfall', 'gdd10', 'gdd0'];

const BASEMAP_OPTIONS = [
  { value: 'light', label: 'Plain' },
  { value: 'outdoors', label: 'Terrain' },
  { value: 'satellite', label: 'Satellite' },
];

const DEFAULT_FIELD = {
  width: '100%', padding: '0.5rem', border: '1px solid #d1d5db',
  borderRadius: '6px', fontSize: '0.875rem',
};
const DEFAULT_LABEL = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  marginBottom: '0.3rem', color: '#374151',
};

/**
 * @param {object}   value       a surfaceMapConfig-shaped object
 * @param {Function} onChange    receives the WHOLE next config, never a patch
 * @param {object}   fieldStyle  host's input styling, so the form looks native
 * @param {object}   labelStyle
 */
function SurfaceMapFields({ value, onChange, fieldStyle = DEFAULT_FIELD, labelStyle = DEFAULT_LABEL }) {
  const cfg = normaliseConfig(value);
  const set = (patch) => onChange({ ...cfg, ...patch });

  const granularity = cadenceFor(cfg.variable, cfg.cadence);
  const dailyOffered = DAILY_CAPABLE.has(cfg.variable);
  const wireStatistic = statisticFor(
    granularity,
    cfg.statistic || DEFAULT_STATISTIC[cfg.variable] || 'mean',
  );

  // The catalogue, through the SAME hook the map uses, so the steps offered
  // here are exactly the steps the map can draw. Reconstructing the monthly
  // series locally is how an author gets offered a month inside a gap.
  const surfaces = useSurfaceAvailability(cfg.variable, granularity, wireStatistic);
  const steps = surfaces.months;
  const statistics = surfaces.statistics;

  // ONE correction effect, not three.
  //
  // Three separate effects each did `onChange({ ...cfg, one_field })` off the
  // SAME `cfg` captured for this render, so any two firing in one commit — and
  // changing the layer fires all three — meant the last writer silently
  // discarded the others' corrections. It converged over the next few renders,
  // which is exactly the kind of bug that never shows up in a click-through and
  // shows up as a wrong statistic in a published report.
  //
  // The corrections are ORDERED and the effect returns early after correcting
  // the cadence, because `statistics` and `steps` in this render describe the
  // OLD granularity. Pinning from them under a freshly-changed cadence is how a
  // monthly stamp ends up on a daily map. Let the refetch land first.
  useEffect(() => {
    // Never act on a stale catalogue. The hook keeps the previous `available`
    // while the next one loads, so between picking gdd10 and its seasonal steps
    // arriving, `steps` still holds temp_mean's months.
    if (surfaces.loading) return;

    // Rule 1. A GDD layer is seasonal, so a stored `daily` on it is
    // meaningless; normalise it away rather than letting it sit in the document
    // looking valid.
    if (cfg.cadence === 'daily' && !dailyOffered) {
      onChange({ ...cfg, cadence: 'monthly' });
      return;
    }

    const next = { ...cfg };
    let changed = false;

    // Rule 2. Fall back to the LAYER's own default, not to the previous
    // layer's choice — `sum` is right for rainfall and does not exist on
    // temp_mean.
    if (granularity !== 'daily' && statistics.length
        && !(cfg.statistic && statistics.includes(cfg.statistic))) {
      const fallback = DEFAULT_STATISTIC[cfg.variable];
      next.statistic = statistics.includes(fallback) ? fallback : statistics[0];
      changed = true;
    }

    // Rule 3, and THE PIN. Defaulting to whatever is newest NOW is the whole
    // point: the stored value is then a fixed date, and the published map stays
    // on the period the text is about. Only re-seeded when the current choice
    // is not a step of the layer now selected.
    if (steps.length && !(cfg.validAt && steps.includes(cfg.validAt))) {
      next.validAt = steps[steps.length - 1];
      changed = true;
    }

    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaces.loading, statistics, steps, granularity, dailyOffered,
      cfg.cadence, cfg.variable, cfg.statistic, cfg.validAt]);

  const readerWarning = (!surfaces.loading && granularity === 'daily')
    ? 'Daily surfaces are Pro. Every reader will see this map; only Pro readers can click it for values.'
    : null;

  const stepNoun = granularity === 'daily' ? 'Day' : granularity === 'season' ? 'Season' : 'Month';

  return (
    <>
      <div>
        <label style={labelStyle}>Layer</label>
        <select
          value={cfg.variable}
          onChange={(e) => set({ variable: e.target.value })}
          style={fieldStyle}
        >
          {SURFACE_LAYERS.map((v) => (
            <option key={v} value={v}>
              {SURFACE_VARIABLES[v]?.label || v}
              {granularityFor(v) === 'season' ? ' (seasonal)' : ''}
            </option>
          ))}
        </select>
      </div>

      {dailyOffered && (
        <div>
          <label style={labelStyle}>Cadence</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['monthly', 'daily'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ cadence: c })}
                style={{
                  flex: 1, padding: '0.4rem 0.75rem', border: '1px solid',
                  borderColor: cfg.cadence === c ? '#16a34a' : '#d1d5db',
                  borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                  background: cfg.cadence === c ? '#f0fdf4' : 'white',
                  color: cfg.cadence === c ? '#16a34a' : '#6b7280',
                  fontWeight: cfg.cadence === c ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* A daily surface HAS no statistic - it is the value, not an aggregate
          over a period - so the control is absent rather than disabled. */}
      {granularity !== 'daily' && statistics.length > 1 && (
        <div>
          <label style={labelStyle}>Statistic</label>
          <select
            value={cfg.statistic}
            onChange={(e) => set({ statistic: e.target.value })}
            style={fieldStyle}
          >
            {statistics.map((st) => (
              <option key={st} value={st}>{statLabel(st, cfg.variable)}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label style={labelStyle}>{stepNoun}</label>
        {surfaces.loading ? (
          <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Loading published steps...</p>
        ) : steps.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
            No published steps for this layer.
          </p>
        ) : (
          <select
            value={cfg.validAt}
            onChange={(e) => set({ validAt: e.target.value })}
            disabled={cfg.followLatest}
            style={{ ...fieldStyle, opacity: cfg.followLatest ? 0.5 : 1 }}
          >
            {[...steps].reverse().map((st) => (
              <option key={st} value={st}>{stepLabel(st, granularity)}</option>
            ))}
          </select>
        )}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#374151', marginTop: '0.5rem' }}
        >
          <input
            type="checkbox"
            checked={cfg.followLatest}
            onChange={(e) => set({ followLatest: e.target.checked })}
          />
          Always show the newest step
        </label>
        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '2px', marginLeft: '22px' }}>
          Off by default. A pinned step keeps the map on the period the text is
          about; following the newest one moves it every month.
        </div>
      </div>

      {readerWarning && (
        <div style={{
          fontSize: '0.75rem', color: '#92400e', background: '#fffbeb',
          border: '1px solid #fde68a', borderRadius: '6px', padding: '0.5rem 0.6rem',
          lineHeight: 1.45,
        }}
        >
          {readerWarning}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Height (px)</label>
          <input
            type="number" min="220" max="900" step="20"
            value={cfg.mapHeight}
            onChange={(e) => set({ mapHeight: e.target.value })}
            style={fieldStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Basemap</label>
          <select
            value={cfg.basemap}
            onChange={(e) => set({ basemap: e.target.value })}
            style={fieldStyle}
          >
            {BASEMAP_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>
            Frame on <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
          </label>
          <input
            type="text"
            value={cfg.mapCentre}
            onChange={(e) => set({ mapCentre: e.target.value })}
            placeholder="lon,lat e.g. 173.9,-41.5"
            style={fieldStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Zoom</label>
          <input
            type="number" min="4" max="12" step="0.5"
            value={cfg.mapZoom ?? ''}
            onChange={(e) => set({ mapZoom: e.target.value })}
            placeholder="7"
            style={fieldStyle}
          />
        </div>
      </div>
      <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '-0.5rem' }}>
        Leave blank to fit all of New Zealand. Readers can pan and zoom from
        wherever it opens.
      </div>
    </>
  );
}

export default SurfaceMapFields;
