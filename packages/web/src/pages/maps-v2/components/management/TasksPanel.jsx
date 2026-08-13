// maps-v2/components/management/TasksPanel.jsx — Task markers grouped by block.
// The per-task GPS track viewer was removed when GPS tracking was mothballed;
// useTasksLayer still exposes showTrack/hideTrack for whenever it comes back.
import { useState, useMemo } from 'react';
import { ClipboardList, Loader2, Eye, EyeOff } from 'lucide-react';

const STATUS_ICONS = {
  completed: '✓',
  in_progress: '▶',
  paused: '⏸',
  scheduled: '📅',
  ready: '●',
  draft: '○',
  cancelled: '✕',
};

const STATUS_COLORS = {
  completed: 'var(--color-success)',
  in_progress: 'var(--color-accent)',
  paused: 'var(--color-warning)',
  scheduled: 'var(--color-info)',
  ready: 'var(--color-primary)',
  draft: 'var(--color-text-muted)',
  cancelled: 'var(--color-danger)',
};

export default function TasksPanel({
  tasks,
  taskCount,
  loading,
  error,
  visible,
  onToggle,
  selectedBlockId,
  contentOnly,
  blocksData,
}) {
  const [expandedBlock, setExpandedBlock] = useState(selectedBlockId || null);

  // Build block name lookup from blocksData GeoJSON
  const blockNameLookup = useMemo(() => {
    const lookup = {};
    (blocksData?.features || []).forEach((f) => {
      const p = f.properties || {};
      if (p.id) lookup[p.id] = p.block_name || 'Unnamed';
    });
    return lookup;
  }, [blocksData]);

  // Group tasks by block
  const tasksByBlock = useMemo(() => {
    const groups = {};
    (tasks || []).forEach((t) => {
      const bid = t.block_id;
      if (!bid) return;
      if (!groups[bid]) groups[bid] = { blockName: blockNameLookup[bid] || t.block?.block_name || t.block_name || `Block ${bid}`, tasks: [] };
      groups[bid].tasks.push(t);
    });
    Object.values(groups).forEach((g) => {
      g.tasks.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    });
    return groups;
  }, [tasks, blockNameLookup]);

  const blockIds = Object.keys(tasksByBlock);

  const content = (
    <>
      {loading && (
        <div className="v2-panel-loading">
          <Loader2 size={16} className="v2-spin" />
          Loading tasks...
        </div>
      )}

      {error && <div className="v2-panel-error">{error}</div>}

      {visible && !loading && (
        <ul className="v2-block-list">
          {blockIds.map((bid) => {
            const group = tasksByBlock[bid];
            const isExpanded = expandedBlock === bid;
            return (
              <li key={bid}>
                <div
                  className="v2-block-item"
                  onClick={() => setExpandedBlock(isExpanded ? null : bid)}
                >
                  <div className="v2-block-name">{group.blockName}</div>
                  <div className="v2-block-meta">
                    <span>{group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                {isExpanded && (
                  <ul className="v2-task-list">
                    {group.tasks.map((task) => (
                      <li key={task.id} className="v2-task-item">
                        <span
                          className="v2-task-status"
                          style={{ color: STATUS_COLORS[task.status] || 'var(--color-text-muted)' }}
                          title={task.status}
                        >
                          {STATUS_ICONS[task.status] || '●'}
                        </span>
                        <div className="v2-task-info">
                          <span className="v2-task-title">{task.title || 'Untitled task'}</span>
                          {task.task_category && (
                            <span className="v2-task-category">{task.task_category}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {!loading && blockIds.length === 0 && (
            <li className="v2-block-empty">No tasks with assigned blocks</li>
          )}
        </ul>
      )}
    </>
  );

  if (contentOnly) return content;

  return (
    <div className="v2-panel">
      <div className="v2-panel-header">
        <h3 className="v2-panel-title">
          <ClipboardList size={16} /> Tasks <span className="v2-panel-count">{taskCount}</span>
          <button className="v2-layer-toggle-btn" onClick={onToggle} title={visible ? 'Hide tasks' : 'Show tasks'}>
            {visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </h3>
      </div>
      {content}
    </div>
  );
}
