// src/components/editor/ClimateWidgetInserter.jsx - Modal for inserting climate widgets
import { useState, useEffect } from 'react';
import { X, BarChart3 } from 'lucide-react';
import { getAllZones } from '../../services/realtimeClimateService';

const WIDGET_TYPES = [
  { value: 'gdd_progress', label: 'GDD Progress', metrics: [], modes: ['chart', 'table'] },
  { value: 'temperature_rainfall', label: 'Temperature & Rainfall', metrics: ['tmean', 'tmax', 'tmin', 'rain'], modes: ['chart', 'table'] },
  { value: 'disease_pressure', label: 'Disease Pressure', metrics: [], modes: ['chart', 'table'] },
  { value: 'season_comparison', label: 'Season Comparison', metrics: ['gdd', 'tmean', 'rain'], modes: ['chart', 'table'] },
  { value: 'current_season_summary', label: 'Current Season Summary', metrics: [], modes: ['table'] },
  { value: 'recent_observations', label: 'Recent Observations', metrics: [], modes: ['table'] },
];

const METRIC_LABELS = {
  gdd: 'Growing Degree Days',
  tmean: 'Mean Temperature',
  tmax: 'Max Temperature',
  tmin: 'Min Temperature',
  rain: 'Rainfall',
};

function ClimateWidgetInserter({ editor, onClose }) {
  const [zones, setZones] = useState([]);
  const [widgetType, setWidgetType] = useState('gdd_progress');
  const [zoneSlug, setZoneSlug] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [metric, setMetric] = useState('');
  const [displayMode, setDisplayMode] = useState('chart');
  const [title, setTitle] = useState('');
  const [isStatic, setIsStatic] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const handleInsert = () => {
    if (!editor || !zoneSlug) return;
    editor.chain().focus().insertContent({
      type: 'climateWidget',
      attrs: {
        widgetType,
        zoneSlug,
        zoneName,
        metric: metric || (availableMetrics[0] || ''),
        displayMode,
        title,
        isStatic,
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
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', fontSize: '0.875rem', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleInsert} disabled={!zoneSlug}
            style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: '#16a34a', color: 'white', fontSize: '0.875rem', cursor: 'pointer', opacity: zoneSlug ? 1 : 0.5 }}
          >
            Insert Widget
          </button>
        </div>
      </div>
    </div>
  );
}

export default ClimateWidgetInserter;
