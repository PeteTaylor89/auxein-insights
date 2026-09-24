// components/explore/VegetationIndices.jsx — Sentinel-2 indices for a region.
//
// Phase 5 of the satellite indices plan: the first page that reads
// `zone_index_monthly`. The server resolves everything — coverage cut-off,
// which month is the latest usable one, the normal and its band — and this
// renders what it is handed. A month the server blanked for low coverage stays
// blank; it is never interpolated across here.
//
// THE ANOMALY IS NOT "THIS MONTH MINUS THE NORMAL LINE". The line is the
// region's usual monthly mean; the anomaly is the average of every block
// against ITS OWN record, which is what survives cloud changing which blocks
// were seen. The two can disagree slightly, and the figure labels say which is
// which rather than pretending they are the same number.
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import { Info } from 'lucide-react';
import { Locked } from './ClimateSummary';
import './explore.css';

const AXIS = 'rgba(110, 106, 98, 0.9)';   // --text-muted
const GRID = 'rgba(228, 226, 219, 0.7)';  // --border

function monthLabel(y, m, style = 'short') {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-NZ',
    style === 'long' ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
      : { month: 'short', timeZone: 'UTC' });
}

function fmt(v, digits = 2) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(digits);
}

function signed(v, digits = 2) {
  if (v === null || v === undefined) return '—';
  const r = Number(v).toFixed(digits);
  return Number(r) > 0 ? `+${r}` : r;
}

// Where the month sits against the usual range. Words, not colour alone.
function rangeWord(latest) {
  if (!latest || latest.normal_p10 === null || latest.normal_p90 === null) return null;
  if (latest.mean > latest.normal_p90) return 'above the usual range';
  if (latest.mean < latest.normal_p10) return 'below the usual range';
  return 'within the usual range';
}

function VegetationIndices({ vegetation, indexKey, onSignInRequired }) {
  const index = vegetation?.indices?.find((i) => i.key === indexKey)
    || vegetation?.indices?.[0];

  const data = useMemo(() => {
    if (!index) return null;
    const labels = index.season.map((p) => monthLabel(p.year, p.month));
    const normalFor = (p) => index.normal[p.month - 1];
    const span = index.normal_span ? index.normal_span.join('–') : '';
    return {
      labels,
      datasets: [
        // Band first so it sits behind both lines, and out of the legend: a
        // reader wants "the usual range", not an upper and a lower series.
        {
          label: 'Band upper',
          data: index.season.map((p) => normalFor(p).p90),
          borderColor: 'transparent',
          backgroundColor: 'rgba(110, 106, 98, 0.10)',
          fill: '+1',
          pointRadius: 0,
          tension: 0.3,
          order: 4,
        },
        {
          label: 'Band lower',
          data: index.season.map((p) => normalFor(p).p10),
          borderColor: 'transparent',
          fill: false,
          pointRadius: 0,
          tension: 0.3,
          order: 4,
        },
        {
          label: `${span} normal`,
          data: index.season.map((p) => normalFor(p).mean),
          borderColor: 'rgba(110, 106, 98, 0.75)',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          fill: false,
        },
        {
          label: `${vegetation.vintage} season`,
          // A blank month (cloud) breaks the line rather than being bridged.
          data: index.season.map((p) => p.mean),
          borderColor: 'rgba(91, 104, 48, 1)',   // --primary, olive
          backgroundColor: 'rgba(91, 104, 48, 1)',
          borderWidth: 2.5,
          pointRadius: 3,
          tension: 0.3,
          fill: false,
          spanGaps: false,
        },
      ],
    };
  }, [index, vegetation]);

  if (!vegetation) return null;
  if (vegetation.locked) {
    return <Locked block={vegetation} onSignInRequired={onSignInRequired} />;
  }
  if (!vegetation.available || !index) {
    return (
      <p className="block__absent">
        <Info size={15} aria-hidden="true" />
        {vegetation.reason || 'No satellite record for this region yet.'}
      </p>
    );
  }

  const { latest } = index;
  const where = rangeWord(latest);
  // From the server, so a dairy zone says "areas" without a change here.
  const [one, many] = vegetation.area_noun || ['area', 'areas'];
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: AXIS, font: { size: 12 },
                  filter: (item) => !item.text.startsWith('Band ') },
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            const p = index.season[items[0]?.dataIndex];
            return p ? monthLabel(p.year, p.month, 'long') : '';
          },
          label: (item) => {
            if (item.dataset.label.startsWith('Band ')) return null;
            return `${item.dataset.label}: ${fmt(item.parsed.y)}`;
          },
          afterBody: (items) => {
            const p = index.season[items[0]?.dataIndex];
            if (!p) return '';
            const n = index.normal[p.month - 1];
            const lines = [];
            if (p.anomaly !== null) lines.push(`Against each ${one}'s own record: ${signed(p.anomaly)}`);
            if (p.coverage !== null) lines.push(`Area observed: ${Math.round(p.coverage * 100)}%`);
            if (p.mean === null && p.coverage !== null) lines.push('Too little clear sky to report');
            if (n.p10 !== null) lines.push(`Shaded: 10th–90th percentile across ${n.n_years} years`);
            if (p.to_date) lines.push('Month to date');
            return lines;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: AXIS } },
      y: {
        grid: { color: GRID },
        ticks: { color: AXIS },
        title: { display: true, color: AXIS, text: `${index.label} (monthly mean)` },
      },
    },
  };

  return (
    <>
      {latest && (
        <div className="figures">
          <div className="figure">
            <span className="figure__label">
              {monthLabel(latest.year, latest.month, 'long')}{latest.to_date ? ', to date' : ''}
            </span>
            <span className="figure__value">{fmt(latest.mean)}</span>
            <span className="figure__sub">
              {index.label} · normal {fmt(latest.normal_mean)}
            </span>
          </div>
          <div className="figure">
            <span className="figure__label">Against the record</span>
            <span className="figure__value figure__value--delta">{signed(latest.anomaly)}</span>
            <span className="figure__sub">{where || `each ${one} against its own record`}</span>
          </div>
          <div className="figure">
            <span className="figure__label">Area observed</span>
            <span className="figure__value">
              {Math.round((latest.coverage || 0) * 100)}<small>%</small>
            </span>
            <span className="figure__sub">{latest.n_areas} {latest.n_areas === 1 ? one : many} clear of cloud</span>
          </div>
        </div>
      )}
      <div className="block__chart block__chart--short">
        <Line data={data} options={options} />
      </div>
      <p className="block__note">
        {index.meaning}, {index.resolution_m} m. {vegetation.note}
      </p>
      <p className="block__note block__note--quiet">{vegetation.attribution}</p>
    </>
  );
}

export default VegetationIndices;
