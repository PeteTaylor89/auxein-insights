// components/pro/SitePopup.jsx — one site's season, without leaving the table.
//
// The portfolio answers "which site needs looking at". The next question is
// always "what happened there", and making somebody navigate away and back to
// ask it of six sites in turn is how a table stops being usable. So this is a
// modal over the table: open, read, close, move to the next row.
//
// ## Three panels on one time axis, not three charts
//
// Rain, temperature and disease share an x axis and are read together — a
// botrytis climb means one thing after 40 mm of rain and another after none.
// Stacking them on a common axis is the comparison; three separate charts with
// their own scales is three facts nobody can line up.
//
// Rain is bars on a reversed right-hand axis so it hangs from the top, which is
// the convention every grower has seen on a met chart, and it keeps the
// temperature line legible underneath rather than crossing it.
//
// ## Nulls stay null
//
// `spanGaps: false`, and no value is coerced to 0 anywhere. A gap in the
// disease series is a day the model could not run — most often no humidity in
// range — and plotting it as zero would draw a reassuring trough where there is
// no information.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart } from 'react-chartjs-2';
import 'chart.js/auto';
import { X, Download, Loader, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  getSiteTimeseries, downloadSiteTimeseriesCsv,
} from '../../services/proSiteService';
import '../../utils/chartDefaults';
import './SitePopup.css';

const RISK_TONE = {
  low: '#7f9a6b', moderate: '#ca8a04', medium: '#ca8a04',
  high: '#c6764c', extreme: '#b91c1c',
};

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

  const climate = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.dates,
      datasets: [
        {
          type: 'bar', label: 'Rain (mm)', data: data.rain_mm,
          backgroundColor: 'rgba(86, 130, 168, 0.45)',
          yAxisID: 'rain', order: 3,
        },
        {
          type: 'line', label: 'Max temp', data: data.temp_max,
          borderColor: '#c6764c', backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 0, spanGaps: false,
          yAxisID: 'temp', order: 1,
        },
        {
          type: 'line', label: 'Min temp', data: data.temp_min,
          borderColor: '#5682a8', backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 0, spanGaps: false,
          yAxisID: 'temp', order: 2,
        },
      ],
    };
  }, [data]);

  const disease = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.dates,
      datasets: [
        {
          type: 'line', label: 'Powdery (Gubler)', data: data.powdery_index,
          borderColor: '#8a6d1f', backgroundColor: 'transparent',
          borderWidth: 1.6, pointRadius: 0, spanGaps: false,
        },
        {
          type: 'line', label: 'Botrytis (Bacchus)', data: data.botrytis_index,
          borderColor: '#7a4b6b', backgroundColor: 'transparent',
          borderWidth: 1.6, pointRadius: 0, spanGaps: false,
        },
      ],
    };
  }, [data]);

  const climateOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { ticks: { maxTicksLimit: 8, autoSkip: true } },
      temp: { position: 'left', title: { display: true, text: 'degC' } },
      rain: {
        position: 'right', reverse: true, grid: { drawOnChartArea: false },
        title: { display: true, text: 'mm' },
        // Rain hangs from the top; without a floor at zero a dry spell inverts
        // the axis and the bars grow downward from the bottom.
        min: 0,
      },
    },
    plugins: { legend: { labels: { boxWidth: 10 } } },
  };

  const diseaseOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { ticks: { maxTicksLimit: 8, autoSkip: true } },
      y: { title: { display: true, text: 'cumulative index' } },
    },
    plugins: { legend: { labels: { boxWidth: 10 } } },
  };

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
              <h3>Rainfall and temperature</h3>
              <div className="sitepop__chart">
                <Chart type="bar" data={climate} options={climateOptions} />
              </div>
            </section>

            <section className="sitepop__panel">
              <h3>Disease pressure</h3>
              {hasDisease ? (
                <div className="sitepop__chart">
                  <Chart type="line" data={disease} options={diseaseOptions} />
                </div>
              ) : (
                // Absent for a REASON, and the reason is worth stating: the
                // point disease models need humidity within 30 km and 23 of the
                // 67 sites have none.
                <p className="sitepop__state">
                  No disease scores for this site. The point models need a
                  humidity station within range.
                </p>
              )}
            </section>

            <p className="sitepop__foot">
              {data.has_et ? (
                <>ET is modelled by {data.eto_method}. </>
              ) : (
                <>ET was not requested at this site. </>
              )}
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
