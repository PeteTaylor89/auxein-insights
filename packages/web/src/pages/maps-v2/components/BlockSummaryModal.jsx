// maps-v2/components/BlockSummaryModal.jsx — One block, everything on it.
//
// Beta feedback (Greystone, Map section): tapping a task or observation icon used
// to either open a bare task list or navigate away to the general /observations
// page. Both lost the block context the user was pointing at. This modal answers
// "what is going on with THIS block" without leaving the map.
//
// Tasks and observations are passed in already-loaded — MapsPage holds both full
// arrays for the layers, so filtering by block_id here costs nothing and avoids a
// round trip. The block itself IS fetched, because the map feature's properties
// are a trimmed subset and don't carry notes, rows, clone or rootstock.
import { useEffect, useMemo, useState } from 'react';
import {
  X, ClipboardList, Binoculars, Grape, Ruler, Rows3, StickyNote,
  Loader2, Pencil, ChevronRight,
} from 'lucide-react';
import {
  blocksService, getTaskStatusMeta, getBlockStatusMeta, TASK_STATUS_FINISHED,
} from '@vineyard/shared';
import './BlockSummaryModal.css';

const TYPE_ICONS = {
  phenology: '🌱',
  disease: '🦠',
  pest: '🐛',
  general: '📋',
  weather: '🌤',
  soil: '🪨',
};

// getTaskStatusMeta/getBlockStatusMeta return tone names; theme.css ships
// .badge--neutral rather than .badge--muted, so translate rather than
// hardcoding status colours here (see the shared status utilities).
const toneClass = (tone) => `badge--${tone === 'muted' ? 'neutral' : tone}`;

function formatDate(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString('en-NZ', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return null; }
}

function Stat({ value, label }) {
  return (
    <div className="v2-bsm-stat">
      <div className="v2-bsm-stat-value">{value}</div>
      <div className="v2-bsm-stat-label">{label}</div>
    </div>
  );
}

function MetaRow({ icon, label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="v2-bsm-meta-row">
      <span className="v2-bsm-meta-icon">{icon}</span>
      <span className="v2-bsm-meta-label">{label}</span>
      <span className="v2-bsm-meta-value">{value}</span>
    </div>
  );
}

export default function BlockSummaryModal({
  open,
  blockId,
  blockName,
  tasks = [],
  observations = [],
  onClose,
  onOpenTask,
  onEditBlock,
}) {
  const [block, setBlock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !blockId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlock(null);

    (async () => {
      try {
        const b = await blocksService.getBlockById(blockId);
        if (!cancelled) setBlock(b);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || err.message || 'Failed to load block');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, blockId]);

  // block_id arrives as a string on map feature properties and a number from the
  // API, so compare loosely rather than by identity.
  const blockTasks = useMemo(
    () => (tasks || []).filter((t) => String(t.block_id) === String(blockId)),
    [tasks, blockId],
  );
  const blockObs = useMemo(
    () => (observations || [])
      .filter((o) => String(o.block_id) === String(blockId))
      .sort((a, b) => new Date(b.started_at || b.created_at || 0) - new Date(a.started_at || a.created_at || 0)),
    [observations, blockId],
  );

  const { activeTasks, finishedTasks } = useMemo(() => {
    const active = [];
    const finished = [];
    for (const t of blockTasks) {
      const key = String(t.status || '').toLowerCase().replace(/\s+/g, '_');
      (TASK_STATUS_FINISHED.includes(key) ? finished : active).push(t);
    }
    return { activeTasks: active, finishedTasks: finished };
  }, [blockTasks]);

  if (!open) return null;

  const name = block?.block_name || blockName || 'Block';
  const statusMeta = block?.status ? getBlockStatusMeta(block.status) : null;
  const rowRange = block?.row_start && block?.row_end
    ? `${block.row_start}–${block.row_end}${block.row_count ? ` (${block.row_count})` : ''}`
    : (block?.row_count ? String(block.row_count) : null);

  return (
    <div className="v2-bsm-backdrop" onClick={onClose}>
      <div className="v2-bsm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="v2-bsm-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="v2-bsm-body">
          <div className="v2-bsm-head">
            <div className="v2-bsm-eyebrow"><Grape size={12} /> Block summary</div>
            <h3 className="v2-bsm-title">{name}</h3>
            {statusMeta && (
              <span className={`badge ${toneClass(statusMeta.tone)}`}>{statusMeta.label}</span>
            )}
          </div>

          {error && <div className="v2-bsm-error">{error}</div>}

          <div className="v2-bsm-stats">
            <Stat value={activeTasks.length} label={activeTasks.length === 1 ? 'Open task' : 'Open tasks'} />
            <Stat value={blockObs.length} label={blockObs.length === 1 ? 'Observation' : 'Observations'} />
            <Stat
              value={block?.area != null ? Number(block.area).toFixed(2) : '—'}
              label="Hectares"
            />
          </div>

          {loading && (
            <div className="v2-bsm-loading"><Loader2 size={16} className="v2-spin" /> Loading block…</div>
          )}

          {block && (
            <div className="v2-bsm-meta">
              <MetaRow icon={<Grape size={14} />} label="Variety" value={block.variety} />
              <MetaRow icon={<Ruler size={14} />} label="Clone" value={block.clone} />
              <MetaRow icon={<Ruler size={14} />} label="Rootstock" value={block.rootstock} />
              <MetaRow icon={<Rows3 size={14} />} label="Rows" value={rowRange} />
            </div>
          )}

          {/* Tasks */}
          <div className="v2-bsm-section">
            <div className="v2-bsm-section-head">
              <ClipboardList size={14} />
              <span>Tasks</span>
              <span className="v2-bsm-section-count">{blockTasks.length}</span>
            </div>

            {blockTasks.length === 0 ? (
              <div className="v2-bsm-empty">No tasks on this block.</div>
            ) : (
              <ul className="v2-bsm-list">
                {[...activeTasks, ...finishedTasks].map((t) => {
                  const meta = getTaskStatusMeta(t.status);
                  return (
                    <li key={t.id}>
                      <button
                        className="v2-bsm-item"
                        onClick={() => onOpenTask?.(t.id)}
                      >
                        <div className="v2-bsm-item-main">
                          <div className="v2-bsm-item-title">{t.title || 'Untitled task'}</div>
                          <div className="v2-bsm-item-meta">
                            {t.task_category && <span>{t.task_category}</span>}
                            {t.due_date && <span>· Due {formatDate(t.due_date)}</span>}
                          </div>
                        </div>
                        <span className={`badge ${toneClass(meta.tone)}`}>{meta.label}</span>
                        <ChevronRight size={14} className="v2-bsm-item-chevron" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Observations */}
          <div className="v2-bsm-section">
            <div className="v2-bsm-section-head">
              <Binoculars size={14} />
              <span>Observations</span>
              <span className="v2-bsm-section-count">{blockObs.length}</span>
            </div>

            {blockObs.length === 0 ? (
              <div className="v2-bsm-empty">No observations on this block.</div>
            ) : (
              <ul className="v2-bsm-list">
                {blockObs.map((o) => (
                  <li key={o.id}>
                    <div className="v2-bsm-item v2-bsm-item--static">
                      <span className="v2-bsm-obs-icon" title={o.observation_type || 'general'}>
                        {TYPE_ICONS[o.observation_type] || TYPE_ICONS.general}
                      </span>
                      <div className="v2-bsm-item-main">
                        <div className="v2-bsm-item-title">
                          {o.plan_name || o.template_name || 'Observation'}
                        </div>
                        <div className="v2-bsm-item-meta">
                          {formatDate(o.started_at || o.created_at) || o.status || ''}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Notes */}
          {block?.notes && (
            <div className="v2-bsm-section">
              <div className="v2-bsm-section-head">
                <StickyNote size={14} />
                <span>Notes</span>
              </div>
              <p className="v2-bsm-notes">{block.notes}</p>
            </div>
          )}

          {onEditBlock && blockId && (
            <div className="v2-bsm-actions">
              <button
                className="v2-bsm-btn v2-bsm-btn--accent"
                onClick={() => { onClose?.(); onEditBlock(Number(blockId)); }}
              >
                <Pencil size={14} /> Edit block
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
