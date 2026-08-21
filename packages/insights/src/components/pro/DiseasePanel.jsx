// components/pro/DiseasePanel.jsx — disease pressure, compact, in the Pro idiom.
//
// Not the region page's `DiseasePressureExplorer`. That one carries a 14-day
// chart, expandable contributing factors and spray recommendations all at once,
// which is a browsing tool. On a site dashboard the question is narrower: what
// is the pressure right now, and how old is that reading.
//
// THE CHART IS BEHIND A CLICK. The trend is worth having, but three of them
// stacked open is the wall this panel exists to avoid. Selecting a disease opens
// its recent series and closes any other.
//
// The series is fetched ON DEMAND rather than shipped in the dashboard payload,
// because most visits never open it. The endpoint already returns a ready
// `chart_data.daily` — one row per date with a score per disease — so there is
// nothing to compute here.
//
// THREE MODELS, NAMED. "Disease risk: low" is a claim no one can check. Powdery
// is the UC Davis index, botrytis is González-Domínguez, downy is 3-10 primary
// plus Goidanich — they disagree with each other regularly and a grower needs to
// know which one is talking.
import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import { ChevronDown, Info, Loader, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { getDiseasePressure } from '../../services/realtimeClimateService';
import '../../utils/chartDefaults';
import './DiseasePanel.css';

const RECENT_DAYS = 30;

const DISEASES = [
  ['powdery_mildew', 'Powdery mildew', 'UC Davis index', '#d9a441'],
  ['botrytis', 'Botrytis', 'González-Domínguez', '#8a6bb5'],
  ['downy_mildew', 'Downy mildew', '3-10 primary · Goidanich', '#5b83a8'],
];

// The model's levels, in order of severity. An unmapped level renders as itself
// at neutral weight rather than being silently treated as low.
const LEVELS = {
  low: { label: 'Low', tone: 'low', Icon: ShieldCheck },
  moderate: { label: 'Moderate', tone: 'moderate', Icon: ShieldAlert },
  medium: { label: 'Moderate', tone: 'moderate', Icon: ShieldAlert },
  high: { label: 'High', tone: 'high', Icon: ShieldAlert },
  extreme: { label: 'Extreme', tone: 'extreme', Icon: ShieldX },
};

function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function Trend({ series, colour, label }) {
  const data = useMemo(() => ({
    labels: series.map((p) => p.date.slice(5)),
    datasets: [{
      label,
      data: series.map((p) => p.value),
      borderColor: colour,
      backgroundColor: `${colour}22`,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: true,
      tension: 0.25,
    }],
  }), [series, colour, label]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
      // Scores run 0-100 on a fixed scale, so an axis that auto-fits a quiet
      // fortnight would turn noise into a mountain range.
      y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.06)' } },
    },
  }), []);

  return (
    <div className="disease__chart">
      <Line data={data} options={options} />
    </div>
  );
}

function DiseasePanel({ disease, zoneSlug }) {
  const [open, setOpen] = useState(null);
  const [series, setSeries] = useState(null);
  const [state, setState] = useState('idle');

  useEffect(() => {
    if (!open || !zoneSlug) return undefined;
    let live = true;
    setState('loading');
    getDiseasePressure(zoneSlug, { recent_days: RECENT_DAYS })
      .then((res) => {
        if (!live) return;
        setSeries(res?.chart_data?.daily || []);
        setState('ready');
      })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [open, zoneSlug]);

  if (!disease?.available || !disease.latest) return null;
  const latest = disease.latest;

  const points = (series || [])
    .map((row) => ({ date: row.date, value: row[open] }))
    .filter((p) => p.value != null);

  return (
    <div className="disease">
      <div className="disease__row">
        {DISEASES.map(([key, label, model, colour]) => {
          const level = LEVELS[latest[key]] || {
            label: latest[key] || '—', tone: 'unknown', Icon: Info,
          };
          const { Icon } = level;
          const isOpen = open === key;
          return (
            <button
              type="button"
              key={key}
              className={`disease__card is-${level.tone}${isOpen ? ' is-open' : ''}`}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : key)}
            >
              <p className="disease__label">
                {label}
                <ChevronDown size={13} aria-hidden="true"
                             className="disease__chevron" />
              </p>
              <p className="disease__level">
                <Icon size={15} aria-hidden="true" />
                {level.label}
              </p>
              <p className="disease__model">{model}</p>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="disease__detail">
          {state === 'loading' && (
            <p className="disease__loading">
              <Loader size={14} className="spin" aria-hidden="true" /> Loading…
            </p>
          )}
          {state === 'error' && (
            <p className="disease__loading">Could not load the trend.</p>
          )}
          {state === 'ready' && points.length === 0 && (
            <p className="disease__loading">
              No scored history for this model yet.
            </p>
          )}
          {state === 'ready' && points.length > 0 && (
            <>
              <Trend
                series={points}
                colour={DISEASES.find(([k]) => k === open)[3]}
                label={DISEASES.find(([k]) => k === open)[1]}
              />
              <p className="disease__chart-note">
                Risk score, last {points.length} days · regional
              </p>
            </>
          )}
        </div>
      )}

      <p className="disease__meta">
        <Info size={13} aria-hidden="true" />
        {dayLabel(latest.date)}
        {latest.growth_stage && ` · ${latest.growth_stage.replace(/_/g, ' ')}`}
        {/* Not a footnote. Two of these three models are driven by leaf
            wetness, so a zone without humidity is running them on a proxy and
            the reading is weaker than it looks. */}
        {latest.humidity_available === false
          && ' · no humidity data in this region, so these are less reliable'}
      </p>
    </div>
  );
}

export default DiseasePanel;
