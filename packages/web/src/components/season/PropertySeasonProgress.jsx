// components/season/PropertySeasonProgress.jsx — this season, drawn.
//
// Ported from the Insights Pro page's SeasonProgressChart on 2026-09-23. The
// tiles above answer "how is the season going" with three numbers. They cannot
// answer "WHEN did it go wrong", which is the question every one of them
// provokes, and that needs the curve.
//
// ## Two comparisons, one at a time, and that is not a layout preference
//
//   against its own baseline   both sides are the same 500 m cell, so the gap
//                              between them is this season and nothing else.
//   against its region         both sides are this season's weather, so the gap
//                              is where this property sits in its district.
//
// Drawn together they produce a gap that is part one and part the other, and a
// reader has no way to attribute it. The pills swap the comparison line and the
// property's own line never moves, which also makes the two views legible
// against each other because the thing being compared is held still.
//
// ## Nulls stay null
//
// `spanGaps: false` throughout. A hole in the surface is a day with no value; a
// zero on a rainfall chart is a dry day and on a GDD chart is a frost, and
// neither is what a gap means.
import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import { Loader, Info } from 'lucide-react';
import { propertyService } from '@vineyard/shared';
import '../../utils/chartDefaults';
import './PropertySeasonProgress.css';

// The property is always the same colour in both views. Its line is the
// constant; only what it is read against changes.
const SITE_COLOUR = '#3f6f4a';
const BASELINE_COLOUR = '#9a8c78';
const ZONE_COLOUR = '#5682a8';

const COMPARISONS = [
  { key: 'baseline', label: 'Its own baseline' },
  { key: 'zone', label: 'Its region' },
];

function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function PropertySeasonProgress({ propertyId, propertyName, vintage }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [metric, setMetric] = useState('gdd10');
  const [compare, setCompare] = useState('baseline');

  useEffect(() => {
    if (!propertyId) return undefined;
    let live = true;
    setState('loading');
    propertyService.getClimateSeasonSeries(propertyId, vintage)
      .then((d) => { if (live) { setData(d); setState('ready'); } })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [propertyId, vintage]);

  const current = data?.series?.[metric] || null;

  // A comparison the payload does not carry cannot be selected. A property
  // outside every wine zone has no region, and a zone with no daily climatology
  // has no baseline curve — offering a pill that draws one line is worse than
  // not offering it.
  const available = useMemo(() => COMPARISONS.filter(
    (c) => data?.series && Object.values(data.series).some((s) => s[c.key]),
  ), [data]);

  useEffect(() => {
    if (available.length && !available.some((c) => c.key === compare)) {
      setCompare(available[0].key);
    }
  }, [available, compare]);

  const chart = useMemo(() => {
    if (!current || !data) return null;
    const sets = [{
      label: propertyName || data.property_name || 'This property',
      data: current.site,
      borderColor: SITE_COLOUR,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      spanGaps: false,
      tension: 0.15,
      order: 1,
    }];

    const comparison = current[compare];
    if (comparison) {
      sets.push({
        label: compare === 'baseline'
          ? `Usual here (${data.baseline})`
          : (data.zone?.name || 'Region'),
        data: comparison,
        borderColor: compare === 'baseline' ? BASELINE_COLOUR : ZONE_COLOUR,
        backgroundColor: 'transparent',
        // DASHED for the baseline, solid for the region. One is a climatology
        // and the other is weather that actually happened this season; drawing
        // both solid says they are the same kind of thing. The legend can only
        // show that dash because `utils/chartDefaults` is imported above.
        borderDash: compare === 'baseline' ? [5, 4] : undefined,
        borderWidth: 1.6,
        pointRadius: 0,
        spanGaps: false,
        tension: 0.15,
        order: 2,
      });
    }
    return { labels: data.dates, datasets: sets };
  }, [current, compare, data, propertyName]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        ticks: {
          maxTicksLimit: 8,
          autoSkip: true,
          callback(value) { return shortDate(this.getLabelForValue(value)); },
        },
        grid: { display: false },
      },
      y: {
        title: { display: true, text: current?.unit || '' },
        // Temperature is NOT anchored at zero — a 4 °C season against a 6 °C
        // normal is the whole story, and forcing the axis to zero flattens it
        // into two lines near the top. An accumulation does start at zero,
        // because that is where the season started.
        beginAtZero: Boolean(current?.cumulative),
      },
    },
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          title: (items) => shortDate(items[0].label),
          label: (item) => `${item.dataset.label}: ${item.formattedValue} ${current?.unit || ''}`,
        },
      },
    },
  }), [current]);

  if (state === 'loading') {
    return (
      <p className="psp-state">
        <Loader size={15} className="psp-spin" aria-hidden="true" /> Loading the season…
      </p>
    );
  }
  if (state === 'error') return null;
  if (!data?.available) {
    return data?.reason ? <p className="psp-state">{data.reason}</p> : null;
  }

  return (
    <section className="psp" aria-label="Season progress">
      <div className="psp-controls">
        <div className="psp-pills" role="group" aria-label="Metric">
          {data.metrics.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`psp-pill${m.key === metric ? ' is-active' : ''}`}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {available.length > 1 && (
          <div className="psp-pills psp-pills--compare" role="group"
               aria-label="Compare against">
            <span className="psp-pills-label">against</span>
            {available.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`psp-pill${c.key === compare ? ' is-active' : ''}`}
                onClick={() => setCompare(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="psp-plot">
        {chart && <Line data={chart} options={options} />}
      </div>

      {/* Which comparison is on screen changes what the gap MEANS, so the
          sentence changes with it rather than sitting there generically. */}
      <p className="psp-note">
        <Info size={13} aria-hidden="true" />
        {compare === 'baseline'
          ? `Both lines are this property's own 500 m cell: this season against
             what it usually does by the same day, ${data.baseline}. The
             difference is the season.`
          : `Both lines are this season: this property's cell against ${data.zone?.name
             || 'its region'} as a whole. The difference is where it sits within
             its district.`}
        {' '}Measured to {shortDate(data.through)}.
      </p>
    </section>
  );
}

export default PropertySeasonProgress;
