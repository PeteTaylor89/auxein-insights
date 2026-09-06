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

// THREE MODELS, THREE SCALES, AND THEY WERE ALL SHARING ONE SET OF BANDS.
//
// This used to be a single `RISK_BANDS` of 30/50/60 shaded behind both series.
// Those are the POWDERY thresholds, and they were being drawn behind botrytis —
// whose own bands are 20/50/75, and which was plotting its CUMULATIVE while the
// table's word came from its SEVERITY. A day the portfolio called "high"
// plotted at 25.8 and the tooltip labelled it "low". Wrong thresholds, wrong
// quantity, in the same tooltip.
//
// So: each model carries its own bands, the shading is gone (four rectangles
// cannot mean three things at once), and the band name in the tooltip is looked
// up per series. `severity` is plotted for botrytis because severity is what
// produces the word in the table — the number and the label are now one
// quantity.
const BANDS = {
  powdery_index: [
    { to: 30, label: 'low' }, { to: 50, label: 'moderate' },
    { to: 60, label: 'high' }, { to: Infinity, label: 'extreme' },
  ],
  botrytis_severity: [
    { to: 20, label: 'low' }, { to: 50, label: 'moderate' },
    { to: 75, label: 'high' }, { to: Infinity, label: 'extreme' },
  ],
};

const bandFor = (key, value) => {
  const scale = BANDS[key];
  if (!scale || value == null) return null;
  return scale.find((b) => value < b.to)?.label ?? null;
};

// A local plugin, not a dependency. `chartjs-plugin-annotation` would do this
// and more, and it is 40 kB to draw one rule.
//
// It draws the BACCHUS THRESHOLD, the one line on this chart that means
// something absolute: at 1.0 the infection period is complete. It is on the
// right-hand axis, so it is a rule rather than a shaded band.
const thresholdPlugin = {
  id: 'threshold',
  beforeDatasetsDraw(chart, _args, opts) {
    if (opts?.at == null) return;
    const { ctx, chartArea, scales } = chart;
    const axis = scales[opts.axis || 'y'];
    if (!chartArea || !axis) return;
    const y = axis.getPixelForValue(opts.at);
    if (y < chartArea.top || y > chartArea.bottom) return;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = opts.colour || 'rgba(185, 28, 28, 0.65)';
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (opts.label) {
      ctx.fillStyle = opts.colour || 'rgba(185, 28, 28, 0.9)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(opts.label, chartArea.right - 4, y - 2);
    }
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
      // A panel that needs a second scale declares it here. Only the disease
      // chart does, because Bacchus does not share the 0-100 index axis.
      ...(extra.scales || {}),
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
        yAxisID: 'y', key: 'powdery_index',
      },
      {
        // NAMED FOR THE MODEL THAT COMPUTES IT. This line was labelled
        // "Botrytis (Bacchus)" and was González-Domínguez the whole time.
        // Bacchus is the series below, and it is a different model.
        label: 'Botrytis (González-Domínguez)', data: data.botrytis_severity,
        borderColor: '#7a4b6b', backgroundColor: 'transparent',
        borderWidth: 1.8, pointRadius: 0, spanGaps: false, tension: 0.15,
        yAxisID: 'y', key: 'botrytis_severity',
      },
      // BACCHUS, ON ITS OWN AXIS. It is a fraction of an infection period
      // crossing at 1.0, not a 0-100 index, and putting it on the left axis
      // would draw it as a flat line on the floor — the exact "reassuring
      // trough" this file refuses to draw everywhere else.
      {
        label: 'Botrytis (Bacchus)', data: data.bacchus_index,
        borderColor: '#2f6f4f', backgroundColor: 'transparent',
        borderWidth: 1.8, borderDash: [4, 3], pointRadius: 0,
        spanGaps: false, tension: 0.15,
        yAxisID: 'yBacchus', key: 'bacchus_index',
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
    // FIXED, not fitted. Gubler and González-Domínguez both cap at 100 and
    // their bands are absolute, so a season's shape is only comparable against
    // another season if the axis does not move under it.
    y: { min: 0, max: 100, ticks: { stepSize: 20 } },
    scales: {
      yBacchus: {
        position: 'right',
        // HEADROOM ABOVE THE THRESHOLD. Capped at 1.0 the line would sit on
        // the ceiling every time an infection period completed, and a reader
        // could not tell 1.0 from 1.4.
        min: 0, max: 1.5, ticks: { stepSize: 0.5 },
        title: { display: true, text: 'Bacchus (1.0 = infection)' },
        grid: { drawOnChartArea: false },
      },
    },
    plugins: {
      threshold: {
        at: data?.bacchus_threshold ?? 1, axis: 'yBacchus',
        label: 'Bacchus infection', colour: 'rgba(47, 111, 79, 0.75)',
      },
      tooltip: {
        callbacks: {
          title: (items) => shortDate(items[0].label),
          // THE BAND COMES FROM THE SERIES' OWN MODEL. One shared band table
          // is what told a reader that a botrytis severity of 25.8 was "low"
          // on the powdery scale.
          label: (item) => {
            const key = item.dataset.key;
            if (key === 'bacchus_index') {
              const v = item.parsed.y;
              const t = data?.bacchus_threshold ?? 1;
              return `${item.dataset.label}: ${item.formattedValue} of ${t}`
                + (v >= t ? ' — infection period complete' : '');
            }
            const band = bandFor(key, item.parsed.y);
            return `${item.dataset.label}: ${item.formattedValue}`
              + (band ? ` (${band})` : '');
          },
        },
      },
    },
  }), [data]);

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
  // ANY of the three models having scored is enough to show the panel.
  const hasDisease = data && [data.botrytis_severity, data.powdery_index,
    data.bacchus_index].some((series) => (series || []).some((v) => v !== null));

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
                           plugins={[thresholdPlugin]} />
                  </div>
                  <p className="sitepop__panel-note">
                    Three models, and they do not share a scale. Gubler and
                    Gonz&aacute;lez-Dom&iacute;nguez run 0-100 on the left, with
                    their own bands &mdash; Gubler low below 30, moderate to 50,
                    high to 60; Gonz&aacute;lez-Dom&iacute;nguez low below 20,
                    moderate to 50, high to 75. Bacchus is on the right: a
                    fraction of an infection period, complete at 1.0. Hover any
                    line for its own model&rsquo;s reading.
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
