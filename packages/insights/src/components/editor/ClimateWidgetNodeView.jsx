// src/components/editor/ClimateWidgetNodeView.jsx - Editor preview for climate widget
import { NodeViewWrapper } from '@tiptap/react';
import { BarChart3, Table2, X, Lock, Map as MapIcon } from 'lucide-react';

const WIDGET_LABELS = {
  gdd_progress: 'GDD Progress',
  temperature_rainfall: 'Temperature & Rainfall',
  disease_pressure: 'Disease Pressure',
  season_comparison: 'Season Comparison',
  current_season_summary: 'Current Season Summary',
  recent_observations: 'Recent Observations',
  historical_trend: 'Historical Trend',
  region_trend_compare: 'Region Trend Comparison',
  region_trend_compare_interactive: 'Region Comparison (Interactive)',
  projection_outlook: 'Climate Projection',
  surface_map: 'Climate Surface Map',
};

function ClimateWidgetNodeView({ node, deleteNode }) {
  const {
    widgetType, zoneName, zoneNames, title, metric, displayMode, isStatic, snapshotData,
    variable, cadence, validAt, followLatest,
  } = node.attrs;
  // A surface map has no zone and no chart/table mode — it is a layer and a
  // step. Labelling it "No zone selected" in the editor reads as a widget the
  // author forgot to finish.
  const isSurface = widgetType === 'surface_map';
  const zoneLabel = isSurface
    ? [variable, cadence, followLatest ? 'latest step' : (validAt || 'latest step')]
      .filter(Boolean).join(' · ')
    : (zoneNames || zoneName || 'No zone selected');
  const isTable = !isSurface && displayMode === 'table';
  const Icon = isSurface ? MapIcon : (isTable ? Table2 : BarChart3);

  return (
    <NodeViewWrapper>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          background: isTable ? '#eff6ff' : '#f0fdf4',
          border: `2px dashed ${isTable ? '#93c5fd' : '#86efac'}`,
          borderRadius: '8px',
          margin: '8px 0',
          userSelect: 'none',
        }}
        contentEditable={false}
      >
        <Icon size={24} style={{ color: isTable ? '#2563eb' : '#16a34a', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: isTable ? '#1e40af' : '#166534' }}>
            {title || WIDGET_LABELS[widgetType] || 'Climate Widget'}
            <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: '6px', opacity: 0.7 }}>
              ({isSurface ? 'map' : isTable ? 'table' : 'chart'})
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {zoneLabel}{!isSurface && metric ? ` — ${metric}` : ''}
            {isStatic && (
              <span style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#92400e', fontWeight: 500 }}>
                <Lock size={10} /> {snapshotData ? 'snapshot taken' : 'will snapshot on save'}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={deleteNode}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#dc2626', padding: '4px', borderRadius: '4px',
          }}
          title="Remove widget"
        >
          <X size={16} />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export default ClimateWidgetNodeView;
