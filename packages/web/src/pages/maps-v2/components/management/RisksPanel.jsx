// maps-v2/components/management/RisksPanel.jsx — Risk layer toggle + legend
import { Loader2 } from 'lucide-react';
import { RISK_COLORS } from '../../utils/layerColors';

const LEVELS = [
  { key: 'low', label: 'Low', color: RISK_COLORS.low },
  { key: 'medium', label: 'Medium', color: RISK_COLORS.medium },
  { key: 'high', label: 'High', color: RISK_COLORS.high },
  { key: 'critical', label: 'Critical', color: RISK_COLORS.critical },
];

export default function RisksPanel({ riskCount, loading, error, visible, onToggle, contentOnly }) {
  const content = (
    <>
      {loading && <div className="v2-panel-loading"><Loader2 size={16} className="v2-spin" /> Loading risks...</div>}
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
    </>
  );

  if (contentOnly) return content;

  // Full panel mode (not used in new sidebar, kept for backwards compat)
  return <div className="v2-panel">{content}</div>;
}
