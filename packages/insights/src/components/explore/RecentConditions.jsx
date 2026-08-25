// components/explore/RecentConditions.jsx — the last ten days, measured.
//
// Added 2026-08-24 as the free tier's anchor. It is the only block on the page
// that is purely observed — stations aggregated to the region, no
// interpolation, no baseline, no model. A grower can read it and act on it
// without an account doing anything for them, which is what makes the free
// offering worth landing on.
//
// TEMPERATURE IS A BAND, NOT THREE LINES. Min/mean/max drawn as three separate
// series is a tangle at ten points; the daily range as a filled band with the
// mean through it is the same information and reads instantly.
//
// RAINFALL GETS ITS OWN AXIS. A 40 mm day and a 4°C night share no scale, and
// putting them on one makes whichever is smaller invisible. Bars, because a
// daily total is a quantity for that day and not a value passing through it.
import { useMemo } from 'react';
import { Chart } from 'react-chartjs-2';
import 'chart.js/auto';
import { CloudSunRain, Info } from 'lucide-react';
import './explore.css';

const AXIS = 'rgba(110, 106, 98, 0.9)';
const GRID = 'rgba(228, 226, 219, 0.7)';
const OLIVE = 'rgba(91, 104, 48, 1)';
const OLIVE_FILL = 'rgba(91, 104, 48, 0.16)';
const RAIN = 'rgba(90, 118, 143, 0.75)';

function RecentConditions({ recent }) {
  const data = useMemo(() => {
    const series = recent?.series || [];
    if (!series.length) return null;

    return {
      labels: series.map((p) => p.date),
      datasets: [
        {
          type: 'bar',
          label: 'Rainfall',
          data: series.map((p) => p.rain),
          backgroundColor: RAIN,
          borderWidth: 0,
          yAxisID: 'rain',
          order: 3,
          // A dry day is a real observation of zero, so the bar is drawn at
          // zero rather than the point being dropped.
          barPercentage: 0.55,
        },
        // The band is two lines with a fill between them. Chart.js has no other
        // way to express one, and they are hidden from the legend because a
        // reader wants "the daily range", not "daily max" and "daily min" as
        // two separate things they have to mentally recombine.
        {
          type: 'line',
          label: 'Daily high',
          data: series.map((p) => p.temp_max),
          borderColor: 'transparent',
          backgroundColor: OLIVE_FILL,
          fill: '+1',
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'temp',
          order: 2,
        },
        {
          type: 'line',
          label: 'Daily low',
          data: series.map((p) => p.temp_min),
          borderColor: 'transparent',
          fill: false,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'temp',
          order: 2,
        },
        {
          type: 'line',
          label: 'Temperature',
          data: series.map((p) => p.temp_mean),
          borderColor: OLIVE,
          backgroundColor: OLIVE,
          borderWidth: 2.5,
          pointRadius: 2,
          tension: 0.3,
          fill: false,
          yAxisID: 'temp',
          order: 1,
        },
      ],
    };
  }, [recent]);

  if (!recent) return null;

  if (!recent.available) {
    return (
      <p className="block__absent">
        <Info size={15} aria-hidden="true" />
        {recent.reason}
      </p>
    );
  }

  const s = recent.summary || {};

  return (
    <>
      <div className="recent__summary">
        <span><CloudSunRain size={15} aria-hidden="true" /> Last {recent.window_days} days</span>
        {s.warmest !== null && s.warmest !== undefined && (
          <span>High <strong>{s.warmest.toFixed(1)}°C</strong></span>
        )}
        {s.coldest !== null && s.coldest !== undefined && (
          <span>Low <strong>{s.coldest.toFixed(1)}°C</strong></span>
        )}
        <span>Rain <strong>{s.rain_total} mm</strong></span>
      </div>

      <div className="block__chart block__chart--short">
        <Chart
          type="bar"
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  boxWidth: 12,
                  boxHeight: 2,
                  color: AXIS,
                  font: { size: 12 },
                  // The two band edges are plumbing, not series.
                  filter: (item) => !item.text.startsWith('Daily '),
                },
              },
              tooltip: {
                callbacks: {
                  title: (items) => new Date(items[0].label)
                    .toLocaleDateString('en-NZ',
                      { weekday: 'short', day: 'numeric', month: 'short' }),
                  label: (item) => {
                    const v = item.parsed.y;
                    if (v === null || v === undefined) return null;
                    if (item.dataset.label === 'Rainfall') return `Rain: ${v.toFixed(1)} mm`;
                    if (item.dataset.label === 'Temperature') return `Mean: ${v.toFixed(1)}°C`;
                    return `${item.dataset.label}: ${v.toFixed(1)}°C`;
                  },
                  // How many gauges stood behind the day. It varies, and a day
                  // built from three is a weaker claim than one from nine.
                  afterBody: (items) => {
                    const p = recent.series[items[0].dataIndex];
                    return p?.stations ? `${p.stations} stations` : '';
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  color: AXIS,
                  callback(value) {
                    return new Date(this.getLabelForValue(value))
                      .toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
                  },
                },
              },
              temp: {
                position: 'left',
                grid: { color: GRID },
                ticks: { color: AXIS, callback: (v) => `${v}°` },
                title: { display: true, text: 'Temperature (°C)', color: AXIS },
              },
              rain: {
                position: 'right',
                beginAtZero: true,
                grid: { display: false },
                ticks: { color: AXIS },
                title: { display: true, text: 'Rain (mm)', color: AXIS },
              },
            },
          }}
        />
      </div>

      {recent.days_present < recent.window_days && (
        <p className="block__note">
          {recent.days_present} of the last {recent.window_days} days have a
          station record for this region.
        </p>
      )}
    </>
  );
}

export default RecentConditions;
