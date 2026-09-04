// components/pro/SitePopup.jsx — one site's season, without leaving the table.
//
// The portfolio answers "which site needs looking at". The next question is
// always "what happened there", and making somebody navigate away and back to
// ask it of six sites in turn is how a table stops being usable. So this is a
// modal over the table: open, read, close, move to the next row.
//
// ## FOUR PANELS ON ONE SHARED DATE AXIS, OR SIX WHERE ET WAS ASKED FOR
//
// This used to be two: rain and temperature stacked on one plot with rain on a
// reversed right-hand axis, and disease on a second. Three things were wrong
// with it.
//
// **Rain and temperature were fighting for one plot.** A dual axis is readable
// when both series matter at every x — this pairing does not. Rainfall in New
// Zealand is a few tall spikes in a flat field, so the bars either flatten the
// temperature lines or vanish under them depending on which axis wins, and the
// reversed axis meant a wet day and a cold day both pointed the same way. They
// are separated now. The x axis is shared, which was the actual argument for
// stacking them, and stacked PANELS keep it while giving each series its own
// vertical space.
//
// **The disease plot rescaled itself every time it was opened.** Both indices
// run 0-100 with risk thresholds at 30 / 50 / 60, and a chart auto-scaled to a
// winter maximum of 3 draws a quiet fortnight as a mountain range. The axis is
// fixed at 0-100 with the bands shaded behind it, so the same shape means the
// same thing on every site and the reader is looking at where the line sits in
// the bands rather than at its wiggle.
//
// **ET and the water balance were computed and never drawn.** Eight sites carry
// them, and the whole of what this modal said about that was one line of footer
// text naming the method. The numbers existed with nowhere to be read.
//
// A panel was also added for **GDD against this site's own long-term average**.
// It is the number the portfolio table sorts on, and until now the only place
// to see how it got there was a single figure.
//
// ## Nulls stay null
//
// `spanGaps: false`, and no value is coerced to 0 anywhere. A gap in the
// disease series is a day the model could not run — most often no humidity in
// range — and plotting it as zero would draw a reassuring trough where there is
// no information.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart, Line, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { X, Download, Loader, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  getSiteTimeseries, downloadSiteTimeseriesCsv,
} from '../../services/proSiteService';
import '../../utils/chartDefaults';
import './SitePopup.css';

// The model's own bands, from `disease_service_v2`: low below 30, moderate to
// 50, high to 60, extreme above. Drawn rather than described, because "is this
// bad" is a question about which band the line is in and a reader should not
// have to hold four numbers in their head to answer it.
const RISK_BANDS = [
  { from: 0, to: 30, fill: 'rgba(127, 154, 107, 0.10)', label: 'low' },
  { from: 30, to: 50, fill: 'rgba(202, 138, 4, 0.10)', label: 'moderate' },
  { from: 50, to: 60, fill: 'rgba(198, 118, 76, 0.12)', label: 'high' },
  { from: 60, to: 100, fill: 'rgba(185, 28, 28, 0.12)', label: 'extreme' },
];

// A local plugin, not a dependency. `chartjs-plugin-annotation` would do this
// and more, and it is 40 kB to shade four rectangles.
const riskBandsPlugin = {
  id: 'riskBands',
  beforeDatasetsDraw(chart, _args, opts) {
    if (!opts?.bands) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.y) return;
    ctx.save();
    opts.bands.forEach((band) => {
      const top = scales.y.getPixelForValue(band.to);
      const bottom = scales.y.getPixelForValue(band.from);
      ctx.fillStyle = band.fill;
      ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left,
                   bottom - top);
    });
    ctx.restore();
  },
};

function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Every panel shares this so the four plots line up as one reading. Only the y
// axis and the title differ.
function baseOptions(unit, extra = {}) {
  return {
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
      y: { title: { display: true, text: unit }, ...(extra.y || {}) },
    },
    plugins: {
      legend: { labels: { boxWidth: 10 } },
      tooltip: {
        callbacks: { title: (items) => shortDate(items[0].label) },
      },
      ...(extra.plugins || {}),
    },
  };
}

function SitePopup({ site, vintage, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!site) return undefined;
    let live = true;
    setLoading(true);
    setData(null);
    getSiteTimeseries(site.site_id, { vintage })
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => {
        if (live) setError(e?.response?.data?.detail || 'Could not load this site.');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [site, vintage]);

  // Escape closes. A modal that can only be dismissed by finding the X is a
  // modal somebody gets stuck in halfway down a 67-row table.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const temperature = useMemo(() => (data ? {
    labels: data.dates,
    datasets: [
      {
        label: 'Max', data: data.temp_max,
        borderColor: '#c6764c', backgroundColor: 'transparent',
        borderWidth: 1.5, pointRadius: 0, spanGaps: false, tension: 0.15,
      },
      {
        label: 'Mean', data: data.temp_mean,
        borderColor: '#8a8378', backgroundColor: 'transparent',
        borderWidth: 1.2, pointRadius: 0, spanGaps: false, tension: 0.15,
        borderDash: [4, 3],
      },
      {
        label: 'Min', data: data.temp_min,
        borderColor: '#5682a8', backgroundColor: 'transparent',
        borderWidth: 1.5, pointRadius: 0, spanGaps: false, tension: 0.15,
      },
    ],
  } : null), [data]);

  const rainfall = useMemo(() => (data ? {
    labels: data.dates,
    datasets: [{
      label: 'Rain (mm)', data: data.rain_mm,
      backgroundColor: 'rgba(86, 130, 168, 0.55)',
      borderColor: 'rgba(86, 130, 168, 0.9)',
      borderWidth: 0,
      // Rain reads upward now that it has its own panel. The old reversed
      // right-hand axis existed to keep it out of the temperature lines' way,
      // and with the panels separated that cost buys nothing.
      barPercentage: 1, categoryPercentage: 1,
    }],
  } : null), [data]);

  const gdd = useMemo(() => {
    if (!data) return null;
    const sets = [{
      label: 'This season', data: data.gdd10_cumulative,
      borderColor: '#3f6f4a', backgroundColor: 'transparent',
      borderWidth: 2, pointRadius: 0, spanGaps: false, tension: 0.15,
    }];
    if (data.gdd10_baseline) {
      sets.push({
        label: `Usual here (${data.baseline_period})`,
        data: data.gdd10_baseline,
        borderColor: '#9a8c78', backgroundColor: 'transparent',
        borderWidth: 1.6, pointRadius: 0, spanGaps: false, tension: 0.15,
        borderDash: [5, 4],
      });
    }
    return { labels: data.dates, datasets: sets };
  }, [data]);

  // ETo and ETc, DAILY millimetres. Two lines rather than one because the gap
  // between them is the crop coefficient — early in the season ETc is a third
  // of ETo, and a chart showing only ETc hides how much of the demand the
  // canopy is not yet taking.
  const et = useMemo(() => (data && data.has_et ? {
    labels: data.dates,
    datasets: [
      {
        label: 'Reference ET (ETo)', data: data.eto_mm,
        borderColor: '#8a8378', backgroundColor: 'transparent',
        borderWidth: 1.5, pointRadius: 0, spanGaps: false, tension: 0.15,
        borderDash: [4, 3],
      },
      {
        label: 'Crop ET (ETc)', data: data.etc_mm,
        borderColor: '#3f6f4a', backgroundColor: 'transparent',
        borderWidth: 1.8, pointRadius: 0, spanGaps: false, tension: 0.15,
      },
    ],
  } : null), [data]);

  // CUMULATIVE, from the start of the season: rain in, crop ET out. So the
  // number that matters is which side of zero it is on and for how long, not
  // its day-to-day movement — which is why it is filled to the zero line rather
  // than drawn as a bare series.
  const water = useMemo(() => (data && data.has_et ? {
    labels: data.dates,
    datasets: [{
      label: 'Water balance (rain − ETc, cumulative)',
      data: data.water_balance_mm,
      borderColor: '#5682a8',
      backgroundColor: 'rgba(86, 130, 168, 0.16)',
      borderWidth: 1.8, pointRadius: 0, spanGaps: false, tension: 0.15,
      fill: 'origin',
    }],
  } : null), [data]);

  const disease = useMemo(() => (data ? {
    labels: data.dates,
    datasets: [
      {
        label: 'Powdery (Gubler)', data: data.powdery_index,
        borderColor: '#8a6d1f', backgroundColor: 'transparent',
        borderWidth: 1.8, pointRadius: 0, spanGaps: false, tension: 0.15,
      },
      {
        label: 'Botrytis (Bacchus)', data: data.botrytis_index,
        borderColor: '#7a4b6b', backgroundColor: 'transparent',
        borderWidth: 1.8, pointRadius: 0, spanGaps: false, tension: 0.15,
      },
    ],
  } : null), [data]);

  const temperatureOptions = useMemo(() => baseOptions('°C'), []);
  const rainfallOptions = useMemo(() => baseOptions('mm', {
    // A rainfall axis that does not start at zero is not a rainfall axis.
    y: { beginAtZero: true },
  }), []);
  const gddOptions = useMemo(() => baseOptions('GDD', {
    y: { beginAtZero: true },
  }), []);
  const etOptions = useMemo(() => baseOptions('mm/day', {
    y: { beginAtZero: true },
  }), []);

  // NOT anchored at zero. A deficit is the whole point of this chart and
  // clamping the axis at zero would push every dry site's line onto the floor.
  const waterOptions = useMemo(() => baseOptions('mm', {}), []);

  const diseaseOptions = useMemo(() => baseOptions('index (0-100)', {
    // FIXED, not fitted. Both models cap at 100 and their risk bands are
    // absolute, so a season's shape is only comparable against another season
    // if the axis does not move under it.
    y: { min: 0, max: 100, ticks: { stepSize: 20 } },
    plugins: {
      riskBands: { bands: RISK_BANDS },
      tooltip: {
        callbacks: {
          title: (items) => shortDate(items[0].label),
          label: (item) => {
            const band = RISK_BANDS.find(
              (b) => item.parsed.y >= b.from && item.parsed.y < b.to);
            return `${item.dataset.label}: ${item.formattedValue}`
              + (band ? ` (${band.label})` : '');
          },
        },
      },
    },
  }), []);

  const exportOne = async () => {
    setExporting(true);
    try {
      await downloadSiteTimeseriesCsv(site.site_id, site.label, { vintage });
    } catch {
      setError('The export failed. Nothing was downloaded.');
    } finally {
      setExporting(false);
    }
  };

  if (!site) return null;
  const hasDisease = data && data.botrytis_index.some((v) => v !== null);

  return (
    <div className="sitepop__backdrop" role="dialog" aria-modal="true"
         aria-label={`${site.label} season`} onClick={onClose}>
      <div className="sitepop" onClick={(e) => e.stopPropagation()}>
        <header className="sitepop__head">
          <div>
            <h2>{site.label}</h2>
            <p>
              {site.zone_name || 'No region'}
              {site.variety && <> · {site.variety}</>}
              {data && <> · {data.start} to {data.end}</>}
            </p>
          </div>
          <div className="sitepop__actions">
            <button type="button" className="btn btn-secondary"
                    onClick={exportOne} disabled={!data || exporting}>
              {exporting
                ? <Loader size={14} className="spin" aria-hidden="true" />
                : <Download size={14} aria-hidden="true" />}
              {' '}CSV
            </button>
            <Link to={`/pro/sites/${site.site_id}`} className="btn btn-secondary">
              <ExternalLink size={14} aria-hidden="true" /> Full site
            </Link>
            <button type="button" className="sitepop__close" onClick={onClose}
                    aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </header>

        {loading && (
          <p className="sitepop__state">
            <Loader size={16} className="spin" aria-hidden="true" /> Loading…
          </p>
        )}
        {error && (
          <p className="sitepop__state sitepop__state--error">
            <AlertTriangle size={15} aria-hidden="true" /> {error}
          </p>
        )}

        {data && !loading && data.days === 0 && (
          <p className="sitepop__state">
            No daily record for this season yet.
          </p>
        )}

        {data && !loading && data.days > 0 && (
          <>
            <section className="sitepop__panel">
              <h3>Growing degree days</h3>
              <div className="sitepop__chart">
                <Line data={gdd} options={gddOptions} />
              </div>
              {!data.gdd10_baseline && (
                // Absent for a reason, and the reason is worth stating rather
                // than leaving a single line looking like the whole answer.
                <p className="sitepop__panel-note">
                  No long-term average to compare against: this site sits
                  outside the wine climate zones.
                </p>
              )}
            </section>

            <section className="sitepop__panel">
              <h3>Temperature</h3>
              <div className="sitepop__chart">
                <Line data={temperature} options={temperatureOptions} />
              </div>
            </section>

            <section className="sitepop__panel">
              <h3>Rainfall</h3>
              <div className="sitepop__chart sitepop__chart--short">
                <Bar data={rainfall} options={rainfallOptions} />
              </div>
            </section>

            {/* ONLY WHERE ET WAS ASKED FOR. Eight of the sixty-seven sites
                carry it — `site_water.wants` gates on the client's own request,
                so an absent series here is a site nobody asked to model, not a
                site that used no water. Until now the popup said so in one line
                of footer text and drew nothing, which for the eight sites that
                DO have it meant the numbers existed and had nowhere to be
                read. */}
            {data.has_et && (
              <>
                <section className="sitepop__panel">
                  <h3>Water balance</h3>
                  <div className="sitepop__chart sitepop__chart--short">
                    <Line data={water} options={waterOptions} />
                  </div>
                  <p className="sitepop__panel-note">
                    Cumulative rainfall less crop ET since 1 September. Below
                    zero is a soil-moisture deficit; this is a climate balance
                    and carries no soil store or irrigation.
                  </p>
                </section>

                <section className="sitepop__panel">
                  <h3>Evapotranspiration</h3>
                  <div className="sitepop__chart sitepop__chart--short">
                    <Line data={et} options={etOptions} />
                  </div>
                  <p className="sitepop__panel-note">
                    ETo by {data.eto_method}. ETc is ETo scaled by the vine crop
                    coefficient for the day of season.
                  </p>
                </section>
              </>
            )}

            <section className="sitepop__panel">
              <h3>Disease pressure</h3>
              {hasDisease ? (
                <>
                  <div className="sitepop__chart">
                    <Chart type="line" data={disease} options={diseaseOptions}
                           plugins={[riskBandsPlugin]} />
                  </div>
                  <p className="sitepop__panel-note">
                    Both indices run 0-100. The shading is the model&rsquo;s own
                    risk bands: low below 30, moderate to 50, high to 60,
                    extreme above.
                  </p>
                </>
              ) : (
                // Absent for a REASON, and the reason is worth stating: the
                // point disease models need humidity within 30 km.
                <p className="sitepop__state">
                  No disease scores for this site. The point models need a
                  humidity station within range.
                </p>
              )}
            </section>

            <p className="sitepop__foot">
              {!data.has_et && <>ET was not requested at this site. </>}
              Gaps are days with no value and are left empty rather than drawn
              as zero.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default SitePopup;
