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
// Four models, four published scales, and they are NOT interchangeable:
//   powdery   UC Davis (Gubler 1999)        cumulative index 0-100
//   botrytis  Gonzalez-Dominguez (2015)     sporulation index 0-100
//   downy     Goidanich                     index
//   bacchus   Balasubramaniam & Edwards     fraction of ONE infection period
// The first three share an axis because all three are "higher is worse" on a
// comparable 0-100 span, and a grower reads them together. The tooltip names
// the model so the shared axis never implies the numbers are the same quantity.
//
// BACCHUS IS ON ITS OWN AXIS, added 2026-09-16 when the zone path began scoring
// it. It crosses at exactly 1.0 and is not a 0-100 index; drawn on the left
// axis it would be a flat line along the floor — a reassuring trough, on the
// one series here capable of saying "infection today".
//
// THE SERIES IS THE DAY'S PEAK, not the index carried out of it. A day can
// complete an infection and then be wiped by four dry hours before midnight:
// Nelson on 2026-09-07 peaked at 1.32, fired, and carried out 0.00. The carried
// index would have drawn that day on the floor.
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import { Info } from 'lucide-react';
import { thresholdPlugin, BACCHUS_THRESHOLD, BACCHUS_COLOUR }
  from '../../utils/thresholdPlugin';
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
  // A zone scored before 2026-09-16 has no Bacchus at all, and a region whose
  // whole window predates it must not gain an empty right-hand axis and a
  // legend entry for a line that is not there.
  const hasBacchus = useMemo(() => (
    (disease?.series || []).some((p) => p.bacchus_peak != null)
  ), [disease]);

  const data = useMemo(() => {
    const series = disease?.series || [];
    if (!series.length) return null;
    const datasets = MODELS.map((m) => ({
      label: m.label,
      data: series.map((p) => p[m.key]),
      borderColor: m.colour,
      backgroundColor: m.colour,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      fill: false,
      yAxisID: 'y',
    }));

    if (hasBacchus) {
      datasets.push({
        // NAMED FOR ITS MODEL. The plain "Botrytis" line above is
        // González-Domínguez; this is a different model of the same disease and
        // the two legitimately disagree, most of all in early spring when only
        // one of them scales by growth stage.
        label: 'Botrytis (Bacchus)',
        data: series.map((p) => p.bacchus_peak),
        borderColor: BACCHUS_COLOUR,
        backgroundColor: BACCHUS_COLOUR,
        borderWidth: 2,
        borderDash: [4, 3],
        // A DIAMOND for the infection markers, so an event reads as an event
        // rather than as an ordinary daily reading. The legend no longer needs
        // this to be distinguishable — its swatch is a dashed line now, see the
        // `legend.labels` block below.
        pointStyle: 'rectRot',
        // A POINT ON THE DAYS THAT FIRED, and nowhere else. The crossing is the
        // event, and a peak of 1.02 against 0.98 is not a distinction the line
        // can make at this height.
        pointRadius: series.map((p) => (p.bacchus_infection ? 4 : 0)),
        pointBackgroundColor: BACCHUS_COLOUR,
        // spanGaps stays FALSE: a day the model could not run is a break in the
        // line, not a straight segment drawn across it.
        spanGaps: false,
        tension: 0.3,
        fill: false,
        yAxisID: 'yBacchus',
      });
    }

    return { labels: series.map((p) => p.date), datasets };
  }, [disease, hasBacchus]);

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
            plugins={hasBacchus ? [thresholdPlugin] : []}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  position: 'bottom',
                  // Line-shaped swatches — so the dashed Bacchus series is
                  // identifiable from its legend entry — come from
                  // `utils/chartDefaults` and apply app-wide. Only the colour
                  // and size are set here.
                  labels: { color: AXIS, font: { size: 12 } },
                },
                threshold: hasBacchus ? {
                  at: BACCHUS_THRESHOLD, axis: 'yBacchus',
                  label: 'Bacchus infection',
                  colour: 'rgba(47, 111, 79, 0.75)',
                } : {},
                tooltip: {
                  callbacks: {
                    title: (items) => new Date(items[0].label)
                      .toLocaleDateString('en-NZ',
                        { day: 'numeric', month: 'short', year: 'numeric' }),
                    // Bacchus is read against 1.0, not against 100, so it gets
                    // three decimals and the threshold said out loud. Without
                    // this it renders beside three 0-100 indices and reads as
                    // a rounding error.
                    label: (item) => {
                      const v = item.parsed.y;
                      if (item.dataset.yAxisID !== 'yBacchus') {
                        return `${item.dataset.label}: ${v == null ? '—' : Math.round(v)}`;
                      }
                      if (v == null) return `${item.dataset.label}: —`;
                      const fired = v >= BACCHUS_THRESHOLD;
                      return `${item.dataset.label}: ${v.toFixed(3)} of `
                        + `${BACCHUS_THRESHOLD.toFixed(1)}${fired ? ' — infection' : ''}`;
                    },
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
                // HEADROOM ABOVE THE THRESHOLD. Capped at 1.0 the line would
                // sit on the ceiling every time a period completed, and a
                // reader could not tell 1.0 from 1.4.
                ...(hasBacchus ? {
                  yBacchus: {
                    position: 'right',
                    min: 0, max: 1.5,
                    ticks: { color: AXIS, stepSize: 0.5 },
                    title: { display: true, color: AXIS,
                             text: 'Bacchus (1.0 = infection)' },
                    // The left axis owns the gridlines. Two sets of horizontal
                    // rules at different intervals is a moiré, not a chart.
                    grid: { drawOnChartArea: false },
                  },
                } : {}),
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

      {hasBacchus && data && (
        // TWO BOTRYTIS LINES IS NOT A MISTAKE, and a reader who assumes it is
        // will take the pair for a data error. Said once, under the chart.
        <p className="block__note">
          Both botrytis lines model the same disease. “Botrytis” is
          González-Domínguez on the left axis (0–100); “Botrytis (Bacchus)” is
          the Bacchus index on the right, where 1.0 completes an infection
          period. They disagree most in early spring, because only
          González-Domínguez scales by growth stage.
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
