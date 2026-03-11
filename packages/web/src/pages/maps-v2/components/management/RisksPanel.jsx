// maps-v2/components/management/RisksPanel.jsx — Risk layer toggle + legend
import { useState } from 'react';
import { TriangleAlert, Loader2, Eye, EyeOff } from 'lucide-react';
import { RISK_COLORS } from '../../utils/layerColors';

const LEVELS = [
  { key: 'low', label: 'Low', color: RISK_COLORS.low },
  { key: 'medium', label: 'Medium', color: RISK_COLORS.medium },
  { key: 'high', label: 'High', color: RISK_COLORS.high },
  { key: 'critical', label: 'Critical', color: RISK_COLORS.critical },
];

export default function RisksPanel({ riskCount, loading, error, visible, onToggle }) {
  return (
    <div className="v2-panel">
      <div className="v2-panel-header">
        <h3 className="v2-panel-title">
          <TriangleAlert size={16} />
          Risks
          <span className="v2-panel-count">{riskCount}</span>
          <button
            className="v2-layer-toggle-btn"
            onClick={onToggle}
            title={visible ? 'Hide risks' : 'Show risks'}
          >
            {visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </h3>
      </div>

      {loading && (
        <div className="v2-panel-loading">
          <Loader2 size={16} className="v2-spin" />
          Loading risks...
        </div>
      )}

      {error && <div className="v2-panel-error">{error}</div>}

      {visible && !loading && (
        <div className="v2-risk-legend">
          {LEVELS.map((l) => (
            <div key={l.key} className="v2-legend-item">
              <span className="v2-legend-dot" style={{ background: l.color }} />
              <span className="v2-legend-label">{l.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
