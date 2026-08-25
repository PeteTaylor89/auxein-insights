// src/components/RegionalMap/ClimateZonePanel.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Thermometer, Droplets, Sun, ChevronRight,
  AlertCircle, RefreshCw, Loader, Radio
} from 'lucide-react';
import {
  getZoneBaseline,
  getZoneProjections,
  formatMetricValue,
} from '../../services/publicClimateService';
import { getZonesWithData } from '../../services/realtimeClimateService';
import { useCountryIndustry } from '../../contexts/CountryIndustryContext';

const SSP_LABELS = {
  SSP126: { label: 'Low emissions', color: '#22c55e', desc: 'SSP1-2.6 — Strong climate action, rapid emissions cuts' },
  SSP245: { label: 'Mid-range', color: '#f59e0b', desc: 'SSP2-4.5 — Moderate action, current trajectory' },
  SSP370: { label: 'High emissions', color: '#ef4444', desc: 'SSP3-7.0 — Limited action, continued fossil fuel use' },
};

const GS_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4];

function MonthBar({ month, onHover, onLeave }) {
  const tmin = Number(month.tmin);
  const tmax = Number(month.tmax);
  const tmean = Number(month.tmean);
  const rain = Number(month.rain);

  // Temp scale: 0°C = bottom, 30°C = top
  const tScale = (v) => Math.max(0, Math.min(100, (v / 30) * 100));
  // Rain scale: normalise to max ~120mm
  const rainH = Math.max(2, Math.min(100, (rain / 120) * 100));

  return (
    <div
      className="czp-month-col"
      onMouseEnter={(e) => onHover(month, e)}
      onMouseLeave={onLeave}
    >
      <div className="czp-month-bar-wrap">
        <div
          className="czp-month-range"
          style={{
            bottom: `${tScale(tmin)}%`,
            height: `${Math.max(2, tScale(tmax) - tScale(tmin))}%`,
          }}
        />
        <div
          className="czp-month-mean"
          style={{ bottom: `${tScale(tmean)}%` }}
        />
      </div>
      <div className="czp-rain-bar-wrap">
        <div className="czp-rain-bar" style={{ height: `${rainH}%` }} />
      </div>
      <span className="czp-month-label">{month.month_name.slice(0, 3)}</span>
    </div>
  );
}

function ClimateZonePanel({ zone, onClose }) {
  // Region links carry the current (country, industry) scope. Outside a
  // scoped route this falls back to the visitor's last scope, then to
  // New Zealand wine — so no link has to bounce through the /regions redirect.
  const { path } = useCountryIndustry();

  const navigate = useNavigate();
  const [baselineData, setBaselineData] = useState(null);
  const [projectionsData, setProjectionsData] = useState(null);
  const [hasLiveData, setHasLiveData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [tooltip, setTooltip] = useState(null);
  const [projTooltip, setProjTooltip] = useState(null);

  useEffect(() => {
    if (!zone?.slug) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [baseline, projections, realtimeZones] = await Promise.all([
          getZoneBaseline(zone.slug),
          getZoneProjections(zone.slug, { ssp: 'all', period: '2041_2060' }),
          getZonesWithData().catch(() => ({ zones: [] })),
        ]);

        setBaselineData(baseline);
        setProjectionsData(projections);

        const liveSlugs = (realtimeZones.zones || []).map(z => z.slug);
        setHasLiveData(liveSlugs.includes(zone.slug));
      } catch (err) {
        console.error('Error loading climate zone data:', err);
        setError('Failed to load climate data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [zone?.slug, retryCount]);

  const handleExplore = () => {
    onClose();
    // The explorers moved off the landing page to /regions/:slug (2026-08-13).
    // The old `/?view=…&zone=…` form still forwards here, but linking straight
    // to the destination avoids a pointless redirect hop.
    navigate(`${path(zone.slug)}?view=climatehistory`);
  };

  const handleTooltip = (month, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const panel = e.currentTarget.closest('.czp-panel').getBoundingClientRect();
    setTooltip({
      month,
      x: rect.left - panel.left + rect.width / 2,
      y: rect.top - panel.top - 4,
    });
  };

  if (!zone) return null;

  const season = baselineData?.season;

  const gsMonthly = baselineData?.monthly
    ?.filter(m => GS_MONTHS.includes(m.month))
    ?.sort((a, b) => GS_MONTHS.indexOf(a.month) - GS_MONTHS.indexOf(b.month));

  const projSummary = (projectionsData?.projections || []).map(p => {
    const ssp = p.scenario?.code;
    const months = p.monthly || [];
    const gsMonths = months.filter(m => GS_MONTHS.includes(m.month));
    const source = gsMonths.length > 0 ? gsMonths : months;
    const avgDelta = source.reduce((sum, m) => sum + Number(m.delta?.tmean || 0), 0) / (source.length || 1);
    const avgRainDelta = source.reduce((sum, m) => sum + Number(m.delta?.rain || 0), 0) / (source.length || 1);
    return { ssp, avgDelta, avgRainDelta };
  });

  return (
    <div className="map-popup-overlay" onClick={onClose}>
      <div className="czp-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="czp-header">
          <div>
            <div className="czp-header-top">
              <h3>{zone.name}</h3>
              {hasLiveData && (
                <span className="czp-live-badge">
                  <Radio size={10} />
                  Live
                </span>
              )}
            </div>
            {zone.region_name && <span className="czp-region">{zone.region_name}</span>}
          </div>
          <button className="popup-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="czp-body">
          {loading ? (
            <div className="czp-loading">
              <Loader size={20} className="spin" />
              Loading climate data...
            </div>
          ) : error ? (
            <div className="climate-error-card">
              <AlertCircle size={28} />
              <p>{error}</p>
              <button className="climate-error-retry" onClick={() => setRetryCount(c => c + 1)}>
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          ) : (
            <>
              {/* Baseline Season Stats — compact row */}
              {season && (
                <div className="czp-section">
                  <h4 className="czp-section-title">
                    Baseline
                    <span className="czp-badge">{baselineData.period}</span>
                  </h4>
                  <div className="czp-stat-row">
                    <div className="czp-stat-chip">
                      <Sun size={14} className="czp-chip-icon gdd" />
                      <div>
                        <span className="czp-chip-label">GDD</span>
                        <span className="czp-chip-value">{formatMetricValue(season.gdd_total, 'gdd')}</span>
                      </div>
                    </div>
                    <div className="czp-stat-chip">
                      <Droplets size={14} className="czp-chip-icon rain" />
                      <div>
                        <span className="czp-chip-label">Rain</span>
                        <span className="czp-chip-value">{formatMetricValue(season.rain_total, 'rain')}</span>
                      </div>
                    </div>
                    <div className="czp-stat-chip">
                      <Thermometer size={14} className="czp-chip-icon temp" />
                      <div>
                        <span className="czp-chip-label">Avg</span>
                        <span className="czp-chip-value">{formatMetricValue(season.tmean_avg, 'tmean')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Monthly Chart */}
              {gsMonthly && gsMonthly.length > 0 && (
                <div className="czp-section">
                  <h4 className="czp-section-title">Monthly (Oct–Apr)</h4>
                  <div className="czp-monthly-bars">
                    {gsMonthly.map(m => (
                      <MonthBar
                        key={m.month}
                        month={m}
                        onHover={handleTooltip}
                        onLeave={() => setTooltip(null)}
                      />
                    ))}
                  </div>
                  <div className="czp-month-legend">
                    <span><span className="czp-legend-range" /> Temp range</span>
                    <span><span className="czp-legend-mean" /> Mean</span>
                    <span><span className="czp-legend-rain" /> Rainfall</span>
                  </div>

                  {/* Tooltip */}
                  {tooltip && (
                    <div
                      className="czp-tooltip"
                      style={{ left: tooltip.x, top: tooltip.y }}
                    >
                      <strong>{tooltip.month.month_name}</strong>
                      <span>Mean: {Number(tooltip.month.tmean).toFixed(1)}°C</span>
                      <span>Range: {Number(tooltip.month.tmin).toFixed(1)}–{Number(tooltip.month.tmax).toFixed(1)}°C</span>
                      <span>Rain: {Number(tooltip.month.rain).toFixed(0)} mm</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mid-Century Projections */}
              {projSummary.length > 0 && (
                <div className="czp-section">
                  <h4 className="czp-section-title">2041–2060 Outlook</h4>
                  <div className="czp-proj-row">
                    {projSummary.map(({ ssp, avgDelta, avgRainDelta }) => {
                      const meta = SSP_LABELS[ssp] || { label: ssp, color: '#6b7280', desc: ssp };
                      return (
                        <div
                          key={ssp}
                          className="czp-proj-chip"
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const panel = e.currentTarget.closest('.czp-panel').getBoundingClientRect();
                            setProjTooltip({
                              ssp, meta, avgDelta, avgRainDelta,
                              x: rect.left - panel.left + rect.width / 2,
                              y: rect.top - panel.top - 4,
                            });
                          }}
                          onMouseLeave={() => setProjTooltip(null)}
                        >
                          <div className="czp-proj-dot" style={{ background: meta.color }} />
                          <span className="czp-proj-label">{meta.label}</span>
                          <span className="czp-proj-delta" style={{ color: meta.color }}>
                            +{avgDelta.toFixed(1)}°C
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {projTooltip && (
                    <div
                      className="czp-tooltip"
                      style={{ left: projTooltip.x, top: projTooltip.y }}
                    >
                      <strong style={{ color: projTooltip.meta.color }}>{projTooltip.meta.label}</strong>
                      <span>{projTooltip.meta.desc}</span>
                      <span>Temperature: +{projTooltip.avgDelta.toFixed(1)}°C</span>
                      <span>Rainfall: {projTooltip.avgRainDelta >= 0 ? '+' : ''}{projTooltip.avgRainDelta.toFixed(1)} mm/mo</span>
                    </div>
                  )}
                </div>
              )}

              {/* CTA */}
              <button className="czp-explore-btn" onClick={handleExplore}>
                Explore full climate data
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClimateZonePanel;
