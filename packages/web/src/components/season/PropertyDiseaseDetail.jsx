// components/season/PropertyDiseaseDetail.jsx — the disease models, as numbers.
//
// The badges above this answer "what is the risk today" with three words. This
// answers what those words are made of and whether the pressure is rising,
// which is the question a spray decision actually turns on.
//
// ## FOUR MODELS, NOT THREE DISEASES
//
// Botrytis is modelled twice — González-Domínguez and Bacchus — and they are
// not two views of one number. So every card and every legend is named for its
// MODEL. A chart labelled "botrytis" that silently changes which model drew it
// is how a number outlives its provenance.
//
// ## The number and the word come from the same quantity
//
// The server sends the series the risk level is banded off — severity for
// botrytis, the cumulative index for powdery — and its OWN bands with it.
// Nothing here has a threshold of its own: a shared band table is what once put
// "high" beside 25.8, by shading botrytis under the powdery thresholds.
//
// ## Bacchus has its own axis
//
// It runs 0 to about 1.5 with an infection period at 1.0. Drawn on the 0-100
// axis it is a flat line on the floor, so it gets its own card and its own
// scale, with the threshold marked.
import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import { Info, Loader, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { propertyService } from '@vineyard/shared';
import '../../utils/chartDefaults';
import './PropertyDiseaseDetail.css';

const LINE_COLOUR = {
  powdery: '#d9a441',
  botrytis_gd: '#8a6bb5',
  bacchus: '#5b8c5a',
  downy: '#5b83a8',
};

const EXTRA_COLOUR = 'rgba(138, 107, 181, 0.45)';

const RISK_TONE = { low: 'ok', moderate: 'warning', medium: 'warning',
                    high: 'danger', extreme: 'danger' };

function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const titleCase = (s) => (s ? String(s).replace(/_/g, ' ') : null);

function ModelCard({ model, dates }) {
  // OPEN BY DEFAULT. The disease tab is now the charts and nothing else, so a
  // column of collapsed headers would be a list of things to click before
  // seeing anything. Still collapsible: four plots is a lot on a phone.
  const [open, setOpen] = useState(true);

  const chart = useMemo(() => {
    const sets = [{
      label: model.label,
      data: model.values,
      borderColor: LINE_COLOUR[model.key] || '#5b6830',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      spanGaps: false,
      tension: 0.2,
    }];
    if (model.extra) {
      sets.push({
        label: model.extra.label,
        data: model.extra.values,
        borderColor: EXTRA_COLOUR,
        backgroundColor: 'transparent',
        // Dashed because it is a DIFFERENT QUANTITY, not a second reading of
        // the same one — the legend can show that dash thanks to chartDefaults.
        borderDash: [5, 4],
        borderWidth: 1.4,
        pointRadius: 0,
        spanGaps: false,
        tension: 0.2,
      });
    }
    return { labels: dates, datasets: sets };
  }, [model, dates]);

  const options = useMemo(() => {
    // The axis belongs to the model. Bacchus is 0-1.5 and everything else is a
    // 0-100 index; sharing one scale flattens whichever is smaller.
    const isBacchus = model.axis === 'bacchus';
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxTicksLimit: 7,
            autoSkip: true,
            callback(value) { return shortDate(this.getLabelForValue(value)); },
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: isBacchus ? 1.5 : 100,
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
      plugins: {
        legend: { display: Boolean(model.extra), position: 'bottom' },
        tooltip: {
          callbacks: {
            title: (items) => shortDate(items[0].label),
            label: (item) => {
              const v = item.parsed.y;
              if (v == null) return `${item.dataset.label}: no value`;
              // The band comes from the payload's own thresholds for THIS
              // series, and only for the series it belongs to.
              const isMain = item.datasetIndex === 0;
              const band = isMain ? bandOf(model, v) : null;
              return `${item.dataset.label}: ${v}${band ? ` (${band})` : ''}`;
            },
          },
        },
      },
    };
  }, [model]);

  if (!model.has_data) {
    return (
      <article className="pdd-card pdd-card--empty">
        <h5>{model.disease} <span className="pdd-model">{model.model}</span></h5>
        <p className="pdd-note">This model has produced no values for this period.</p>
      </article>
    );
  }

  return (
    <article className={`pdd-card${open ? ' is-open' : ''}`}>
      <button type="button" className="pdd-card-head" onClick={() => setOpen((o) => !o)}
              aria-expanded={open}>
        <span className="pdd-card-title">
          {model.disease} <span className="pdd-model">{model.model}</span>
        </span>
        <span className="pdd-card-right">
          <span className="pdd-latest">
            {model.latest}
            {model.latest_band && (
              <span className={`pdd-band pdd-band--${RISK_TONE[model.latest_band] || 'ok'}`}>
                {model.latest_band}
              </span>
            )}
          </span>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div className="pdd-card-body">
          <div className="pdd-plot">
            <Line data={chart} options={options} />
          </div>
          {model.threshold != null && (
            <p className="pdd-note">
              An infection period is reached at {model.threshold}.
            </p>
          )}
          <p className="pdd-note">{model.note}</p>
          {model.extra && <p className="pdd-note">{model.extra.note}</p>}
        </div>
      )}
    </article>
  );
}

/** The band a value falls in, by this model's own thresholds. */
function bandOf(model, value) {
  let name = null;
  for (const b of model.bands || []) {
    if (value >= b.from) name = b.label;
  }
  return name;
}

function PropertyDiseaseDetail({ propertyId }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!propertyId) return undefined;
    let live = true;
    setState('loading');
    propertyService.getClimateDisease(propertyId, 30)
      .then((d) => { if (live) { setData(d); setState('ready'); } })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [propertyId]);

  if (state === 'loading') {
    return (
      <p className="pdd-state">
        <Loader size={15} className="pdd-spin" aria-hidden="true" /> Loading the models…
      </p>
    );
  }
  if (state === 'error') return null;
  if (!data?.available) {
    return data?.reason ? <p className="pdd-state">{data.reason}</p> : null;
  }

  return (
    <section className="pdd" aria-label="Disease models">
      <div className="pdd-head">
        <h4>
          <ShieldCheck size={15} aria-hidden="true" />
          The models behind these levels
        </h4>
        <p className="pdd-scope">
          {data.scope_note} {data.days} days to {shortDate(data.as_of)}
          {data.growth_stage && ` · growth stage ${titleCase(data.growth_stage)}`}
          {/* A wetness model run without a hygrometer is not the same claim as
              one run with it, so this travels with the numbers. */}
          {data.humidity_available === false
            && ' · no humidity data in this region, so these are less reliable'}
        </p>
      </div>

      <div className="pdd-cards">
        {data.models.map((m) => (
          <ModelCard key={m.key} model={m} dates={data.dates} />
        ))}
      </div>

      <p className="pdd-note pdd-note--foot">
        <Info size={13} aria-hidden="true" />
        Botrytis is modelled twice, by two models that do not share a scale. Each
        chart shows the quantity its own risk level is read from, with that
        model&rsquo;s own thresholds.
      </p>
    </section>
  );
}

export default PropertyDiseaseDetail;
