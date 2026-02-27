// src/components/editor/ClimateWidgetNodeView.jsx - Editor preview for climate widget
import { NodeViewWrapper } from '@tiptap/react';
import { BarChart3, Table2, X, Lock } from 'lucide-react';

const WIDGET_LABELS = {
  gdd_progress: 'GDD Progress',
  temperature_rainfall: 'Temperature & Rainfall',
  disease_pressure: 'Disease Pressure',
  season_comparison: 'Season Comparison',
  current_season_summary: 'Current Season Summary',
  recent_observations: 'Recent Observations',
};

function ClimateWidgetNodeView({ node, deleteNode }) {
  const { widgetType, zoneName, title, metric, displayMode, isStatic, snapshotData } = node.attrs;
  const isTable = displayMode === 'table';
  const Icon = isTable ? Table2 : BarChart3;

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
              ({isTable ? 'table' : 'chart'})
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {zoneName || 'No zone selected'}{metric ? ` — ${metric}` : ''}
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
