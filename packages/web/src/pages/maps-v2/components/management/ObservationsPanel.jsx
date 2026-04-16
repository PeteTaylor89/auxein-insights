// maps-v2/components/management/ObservationsPanel.jsx — Observation markers + list by block
import { useState, useMemo } from 'react';
import { Eye as EyeIcon, EyeOff, Loader2, Binoculars } from 'lucide-react';

const TYPE_ICONS = {
  phenology: '🌱',
  disease: '🦠',
  pest: '🐛',
  general: '📋',
  weather: '🌤',
  soil: '🪨',
};

export default function ObservationsPanel({
  observations,
  obsCount,
  loading,
  error,
  visible,
  onToggle,
  contentOnly,
}) {
  const [expandedBlock, setExpandedBlock] = useState(null);

  // Group observations by block
  const obsByBlock = useMemo(() => {
    const groups = {};
    (observations || []).forEach((o) => {
      const bid = o.block_id;
      if (!bid) return;
      if (!groups[bid]) groups[bid] = { blockName: o.block_name || `Block ${bid}`, obs: [] };
      groups[bid].obs.push(o);
    });
    // Sort within each block by date descending
    Object.values(groups).forEach((g) => {
      g.obs.sort((a, b) => new Date(b.started_at || b.created_at || 0) - new Date(a.started_at || a.created_at || 0));
    });
    return groups;
  }, [observations]);

  const blockIds = Object.keys(obsByBlock);

  const content = (
    <>
      {loading && <div className="v2-panel-loading"><Loader2 size={16} className="v2-spin" /> Loading observations...</div>}
      {error && <div className="v2-panel-error">{error}</div>}
      {visible && !loading && (
        <ul className="v2-block-list">
          {blockIds.map((bid) => {
            const group = obsByBlock[bid];
            const isExpanded = expandedBlock === bid;
            return (
              <li key={bid}>
                <div className="v2-block-item" onClick={() => setExpandedBlock(isExpanded ? null : bid)}>
                  <div className="v2-block-name">{group.blockName}</div>
                  <div className="v2-block-meta"><span>{group.obs.length} obs</span></div>
                </div>
                {isExpanded && (
                  <ul className="v2-task-list">
                    {group.obs.map((o) => (
                      <li key={o.id} className="v2-task-item">
                        <span className="v2-task-status" title={o.observation_type || 'general'}>{TYPE_ICONS[o.observation_type] || TYPE_ICONS.general}</span>
                        <div className="v2-task-info">
                          <span className="v2-task-title">{o.plan_name || o.template_name || 'Observation'}</span>
                          <span className="v2-task-category">{o.started_at ? new Date(o.started_at).toLocaleDateString() : o.status || ''}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {!loading && blockIds.length === 0 && <li className="v2-block-empty">No observations found</li>}
        </ul>
      )}
    </>
  );

  if (contentOnly) return content;

  return (
    <div className="v2-panel">
      <div className="v2-panel-header">
        <h3 className="v2-panel-title">
          <Binoculars size={16} /> Observations <span className="v2-panel-count">{obsCount}</span>
          <button className="v2-layer-toggle-btn" onClick={onToggle} title={visible ? 'Hide observations' : 'Show observations'}>
            {visible ? <EyeIcon size={14} /> : <EyeOff size={14} />}
          </button>
        </h3>
      </div>
      {content}
    </div>
  );
}
