import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle } from 'lucide-react';
import { riskManagementService } from '@vineyard/shared';

const LEVEL_TONE = {
  low:      { bg: 'var(--color-success-bg)', fg: 'var(--color-success)' },
  medium:   { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)' },
  high:     { bg: 'var(--color-danger-bg)',  fg: 'var(--color-danger)'  },
  critical: { bg: 'var(--color-danger)',     fg: '#ffffff'              },
};

function currentLevel(risk) {
  return risk.residual_risk_level || risk.inherent_risk_level || 'medium';
}

export default function RiskHazardChips({
  blockIds = [],
  spatialAreaId = null,
  propertyId = null,
  label = 'Hazards on site',
  emptyText = null,
}) {
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(false);

  const blockKey = blockIds.join(',');
  const hasAnyFilter =
    blockIds.length > 0 || spatialAreaId != null || propertyId != null;

  useEffect(() => {
    if (!hasAnyFilter) {
      setRisks([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const fetches = [];
    if (blockIds.length > 0) {
      for (const bid of blockIds) {
        fetches.push(
          riskManagementService.getRisksByLocation({ blockId: bid, propertyId })
            .catch(() => []),
        );
      }
    } else if (propertyId != null || spatialAreaId != null) {
      fetches.push(
        riskManagementService.getRisksByLocation({ spatialAreaId, propertyId })
          .catch(() => []),
      );
    }

    Promise.all(fetches).then((results) => {
      if (cancelled) return;
      const merged = new Map();
      for (const list of results) {
        for (const r of list || []) merged.set(r.id, r);
      }
      const arr = [...merged.values()].sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[currentLevel(a)] ?? 9) - (order[currentLevel(b)] ?? 9);
      });
      setRisks(arr);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [blockKey, spatialAreaId, propertyId, hasAnyFilter]);

  if (!hasAnyFilter) return null;
  if (loading) {
    return (
      <div className="risk-hazard-chips" style={chipsWrapStyle}>
        <span style={labelStyle}>{label}</span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
          Loading…
        </span>
      </div>
    );
  }
  if (risks.length === 0) {
    if (!emptyText) return null;
    return (
      <div className="risk-hazard-chips" style={chipsWrapStyle}>
        <span style={labelStyle}>{label}</span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
          {emptyText}
        </span>
      </div>
    );
  }

  return (
    <div className="risk-hazard-chips" style={chipsWrapStyle}>
      <span style={labelStyle}>
        <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
        {label}
      </span>
      <div style={chipsRowStyle}>
        {risks.map((r) => {
          const lvl = currentLevel(r);
          const tone = LEVEL_TONE[lvl] || LEVEL_TONE.medium;
          return (
            <span
              key={r.id}
              title={`${r.risk_category} · ${lvl}`}
              style={{
                background: tone.bg,
                color: tone.fg,
                padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {r.risk_title}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const chipsWrapStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  margin: '8px 0',
};
const labelStyle = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
const chipsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

RiskHazardChips.propTypes = {
  blockIds: PropTypes.arrayOf(PropTypes.number),
  spatialAreaId: PropTypes.number,
  propertyId: PropTypes.number,
  label: PropTypes.string,
  emptyText: PropTypes.string,
};
