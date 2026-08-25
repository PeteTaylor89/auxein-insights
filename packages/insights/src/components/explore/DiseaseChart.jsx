// components/explore/DiseaseChart.jsx — the last 90 days of disease pressure.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// THE SHAPE IS THE PRODUCT. A botrytis index sitting at 40 says much less than
// the same 40 after a fortnight of climbing, and the Pro panel — which shows
// only the latest reading — cannot express that. Hence a series.
//
// A ROLLING WINDOW, NOT A SEASON. Disease pressure is a rolling quantity, which
// is why the article widgets deliberately left `disease_pressure` unpinned when
// everything else was pinned to `published_at` on 2026-08-23. Cutting it at the
// season boundary would blank this panel every September.
//
// Three models, three published scales, and they are NOT interchangeable:
//   powdery   UC Davis (Gubler 1999)        cumulative index 0-100
//   botrytis  Gonzalez-Dominguez (2015)     sporulation index 0-100
//   downy     Goidanich                     index
// They share an axis here because all three are "higher is worse" on a
// comparable 0-100 span, and a grower reads them together. The tooltip names
// the model so the shared axis never implies the numbers are the same quantity.
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import { Info } from 'lucide-react';
import './explore.css';

const AXIS = 'rgba(110, 106, 98, 0.9)';
const GRID = 'rgba(228, 226, 219, 0.7)';

// Terracotta, olive and a muted blue — three hues that stay distinguishable in
// the brand palette without any of them reading as "the good one".
const MODELS = [
  { key: 'powdery', label: 'Powdery mildew', colour: 'rgba(209, 88, 59, 1)' },
  { key: 'botrytis', label: 'Botrytis', colour: 'rgba(91, 104, 48, 1)' },
  { key: 'downy', label: 'Downy mildew', colour: 'rgba(90, 118, 143, 1)' },
];

function DiseaseChart({ disease }) {
  const data = useMemo(() => {
    const series = disease?.series || [];
    if (!series.length) return null;
    return {
      labels: series.map((p) => p.date),
      datasets: MODELS.map((m) => ({
        label: m.label,
        data: series.map((p) => p[m.key]),
        borderColor: m.colour,
        backgroundColor: m.colour,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      })),
    };
  }, [disease]);

  if (!disease) return null;

  if (!disease.available) {
    return (
      <p className="block__absent">
        <Info size={15} aria-hidden="true" />
        {disease.reason}
      </p>
    );
  }

  const latest = disease.latest;

  return (
    <>
      {/* The current reading in words, above the chart. A grower checking
          "should I be worried today" should not have to read a line end. */}
      {latest && (
        <div className="disease__now">
          {MODELS.map((m) => {
            const risk = latest[m.key === 'powdery' ? 'powdery_mildew'
              : m.key === 'downy' ? 'downy_mildew' : 'botrytis'];
            return (
              <span key={m.key} className={`risk risk--${(risk || 'unknown').toLowerCase()}`}>
                <i style={{ background: m.colour }} aria-hidden="true" />
                {m.label}: <strong>{risk || 'unknown'}</strong>
              </span>
            );
          })}
        </div>
      )}

      {data ? (
        <div className="block__chart block__chart--short">
          <Line
            data={data}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: { boxWidth: 12, boxHeight: 2, color: AXIS,
                            font: { size: 12 } },
                },
                tooltip: {
                  callbacks: {
                    title: (items) => new Date(items[0].label)
                      .toLocaleDateString('en-NZ',
                        { day: 'numeric', month: 'short', year: 'numeric' }),
                  },
                },
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: {
                    color: AXIS, maxTicksLimit: 6,
                    callback(value) {
                      return new Date(this.getLabelForValue(value))
                        .toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
                    },
                  },
                },
                y: {
                  beginAtZero: true,
                  grid: { color: GRID },
                  ticks: { color: AXIS },
                  title: { display: true, text: 'Risk index', color: AXIS },
                },
              },
            }}
          />
        </div>
      ) : (
        <p className="block__absent">
          <Info size={15} aria-hidden="true" />
          No readings in the last {disease.window_days} days.
        </p>
      )}

      {latest && !latest.humidity_available && (
        // Botrytis and downy both need leaf wetness. Without humidity the
        // models still run but on a degraded input, and saying so is the
        // difference between a low reading and a low reading you can act on.
        <p className="block__note">
          No humidity observations for this region — botrytis and downy mildew
          are modelled from temperature and rainfall alone.
        </p>
      )}
    </>
  );
}

export default DiseaseChart;
