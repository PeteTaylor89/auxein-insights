// pages/TaskDetail.jsx — Task detail view with row progress, equipment check, consumable completion
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Clock, Play, CheckCircle, AlertTriangle, Package } from 'lucide-react';
import { tasksService } from '@vineyard/shared';
import { useAuth } from '@vineyard/shared';
import RowProgressPanel from '../components/tasks/RowProgressPanel';
import '../pages/vineyard-pages.css';

function TaskDetail() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { userTypeRole } = useAuth();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Action modals
  const [showStartCheck, setShowStartCheck] = useState(false);
  const [equipmentChecks, setEquipmentChecks] = useState([]);
  const [showComplete, setShowComplete] = useState(false);
  const [consumables, setConsumables] = useState([]);
  const [consumableActuals, setConsumableActuals] = useState({});
  const [completionNotes, setCompletionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  const canEdit = userTypeRole === 'company_admin' || userTypeRole === 'company_manager' || userTypeRole === 'auxein_admin';

  const loadTask = useCallback(async () => {
    if (!taskId) return;
    try {
      const data = await tasksService.getTask(taskId);
      setTask(data);
    } catch (err) {
      console.error('Failed to load task', err);
      setError('Task not found or access denied');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { loadTask(); }, [loadTask]);

  // ── Start Task Flow (P1) ──────────────────────────────────────────
  const handleStartClick = async () => {
    setActionError(null);
    try {
      const data = await tasksService.getEquipmentCheck(taskId);
      const checks = data.equipment_checks || [];
      if (checks.some(c => c.requires_calibration || c.is_required)) {
        setEquipmentChecks(checks);
        setShowStartCheck(true);
      } else {
        // No equipment to check — start directly
        await doStart(false);
      }
    } catch (err) {
      // Equipment check endpoint failed — try starting anyway
      await doStart(false);
    }
  };

  const doStart = async (skipCheck) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await tasksService.startTask(taskId, {
        start_gps_tracking: false,
        skip_equipment_check: skipCheck,
      });
      setShowStartCheck(false);
      await loadTask();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'object' && detail.overdue_assets) {
        setActionError(`Calibration overdue for: ${detail.overdue_assets.join(', ')}`);
      } else {
        setActionError(typeof detail === 'string' ? detail : 'Failed to start task');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ── Complete Task Flow (P0) ───────────────────────────────────────
  const handleCompleteClick = async () => {
    setActionError(null);
    try {
      const data = await tasksService.getConsumables(taskId);
      const items = data.consumables || [];
      setConsumables(items);
      // Pre-fill actuals from planned quantities
      const actuals = {};
      for (const c of items) {
        actuals[c.task_asset_id] = {
          actual_quantity: c.actual_quantity ?? c.planned_quantity ?? 0,
          batch_number: c.batch_number || '',
        };
      }
      setConsumableActuals(actuals);
      setCompletionNotes('');
      setShowComplete(true);
    } catch {
      // No consumables endpoint — just show basic completion
      setConsumables([]);
      setConsumableActuals({});
      setCompletionNotes('');
      setShowComplete(true);
    }
  };

  const doComplete = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const payload = {
        completion_notes: completionNotes || null,
      };
      // Only send consumable_actuals if there are consumables
      if (consumables.length > 0) {
        payload.consumable_actuals = consumables.map(c => ({
          task_asset_id: c.task_asset_id,
          actual_quantity: parseFloat(consumableActuals[c.task_asset_id]?.actual_quantity) || 0,
          batch_number: consumableActuals[c.task_asset_id]?.batch_number || null,
        }));
      }
      await tasksService.completeTask(taskId, payload);
      setShowComplete(false);
      await loadTask();
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to complete task');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="page-container"><p>Loading task...</p></div>;
  if (error) return <div className="page-container"><p className="od-error">{error}</p></div>;
  if (!task) return <div className="page-container"><p>Task not found.</p></div>;

  const fmtDate = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('en-NZ', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return '-'; }
  };

  const taskStatus = String(task.status || '').toLowerCase().replace(/\s+/g, '_');
  const canStart = ['draft', 'scheduled', 'ready'].includes(taskStatus);
  const canComplete = ['in_progress', 'paused'].includes(taskStatus);
  const isFinished = ['completed', 'cancelled'].includes(taskStatus);

  const statusBadge = (s) => {
    const k = String(s || '').toLowerCase().replace(/\s+/g, '_');
    const map = {
      draft: { bg: 'var(--color-surface-warm)', fg: 'var(--color-text-muted)' },
      scheduled: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)' },
      ready: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)' },
      in_progress: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)' },
      paused: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)' },
      completed: { bg: 'var(--color-success-bg)', fg: 'var(--color-success)' },
      cancelled: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)' },
    };
    const m = map[k] || { bg: 'var(--color-olive-light)', fg: 'var(--color-primary)' };
    return (
      <span style={{ background: m.bg, color: m.fg, padding: '2px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
        {(s || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </span>
    );
  };

  return (
    <div className="page-container">
      <div className="vp-page">
        {/* Back + title + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
          <button className="btn-ghost" onClick={() => navigate(-1)} style={{ padding: 'var(--space-xs) var(--space-sm)' }}>
            <ArrowLeft size={16} />
          </button>
          <h1 className="section-title" style={{ flex: 1 }}>{task.title || `Task #${task.id}`}</h1>
          {statusBadge(task.status)}
        </div>

        {/* Task info card */}
        <div className="vp-card" style={{ marginBottom: 'var(--space-base)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
            {task.task_category && (
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 2 }}>Category</div>
                <div style={{ fontWeight: 500 }}>{task.task_category.replace(/_/g, ' ')}</div>
              </div>
            )}
            {task.priority && (
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 2 }}>Priority</div>
                <div style={{ fontWeight: 500, color: task.priority === 'high' || task.priority === 'urgent' ? 'var(--color-danger)' : 'var(--color-text)' }}>
                  {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 2 }}>
                <Calendar size={12} style={{ verticalAlign: -2 }} /> Scheduled
              </div>
              <div>{fmtDate(task.scheduled_start_date)}{task.scheduled_end_date ? ` — ${fmtDate(task.scheduled_end_date)}` : ''}</div>
            </div>
            {(task.block_name || task.block?.block_name || task.block_id) && (
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 2 }}>
                  <MapPin size={12} style={{ verticalAlign: -2 }} /> Block
                </div>
                <div>{task.block_name || task.block?.block_name || `Block #${task.block_id}`}</div>
              </div>
            )}
            {task.actual_hours > 0 && (
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 2 }}>
                  <Clock size={12} style={{ verticalAlign: -2 }} /> Hours
                </div>
                <div>{task.actual_hours}h{task.estimated_hours ? ` / ${task.estimated_hours}h est.` : ''}</div>
              </div>
            )}
          </div>
          {task.description && (
            <div style={{ marginTop: 'var(--space-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              {task.description}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {canEdit && !isFinished && (
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-base)' }}>
            {canStart && (
              <button className="btn-primary" onClick={handleStartClick} disabled={actionLoading}>
                <Play size={14} /> Start Task
              </button>
            )}
            {canComplete && (
              <button className="btn-accent" onClick={handleCompleteClick} disabled={actionLoading}>
                <CheckCircle size={14} /> Complete Task
              </button>
            )}
          </div>
        )}

        {/* Row Progress Panel */}
        {task.block_id && (
          <RowProgressPanel taskId={parseInt(taskId)} canEdit={canEdit} />
        )}

        {/* ── P1: Equipment Check Modal ──────────────────────────────── */}
        {showStartCheck && (
          <>
            <div className="td-overlay" onClick={() => setShowStartCheck(false)} />
            <div className="td-modal">
              <h3><AlertTriangle size={16} /> Pre-Task Equipment Check</h3>
              {actionError && <div className="td-error">{actionError}</div>}

              <div className="td-checklist">
                {equipmentChecks.map(c => (
                  <div key={c.task_asset_id} className={`td-check-item ${c.calibration_overdue ? 'td-check-item--warn' : ''}`}>
                    <div className="td-check-name">{c.asset_name}</div>
                    <div className="td-check-meta">
                      <span>{c.role}</span>
                      {c.requires_calibration && (
                        <span className={c.calibration_overdue ? 'td-overdue' : 'td-ok'}>
                          {c.calibration_overdue ? 'Calibration overdue' : `Last cal: ${c.last_calibration_date || 'N/A'}`}
                        </span>
                      )}
                      {c.is_consumable && c.current_stock != null && (
                        <span>Stock: {c.current_stock} {c.unit || ''}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="td-modal-actions">
                <button className="btn-ghost" onClick={() => setShowStartCheck(false)}>Cancel</button>
                {equipmentChecks.some(c => c.calibration_overdue) && (
                  <button className="btn-accent" onClick={() => doStart(true)} disabled={actionLoading}>
                    {actionLoading ? 'Starting...' : 'Start Anyway (Override)'}
                  </button>
                )}
                <button className="btn-primary" onClick={() => doStart(false)} disabled={actionLoading}>
                  {actionLoading ? 'Starting...' : 'Confirm & Start'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── P0: Complete Task + Consumable Actuals Modal ────────── */}
        {showComplete && (
          <>
            <div className="td-overlay" onClick={() => setShowComplete(false)} />
            <div className="td-modal">
              <h3><CheckCircle size={16} /> Complete Task</h3>
              {actionError && <div className="td-error">{actionError}</div>}

              {consumables.length > 0 && (
                <div className="td-consumables">
                  <h4><Package size={14} /> Confirm Consumable Usage</h4>
                  {consumables.map(c => {
                    const actual = consumableActuals[c.task_asset_id] || {};
                    return (
                      <div key={c.task_asset_id} className="td-consumable-row">
                        <div className="td-consumable-name">
                          {c.asset_name}
                          <span className="td-consumable-meta">
                            Planned: {c.planned_quantity} {c.unit || ''} | Stock: {c.current_stock} {c.unit || ''}
                          </span>
                        </div>
                        <div className="td-consumable-inputs">
                          <label>
                            Actual {c.unit || 'qty'}
                            <input
                              type="number"
                              step="0.1"
                              value={actual.actual_quantity ?? ''}
                              onChange={(e) => setConsumableActuals(prev => ({
                                ...prev,
                                [c.task_asset_id]: { ...prev[c.task_asset_id], actual_quantity: e.target.value }
                              }))}
                              className="td-input"
                            />
                          </label>
                          <label>
                            Batch #
                            <input
                              type="text"
                              value={actual.batch_number ?? ''}
                              onChange={(e) => setConsumableActuals(prev => ({
                                ...prev,
                                [c.task_asset_id]: { ...prev[c.task_asset_id], batch_number: e.target.value }
                              }))}
                              placeholder="Optional"
                              className="td-input"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="td-notes-section">
                <label>Completion Notes</label>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Any notes about the completed work..."
                  rows={3}
                  className="td-textarea"
                />
              </div>

              <div className="td-modal-actions">
                <button className="btn-ghost" onClick={() => setShowComplete(false)}>Cancel</button>
                <button className="btn-primary" onClick={doComplete} disabled={actionLoading}>
                  {actionLoading ? 'Completing...' : 'Complete Task'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .td-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 999;
        }
        .td-modal {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          background: var(--color-surface); border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg); width: 90%; max-width: 520px;
          z-index: 1000; padding: var(--space-lg); max-height: 85vh; overflow-y: auto;
        }
        .td-modal h3 {
          margin: 0 0 var(--space-md); font-size: var(--font-size-lg);
          font-weight: 600; color: var(--color-primary);
          display: flex; align-items: center; gap: var(--space-xs);
        }
        .td-modal h4 {
          margin: 0 0 var(--space-sm); font-size: var(--font-size-base);
          font-weight: 600; color: var(--color-text);
          display: flex; align-items: center; gap: var(--space-xs);
        }
        .td-error {
          background: var(--color-danger-bg); color: var(--color-danger);
          padding: var(--space-sm); border-radius: var(--radius-sm);
          font-size: var(--font-size-sm); margin-bottom: var(--space-md);
        }
        .td-checklist {
          display: flex; flex-direction: column; gap: var(--space-sm);
          margin-bottom: var(--space-md);
        }
        .td-check-item {
          padding: var(--space-sm) var(--space-md);
          border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          background: var(--color-surface);
        }
        .td-check-item--warn {
          border-color: var(--color-warning); background: var(--color-warning-bg);
        }
        .td-check-name { font-weight: 500; margin-bottom: 2px; }
        .td-check-meta {
          display: flex; gap: var(--space-md); flex-wrap: wrap;
          font-size: var(--font-size-xs); color: var(--color-text-muted);
        }
        .td-overdue { color: var(--color-danger); font-weight: 600; }
        .td-ok { color: var(--color-success); }
        .td-consumables {
          margin-bottom: var(--space-md);
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          padding: var(--space-md);
        }
        .td-consumable-row {
          padding: var(--space-sm) 0;
          border-bottom: 1px solid var(--color-border);
        }
        .td-consumable-row:last-child { border-bottom: none; }
        .td-consumable-name {
          font-weight: 500; margin-bottom: var(--space-xs);
        }
        .td-consumable-meta {
          display: block; font-size: var(--font-size-xs);
          color: var(--color-text-muted); font-weight: 400;
        }
        .td-consumable-inputs {
          display: flex; gap: var(--space-md); margin-top: var(--space-xs);
        }
        .td-consumable-inputs label {
          display: flex; flex-direction: column; gap: 2px;
          font-size: var(--font-size-xs); color: var(--color-text-muted); flex: 1;
        }
        .td-input, .td-textarea {
          padding: var(--space-xs) var(--space-sm);
          border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          font-family: var(--font-family); font-size: var(--font-size-sm);
        }
        .td-input:focus, .td-textarea:focus {
          outline: none; border-color: var(--color-primary);
        }
        .td-textarea { width: 100%; resize: vertical; }
        .td-notes-section {
          margin-bottom: var(--space-md);
        }
        .td-notes-section label {
          display: block; font-size: var(--font-size-sm); font-weight: 500;
          color: var(--color-text); margin-bottom: var(--space-xs);
        }
        .td-modal-actions {
          display: flex; justify-content: flex-end; gap: var(--space-sm);
          padding-top: var(--space-md); border-top: 1px solid var(--color-border);
        }
      `}</style>
    </div>
  );
}

export default TaskDetail;
