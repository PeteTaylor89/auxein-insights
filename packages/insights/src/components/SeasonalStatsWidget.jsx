// components/SeasonalStatsWidget.jsx — "Get My Seasonal Stats" widget
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Thermometer, Droplets, Snowflake, Sun, Copy, Check,
  ExternalLink, Lock, ChevronRight, X, Info, Code, HelpCircle
} from 'lucide-react';
import { getZonesWithData } from '../services/realtimeClimateService';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import Logo from '../assets/App_Logo_September 20251.jpg';
import './SeasonalStatsWidget.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const ALL_VARIABLES = [
  { key: 'gdd10', label: 'GDD (base 10)', unit: '°C·d', icon: <Thermometer size={13} /> },
  { key: 'gdd0', label: 'GDD (base 0)', unit: '°C·d', icon: <Thermometer size={13} /> },
  { key: 'avg_temp', label: 'Avg Temp', unit: '°C', icon: <Thermometer size={13} /> },
  { key: 'avg_diurnal', label: 'Avg Diurnal Range', unit: '°C', icon: <Sun size={13} /> },
  { key: 'total_rainfall', label: 'Total Rainfall', unit: 'mm', icon: <Droplets size={13} /> },
  { key: 'avg_min_temp', label: 'Avg Min Temp', unit: '°C', icon: <Snowflake size={13} /> },
  { key: 'avg_max_temp', label: 'Avg Max Temp', unit: '°C', icon: <Sun size={13} /> },
  { key: 'frost_days', label: 'Frost Days', unit: 'days', icon: <Snowflake size={13} /> },
  { key: 'hot_days', label: 'Hot Days (>30°C)', unit: 'days', icon: <Sun size={13} /> },
];

const DEFAULT_SELECTED = ['gdd10', 'avg_temp', 'total_rainfall', 'frost_days', 'avg_diurnal'];

function SeasonalStatsWidget({ onAuthRequired }) {
  const { isAuthenticated } = usePublicAuth();

  // Panel open/close
  const [isOpen, setIsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Form
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState('');
  const [variety, setVariety] = useState('');
  const [harvestDate, setHarvestDate] = useState('');

  // Variable selection
  const [selectedVars, setSelectedVars] = useState(DEFAULT_SELECTED);

  // Results
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Load zones when opened + authenticated
  useEffect(() => {
    if (!isOpen || !isAuthenticated) {
      setZonesLoading(false);
      return;
    }
    const load = async () => {
      try {
        setZonesLoading(true);
        const data = await getZonesWithData();
        setZones(data.zones || []);
      } catch { setZones([]); }
      finally { setZonesLoading(false); }
    };
    load();
  }, [isOpen, isAuthenticated]);

  const toggleVar = (key) => {
    setSelectedVars(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleOpen = () => {
    if (!isAuthenticated) {
      onAuthRequired?.();
      return;
    }
    setIsOpen(true);
  };

  const handleSubmit = useCallback(async () => {
    if (!selectedZone || !harvestDate) return;
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('public_access_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/public/seasonal-stats/calculate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          zone_slug: selectedZone,
          variety: variety || null,
          harvest_date: harvestDate,
          selected_variables: selectedVars,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }

      setResult(await res.json());
    } catch (err) {
      setError(err.message || 'Could not fetch data');
    } finally {
      setLoading(false);
    }
  }, [selectedZone, variety, harvestDate, selectedVars]);

  const embedUrl = result
    ? `${window.location.origin}/widget/seasonal?zone=${result.zone_slug}${variety ? `&variety=${encodeURIComponent(variety)}` : ''}&harvest=${result.harvest_date}&vars=${selectedVars.join(',')}`
    : '';

  const embedCode = result
    ? `<iframe src="${embedUrl}" width="400" height="360" frameborder="0" style="border-radius:12px;border:1px solid #e5e7eb;" title="Seasonal Stats — ${result.zone_name}"></iframe>`
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatValue = (key, val) => {
    if (val === null || val === undefined) return 'N/A';
    const varDef = ALL_VARIABLES.find(v => v.key === key);
    if (key === 'gdd10' || key === 'gdd0') return `${Math.round(val)} ${varDef?.unit || ''}`;
    if (key === 'frost_days' || key === 'hot_days') return `${val}`;
    return `${val}${varDef?.unit || ''}`;
  };

  // CTA button (collapsed state)
  if (!isOpen) {
    return (
      <section className="seasonal-widget-section">
        <button className="seasonal-cta-card" onClick={handleOpen}>
          <div className="seasonal-cta-icon">
            <BarChart3 size={32} />
          </div>
          <div className="seasonal-cta-text">
            <h3>Get My Seasonal Stats</h3>
            <p>Generate a personalised climate summary for your zone and harvest date{!isAuthenticated ? ' — sign in to get started' : ''}</p>
          </div>
          <ChevronRight size={24} className="seasonal-cta-chevron" />
        </button>
      </section>
    );
  }

  // Expanded widget
  return (
    <section className="seasonal-widget-section">
      <div className="seasonal-widget">
        <div className="widget-toolbar">
          <h3>Get My Seasonal Stats</h3>
          <div className="widget-toolbar-actions">
            <button className="widget-about-btn" onClick={() => setAboutOpen(true)}>
              <HelpCircle size={14} />
              About
            </button>
            <button className="widget-close-btn" onClick={() => setIsOpen(false)} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="widget-body">
          <div className="widget-form-side">
            <div className="widget-form">
              <label className="widget-field">
                <span>Climate Zone</span>
                <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)} disabled={zonesLoading}>
                  <option value="">{zonesLoading ? 'Loading...' : 'Select zone'}</option>
                  {zones.map(z => <option key={z.slug} value={z.slug}>{z.name}</option>)}
                </select>
              </label>

              <label className="widget-field">
                <span>Variety <small>(optional)</small></span>
                <input
                  type="text"
                  placeholder="e.g. Sauvignon Blanc, Pinot Noir"
                  value={variety}
                  onChange={(e) => setVariety(e.target.value)}
                />
              </label>

              <label className="widget-field">
                <span>Harvest Date</span>
                <input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} />
              </label>

              <div className="widget-field">
                <span>Display Variables <small>(select in the order you want displayed)</small></span>
                <div className="var-selector">
                  {ALL_VARIABLES.map(v => (
                    <button
                      key={v.key}
                      className={`var-chip ${selectedVars.includes(v.key) ? 'selected' : ''}`}
                      onClick={() => toggleVar(v.key)}
                      type="button"
                    >
                      {v.icon}
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <button className="widget-submit" onClick={handleSubmit} disabled={!selectedZone || !harvestDate || loading}>
                {loading ? 'Calculating...' : 'Get Stats'}
              </button>
            </div>
          </div>

          <div className="widget-result-side">
            {!result && !error && !loading && (
              <div className="widget-placeholder">
                <BarChart3 size={32} />
                <span>Your seasonal summary will appear here</span>
              </div>
            )}

            {error && <div className="widget-error">{error}</div>}

            {result && (
              <>
                <div className="widget-result-card">
                  <div className="result-header">
                    <h4>{result.zone_name}</h4>
                    <span className="result-vintage">{result.vintage_year} Vintage</span>
                  </div>
                  {variety && <div className="result-variety">{variety}</div>}
                  <div className="result-period">
                    {result.season_start} to {result.harvest_date} ({result.day_count} days)
                  </div>

                  <div className="result-stats">
                    {selectedVars.map(key => {
                      const varDef = ALL_VARIABLES.find(v => v.key === key);
                      if (!varDef) return null;
                      return (
                        <div key={key} className="result-stat">
                          {varDef.icon}
                          <span className="stat-label">{varDef.label}</span>
                          <span className="stat-value">{formatValue(key, result.metrics[key])}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="result-powered">
                    <img src={Logo} alt="Auxein" className="powered-logo" />
                    <span>Powered by <a href="https://insights.auxein.co.nz" target="_blank" rel="noopener noreferrer">Auxein Insights</a></span>
                  </div>
                </div>

                <div className="widget-embed-section">
                  <button className="embed-toggle" onClick={handleCopy} title="Copy embed code">
                    {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Embed</>}
                  </button>
                  <a href={embedUrl} target="_blank" rel="noopener noreferrer" className="embed-preview-link">
                    <ExternalLink size={12} /> Preview
                  </a>
                </div>

                <div className="widget-cta">
                  <p>Help improve regional intelligence for all growers.</p>
                  <a href="https://auxein.co.nz/contact" target="_blank" rel="noopener noreferrer" className="cta-link">
                    Connect a Harvest weather station or contribute data
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* About Modal */}
      {aboutOpen && (
        <div className="widget-about-overlay" onClick={() => setAboutOpen(false)}>
          <div className="widget-about-modal" onClick={(e) => e.stopPropagation()}>
            <div className="widget-about-header">
              <h2>About Seasonal Stats</h2>
              <button className="widget-about-close" onClick={() => setAboutOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="widget-about-content">
              <section className="about-block">
                <Info size={20} />
                <div>
                  <h4>How it works</h4>
                  <p>
                    Select your climate zone, enter your grape variety, and set your harvest date.
                    The tool calculates key climate metrics from the start of the growing season
                    (1 October) through to your harvest date using daily weather station data.
                  </p>
                </div>
              </section>

              <section className="about-block">
                <Thermometer size={20} />
                <div>
                  <h4>Available metrics</h4>
                  <ul>
                    <li><strong>GDD (base 10 &amp; base 0)</strong> - Growing Degree Days accumulated over the season</li>
                    <li><strong>Average Temperature</strong> - Mean daily temperature for the period</li>
                    <li><strong>Average Diurnal Range</strong> - Mean difference between daily max and min temperatures</li>
                    <li><strong>Total Rainfall</strong> - Cumulative rainfall in millimetres</li>
                    <li><strong>Avg Min / Max Temperature</strong> - Mean of daily minimums and maximums</li>
                    <li><strong>Frost Days</strong> - Days where the minimum temperature dropped to 0°C or below</li>
                    <li><strong>Hot Days</strong> - Days where the maximum temperature exceeded 30°C</li>
                  </ul>
                  <p>Toggle the chips to choose which metrics appear on your card, in the order you select them.</p>
                </div>
              </section>

              <section className="about-block">
                <Code size={20} />
                <div>
                  <h4>Embedding on your site</h4>
                  <p>
                    After generating your stats card, click the <strong>Embed</strong> button to copy
                    an iframe snippet. Paste this into any HTML page, blog post, or CMS to display
                    your live seasonal summary. The embedded widget loads directly from Auxein Insights
                    and does not require visitors to sign in.
                  </p>
                  <p>
                    The widget is 400px wide by default. You can adjust the <code>width</code> and
                    <code>height</code> attributes in the iframe code to fit your layout.
                  </p>
                </div>
              </section>

              <section className="about-block">
                <HelpCircle size={20} />
                <div>
                  <h4>Contributing data</h4>
                  <p>
                    Seasonal stats are calculated from our regional weather station network.
                    If you operate a Harvest or other weather station in a wine region, you can
                    connect it to improve coverage and accuracy for all growers.
                    <a href="https://auxein.co.nz/contact" target="_blank" rel="noopener noreferrer"> <strong>Get in touch</strong></a>.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default SeasonalStatsWidget;
