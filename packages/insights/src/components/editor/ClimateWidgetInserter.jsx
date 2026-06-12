// src/components/editor/ClimateWidgetInserter.jsx - Modal for inserting climate widgets
import { useState, useEffect } from 'react';
import { X, BarChart3 } from 'lucide-react';
import { getAllZones } from '../../services/realtimeClimateService';
import { getZoneSeasons } from '../../services/publicClimateService';

const WIDGET_TYPES = [
  { value: 'gdd_progress', label: 'GDD Progress', metrics: [], modes: ['chart', 'table'] },
  { value: 'temperature_rainfall', label: 'Temperature & Rainfall', metrics: ['tmean', 'tmax', 'tmin', 'rain'], modes: ['chart', 'table'] },
  { value: 'disease_pressure', label: 'Disease Pressure', metrics: [], modes: ['chart', 'table'] },
  { value: 'season_comparison', label: 'Season Comparison', metrics: ['gdd', 'tmean', 'rain'], modes: ['chart', 'table'] },
  { value: 'current_season_summary', label: 'Current Season Summary', metrics: [], modes: ['table'] },
  { value: 'recent_observations', label: 'Recent Observations', metrics: [], modes: ['table'] },
  { value: 'historical_trend', label: 'Historical Trend (single zone)', metrics: ['gdd', 'rain', 'tmean', 'tmax', 'frost_days', 'early_frost', 'hot_days30', 'r99p'], modes: ['chart'] },
  { value: 'region_trend_compare', label: 'Region Trend Comparison (fixed)', metrics: ['gdd', 'rain', 'tmean', 'tmax'], modes: ['chart'] },
  { value: 'region_trend_compare_interactive', label: 'Region Trend Comparison (reader picks)', metrics: ['gdd', 'rain', 'tmean', 'tmax'], modes: ['chart'] },
  { value: 'projection_outlook', label: 'Climate Projection (stat block)', metrics: [], modes: ['chart'] },
];

const METRIC_LABELS = {
  gdd: 'Growing Degree Days',
  tmean: 'Mean Temperature',
  tmax: 'Max Temperature',
  tmin: 'Min Temperature',
  rain: 'Rainfall',
  frost_days: 'Frost Days',
  early_frost: 'Spring Frost',
  hot_days30: 'Hot Days >30°C',
  r99p: 'Extreme Rain (R99p)',
};

const SEASON_LIMIT_OPTIONS = [
  { value: 10, label: 'Last 10 seasons' },
  { value: 20, label: 'Last 20 seasons' },
  { value: 37, label: 'All seasons' },
];

const SSP_OPTIONS = [
  { value: 'SSP126', label: 'SSP1-2.6 (Low emissions)' },
  { value: 'SSP245', label: 'SSP2-4.5 (Middle road)' },
  { value: 'SSP370', label: 'SSP3-7.0 (High emissions)' },
];

const PERIOD_OPTIONS = [
  { value: '2021_2040', label: 'Near-term (2021-2040)' },
  { value: '2041_2060', label: 'Mid-century (2041-2060)' },
  { value: '2080_2099', label: 'End of century (2080-2099)' },
];

function ClimateWidgetInserter({ editor, onClose }) {
  const [zones, setZones] = useState([]);
  const [widgetType, setWidgetType] = useState('gdd_progress');
  const [zoneSlug, setZoneSlug] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [selectedZones, setSelectedZones] = useState([]); // [{slug, name}] for multi-zone widgets
  const [metric, setMetric] = useState('');
  const [displayMode, setDisplayMode] = useState('chart');
  const [title, setTitle] = useState('');
  const [isStatic, setIsStatic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [selectedVintages, setSelectedVintages] = useState([]);
  const [includeBaseline, setIncludeBaseline] = useState(true);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [seasonLimit, setSeasonLimit] = useState(10);
  const [scenario, setScenario] = useState('SSP245');
  const [period, setPeriod] = useState('2041_2060');

  useEffect(() => {
    getAllZones().then((data) => {
      const list = data?.zones || data || [];
      setZones(list);
      if (list.length > 0) {
        setZoneSlug(list[0].slug);
        setZoneName(list[0].name);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const selectedType = WIDGET_TYPES.find((t) => t.value === widgetType);
  const availableMetrics = selectedType?.metrics || [];
  const availableModes = selectedType?.modes || ['chart'];
  const showSeasonPicker = widgetType === 'season_comparison';
  const isHistoricalTrend = widgetType === 'historical_trend';
  const isMultiZoneFixed = widgetType === 'region_trend_compare';
  const isMultiZoneInteractive = widgetType === 'region_trend_compare_interactive';
  const isMultiZone = isMultiZoneFixed || isMultiZoneInteractive;
  const isProjection = widgetType === 'projection_outlook';
  const showSeasonLimit = isHistoricalTrend || isMultiZone;
  const showBaselineToggle = isHistoricalTrend || isMultiZone;
  const showStaticToggle = !isMultiZoneInteractive; // interactive can't be static
  const showSingleZonePicker = !isMultiZone;
  const showMultiZonePicker = isMultiZone;

  // Load available seasons when zone or widget type changes (only if season_comparison)
  useEffect(() => {
    if (!showSeasonPicker || !zoneSlug) {
      setAvailableSeasons([]);
      return;
    }
    setSeasonsLoading(true);
    getZoneSeasons(zoneSlug, { limit: 100 })
      .then((data) => {
        const list = data?.seasons || [];
        setAvailableSeasons(list);
        // Default-select two most recent (matches previous hardcoded behavior)
        setSelectedVintages((prev) => {
          if (prev.length > 0) return prev.filter((v) => list.some((s) => s.vintage_year === v));
          return list.slice(0, 2).map((s) => s.vintage_year);
        });
      })
      .catch(() => setAvailableSeasons([]))
      .finally(() => setSeasonsLoading(false));
  }, [showSeasonPicker, zoneSlug]);

  const toggleVintage = (year) => {
    setSelectedVintages((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  };

  const handleWidgetTypeChange = (value) => {
    setWidgetType(value);
    setMetric('');
    const type = WIDGET_TYPES.find((t) => t.value === value);
    const modes = type?.modes || ['chart'];
    if (!modes.includes(displayMode)) {
      setDisplayMode(modes[0]);
    }
  };

  const handleZoneChange = (slug) => {
    setZoneSlug(slug);
    const zone = zones.find((z) => z.slug === slug);
    setZoneName(zone?.name || '');
  };

  const toggleZoneMulti = (zone) => {
    const max = isMultiZoneInteractive ? 2 : 5;
    setSelectedZones((prev) => {
      const exists = prev.find((z) => z.slug === zone.slug);
      if (exists) return prev.filter((z) => z.slug !== zone.slug);
      if (prev.length >= max) return prev;
      return [...prev, { slug: zone.slug, name: zone.name }];
    });
  };

  const canInsert = (() => {
    if (!editor) return false;
    if (isMultiZoneFixed) return selectedZones.length >= 2;
    if (isMultiZoneInteractive) return true; // 0-2 defaults allowed
    if (!zoneSlug) return false;
    if (showSeasonPicker && selectedVintages.length === 0) return false;
    return true;
  })();

  const handleInsert = () => {
    if (!canInsert) return;
    const sortedVintages = [...selectedVintages].sort((a, b) => b - a);
    const multiSlugs = selectedZones.map((z) => z.slug).join(',');
    const multiNames = selectedZones.map((z) => z.name).join(', ');
    editor.chain().focus().insertContent({
      type: 'climateWidget',
      attrs: {
        widgetType,
        zoneSlug: isMultiZone ? '' : zoneSlug,
        zoneName: isMultiZone ? '' : zoneName,
        zoneSlugs: isMultiZone ? multiSlugs : '',
        zoneNames: isMultiZone ? multiNames : '',
        metric: metric || (availableMetrics[0] || ''),
        displayMode,
        title,
        isStatic: showStaticToggle ? isStatic : false,
        vintages: showSeasonPicker ? sortedVintages.join(',') : '',
        includeBaseline: showSeasonPicker || showBaselineToggle ? includeBaseline : true,
        seasonLimit: showSeasonLimit ? seasonLimit : 10,
        scenario: isProjection ? scenario : '',
        period: isProjection ? period : '',
      },
    }).run();
    onClose();
  };

  const fieldStyle = { width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' };
  const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: '#374151' };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000,
    }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white', borderRadius: '12px', padding: '1.5rem', width: '100%',
        maxWidth: '460px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
            <BarChart3 size={20} style={{ color: '#16a34a' }} /> Insert Climate Widget
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Widget Type</label>
            <select value={widgetType} onChange={(e) => handleWidgetTypeChange(e.target.value)} style={fieldStyle}>
              {WIDGET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {showSingleZonePicker && (
            <div>
              <label style={labelStyle}>Zone</label>
              {loading ? (
                <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Loading zones...</p>
              ) : (
                <select value={zoneSlug} onChange={(e) => handleZoneChange(e.target.value)} style={fieldStyle}>
                  {zones.map((z) => (
                    <option key={z.slug} value={z.slug}>{z.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {showMultiZonePicker && (
            <div>
              <label style={labelStyle}>
                {isMultiZoneInteractive
                  ? 'Default regions (up to 2, optional — reader can change)'
                  : 'Regions to compare (2-5)'}
              </label>
              {loading ? (
                <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Loading zones...</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto', padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                  {zones.map((z) => {
                    const checked = selectedZones.some((s) => s.slug === z.slug);
                    const maxReached = !checked && selectedZones.length >= (isMultiZoneInteractive ? 2 : 5);
                    return (
                      <button
                        key={z.slug}
                        type="button"
                        onClick={() => toggleZoneMulti(z)}
                        disabled={maxReached}
                        style={{
                          padding: '0.3rem 0.6rem',
                          border: '1px solid',
                          borderColor: checked ? '#16a34a' : '#d1d5db',
                          background: checked ? '#f0fdf4' : 'white',
                          color: checked ? '#16a34a' : '#374151',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: checked ? 600 : 400,
                          cursor: maxReached ? 'not-allowed' : 'pointer',
                          opacity: maxReached ? 0.45 : 1,
                        }}
                      >
                        {z.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.3rem' }}>
                {selectedZones.length} selected
              </div>
            </div>
          )}

          {showSeasonLimit && (
            <div>
              <label style={labelStyle}>Time range</label>
              <select value={seasonLimit} onChange={(e) => setSeasonLimit(Number(e.target.value))} style={fieldStyle}>
                {SEASON_LIMIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {isProjection && (
            <>
              <div>
                <label style={labelStyle}>Scenario</label>
                <select value={scenario} onChange={(e) => setScenario(e.target.value)} style={fieldStyle}>
                  {SSP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Time period</label>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} style={fieldStyle}>
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {showBaselineToggle && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}>
              <input
                type="checkbox"
                checked={includeBaseline}
                onChange={(e) => setIncludeBaseline(e.target.checked)}
              />
              Include long-term baseline (1986-2005)
            </label>
          )}

          {availableMetrics.length > 0 && (
            <div>
              <label style={labelStyle}>Metric</label>
              <select
                value={metric || availableMetrics[0]}
                onChange={(e) => setMetric(e.target.value)}
                style={fieldStyle}
              >
                {availableMetrics.map((m) => (
                  <option key={m} value={m}>{METRIC_LABELS[m] || m}</option>
                ))}
              </select>
            </div>
          )}

          {showSeasonPicker && (
            <div>
              <label style={labelStyle}>Seasons to compare</label>
              {seasonsLoading ? (
                <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Loading seasons...</p>
              ) : availableSeasons.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No seasons available for this zone.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '140px', overflowY: 'auto', padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                  {availableSeasons.map((s) => {
                    const checked = selectedVintages.includes(s.vintage_year);
                    return (
                      <button
                        key={s.vintage_year}
                        type="button"
                        onClick={() => toggleVintage(s.vintage_year)}
                        style={{
                          padding: '0.3rem 0.6rem',
                          border: '1px solid',
                          borderColor: checked ? '#16a34a' : '#d1d5db',
                          background: checked ? '#f0fdf4' : 'white',
                          color: checked ? '#16a34a' : '#374151',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: checked ? 600 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        {s.label || s.vintage_year}
                      </button>
                    );
                  })}
                </div>
              )}
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#374151', marginTop: '0.5rem' }}
              >
                <input
                  type="checkbox"
                  checked={includeBaseline}
                  onChange={(e) => setIncludeBaseline(e.target.checked)}
                />
                Include long-term baseline
              </label>
            </div>
          )}

          {availableModes.length > 1 && (
            <div>
              <label style={labelStyle}>Display</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {availableModes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDisplayMode(mode)}
                    style={{
                      flex: 1, padding: '0.4rem 0.75rem', border: '1px solid',
                      borderColor: displayMode === mode ? '#16a34a' : '#d1d5db',
                      borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                      background: displayMode === mode ? '#f0fdf4' : 'white',
                      color: displayMode === mode ? '#16a34a' : '#6b7280',
                      fontWeight: displayMode === mode ? 600 : 400,
                      textTransform: 'capitalize',
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>Title <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Custom title..."
              style={fieldStyle}
            />
          </div>

          {showStaticToggle && (
            <div>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#374151' }}
                onClick={() => setIsStatic(!isStatic)}
              >
                <span style={{
                  width: '36px', height: '20px', borderRadius: '10px', position: 'relative',
                  background: isStatic ? '#16a34a' : '#d1d5db', transition: 'background 0.2s',
                  display: 'inline-block', flexShrink: 0,
                }}>
                  <span style={{
                    position: 'absolute', top: '2px', left: isStatic ? '18px' : '2px',
                    width: '16px', height: '16px', borderRadius: '50%', background: 'white',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </span>
                <span style={{ fontWeight: 500 }}>Static snapshot</span>
              </label>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '2px', marginLeft: '44px' }}>
                Freeze data on save — the widget won't update with live data
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.875rem', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!canInsert}
            style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: '#16a34a', color: 'white', fontSize: '0.875rem', cursor: 'pointer', opacity: canInsert ? 1 : 0.5 }}
          >
            Insert Widget
          </button>
        </div>
      </div>
    </div>
  );
}

export default ClimateWidgetInserter;
