// components/tasks/SubTaskPanel.jsx — a roll-up's children, shown as rows.
//
// The field workflow this serves: someone pruning row by row hits a broken wire,
// raises it as an issue task, and files it under "Wires — Block A". When the
// crew later opens that roll-up they should see the issues the same way they see
// rows on a pruning task — a list to work down and tick off.
//
// Children are TASKS, not task_rows. They're rendered in the rows idiom but are
// deliberately not materialised into the task_rows table: each child carries its
// own status, assignee, schedule and history, and copying them into rows would
// create a second source of truth for the same work. So this panel mirrors
// RowProgressPanel's shape without sharing its data model.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ListChecks, Loader2, CheckCircle2, ExternalLink, X, Plus, MapPin,
} from 'lucide-react';
import { tasksService, getTaskStatusMeta, TASK_STATUS_FINISHED } from '@vineyard/shared';
import { useToast } from '../ToastProvider';
import './SubTaskPanel.css';

const toneClass = (tone) => `badge--${tone === 'muted' ? 'neutral' : tone}`;

const isFinished = (status) =>
  TASK_STATUS_FINISHED.includes(String(status || '').toLowerCase().replace(/\s+/g, '_'));

export default function SubTaskPanel({ task, canEdit, onAddIssue }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!task?.id) return;
    try {
      setLoading(true);
      // Server-side filter. This used to pull limit:500 and filter client-side,
      // which meant every task detail view — roll-up or not — dragged the whole
      // task list across the wire to find, usually, nothing.
      const res = await tasksService.listTasks({ parent_task_id: task.id, limit: 200 });
      const items = Array.isArray(res) ? res : (res?.items ?? res?.tasks ?? []);
      setChildren(items);
    } catch (err) {
      console.error('Failed to load sub-tasks:', err);
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [task?.id]);

  useEffect(() => { load(); }, [load]);

  const completeChild = async (child) => {
    setBusyId(child.id);
    try {
      await tasksService.completeTask(child.id, {});
      await load();
      toast.success(`Completed "${child.title}"`, {
        onUndo: async () => {
          // completeTask stamps completed_at/by; writing the status back is the
          // closest reversal the API offers without a dedicated reopen endpoint.
          await tasksService.updateTask(child.id, { status: child.status });
          await load();
        },
      });
    } catch (err) {
      console.error('Failed to complete sub-task:', err);
      toast.error(err?.response?.data?.detail || 'Could not complete that task');
    } finally {
      setBusyId(null);
    }
  };

  const detachChild = async (child) => {
    setBusyId(child.id);
    try {
      await tasksService.updateTask(child.id, { parent_task_id: null });
      await load();
      toast.success(`Removed "${child.title}" from this roll-up`, {
        onUndo: async () => {
          await tasksService.updateTask(child.id, { parent_task_id: task.id });
          await load();
        },
      });
    } catch (err) {
      console.error('Failed to detach sub-task:', err);
      toast.error('Could not remove that task');
    } finally {
      setBusyId(null);
    }
  };

  // Nothing rolled up and no way to add — don't take up space on an ordinary task.
  if (!loading && children.length === 0 && !onAddIssue) return null;

  const done = children.filter(c => isFinished(c.status)).length;
  const pct = children.length > 0 ? Math.round((done / children.length) * 100) : 0;

  return (
    <div className="stp-panel">
      <div className="stp-head">
        <h3 className="stp-title"><ListChecks size={16} /> Rolled-up issues</h3>
        {children.length > 0 && (
          <span className="stp-progress-label">{done} of {children.length} done</span>
        )}
        {canEdit && onAddIssue && (
          <button className="stp-btn stp-btn--ghost" onClick={onAddIssue}>
            <Plus size={14} /> Add issue
          </button>
        )}
      </div>

      {children.length > 0 && (
        <div className="stp-progress">
          <div className="stp-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      )}

      {loading ? (
        <div className="stp-loading"><Loader2 size={16} className="stp-spin" /> Loading issues…</div>
      ) : children.length === 0 ? (
        <div className="stp-empty">
          Nothing rolled up under this task yet.
        </div>
      ) : (
        <ul className="stp-list">
          {children.map(c => {
            const meta = getTaskStatusMeta(c.status);
            const finished = isFinished(c.status);
            return (
              <li key={c.id} className={`stp-row ${finished ? 'stp-row--done' : ''}`}>
                <button
                  className="stp-check"
                  onClick={() => !finished && completeChild(c)}
                  disabled={finished || busyId === c.id || !canEdit}
                  title={finished ? 'Already complete' : 'Mark complete'}
                >
                  {busyId === c.id
                    ? <Loader2 size={16} className="stp-spin" />
                    : <CheckCircle2 size={16} />}
                </button>

                <div className="stp-row-main" onClick={() => navigate(`/tasks/${c.id}`)}>
                  <div className="stp-row-title">{c.title || `Task #${c.id}`}</div>
                  <div className="stp-row-meta">
                    {c.block_name && <span><MapPin size={11} /> {c.block_name}</span>}
                    {c.task_number && <span>{c.task_number}</span>}
                  </div>
                </div>

                <span className={`badge ${toneClass(meta.tone)}`}>{meta.label}</span>

                <div className="stp-row-actions">
                  <button
                    className="stp-icon-btn"
                    onClick={() => navigate(`/tasks/${c.id}`)}
                    title="Open task"
                  >
                    <ExternalLink size={14} />
                  </button>
                  {canEdit && (
                    <button
                      className="stp-icon-btn"
                      onClick={() => detachChild(c)}
                      disabled={busyId === c.id}
                      title="Remove from this roll-up"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
