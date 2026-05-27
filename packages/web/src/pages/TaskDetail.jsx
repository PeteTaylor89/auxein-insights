// pages/TaskDetail.jsx — Task detail view with row progress, equipment check, consumable completion
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Clock, Play, CheckCircle, AlertTriangle, Package, Edit2, Users, Wrench, FileText, Save, X, Tag, Navigation } from 'lucide-react';
import RiskHazardChips from '../components/risks/RiskHazardChips';
import { tasksService } from '@vineyard/shared';
import { useAuth } from '@vineyard/shared';
import RowProgressPanel from '../components/tasks/RowProgressPanel';
import { TaskStatusBadge } from '../components/TaskManagement';
import '../pages/vineyard-pages.css';

function friendlyName(user) {
  if (!user) return null;
  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  const email = (user.email || '').trim();
  if (email && email.includes('@')) {
    const local = email.split('@')[0];
    return local.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return user.full_name || user.username || `User #${user.id}`;
}

function fmtDateTime(d) {
  if (!d) return null;
  try { return new Date(d).toLocaleString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

function InfoItem({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 500 }}>{children}</div>
    </div>
  );
}

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

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

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

  // ── Edit Task Flow ───────────────────────────────────────────────
  const openEdit = () => {
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      scheduled_start_date: task.scheduled_start_date || '',
      scheduled_end_date: task.scheduled_end_date || '',
      estimated_hours: task.estimated_hours ?? '',
      location_notes: task.location_notes || '',
      requires_gps_tracking: !!task.requires_gps_tracking,
    });
    setEditError(null);
    setShowEdit(true);
  };

  const doSaveEdit = async () => {
    setEditSaving(true);
    setEditError(null);
    try {
      const payload = {
        title: editForm.title.trim() || null,
        description: editForm.description || null,
        priority: editForm.priority || null,
        scheduled_start_date: editForm.scheduled_start_date || null,
        scheduled_end_date: editForm.scheduled_end_date || null,
        estimated_hours: editForm.estimated_hours === '' ? null : Number(editForm.estimated_hours),
        location_notes: editForm.location_notes || null,
        requires_gps_tracking: !!editForm.requires_gps_tracking,
      };
      await tasksService.updateTask(taskId, payload);
      setShowEdit(false);
      await loadTask();
    } catch (err) {
      console.error('Update failed:', err);
      const detail = err.response?.data?.detail;
      setEditError(typeof detail === 'string' ? detail : 'Failed to save changes.');
    } finally {
      setEditSaving(false);
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


  return (
    <div className="page-container">
      <div className="vp-page td-page">
        {/* Toolbar — back left, actions right */}
        <div className="td-toolbar">
          <button className="td-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back
          </button>
          <div className="td-toolbar-actions">
            {canEdit && !isFinished && (
              <button className="td-tool-btn" onClick={openEdit}>
                <Edit2 size={14} /> Edit
              </button>
            )}
            {canEdit && !isFinished && canStart && (
              <button className="td-tool-btn td-tool-btn--primary" onClick={handleStartClick} disabled={actionLoading}>
                <Play size={14} /> Start
              </button>
            )}
            {canEdit && !isFinished && canComplete && (
              <button className="td-tool-btn td-tool-btn--accent" onClick={handleCompleteClick} disabled={actionLoading}>
                <CheckCircle size={14} /> Complete
              </button>
            )}
          </div>
        </div>

        {/* Hero — title + task number + status */}
        <div className="td-hero">
          <div className="td-hero-main">
            <h1 className="td-hero-title">{task.title || `Task #${task.id}`}</h1>
            {task.task_number && (
              <div className="td-hero-subtitle">{task.task_number}</div>
            )}
          </div>
          <div className="td-hero-status">
            <TaskStatusBadge status={task.status} size="lg" />
          </div>
        </div>

        {/* Hazards strip — full width above the two-column body when present */}
        <RiskHazardChips
          blockIds={task.block_id ? [task.block_id] : []}
          spatialAreaId={task.spatial_area_id || null}
          propertyId={task.property_id || task.block?.property_id || null}
        />

        {/* Two-column body */}
        <div className="td-grid">
          {/* Left column — Overview + Description */}
          <div className="td-col td-col--main">
            <div className="vp-card td-card">
              <h3 className="td-card-title">Overview</h3>
              <div className="td-overview-grid">
                {task.task_category && (
                  <InfoItem label="Category">
                    <span className="td-pill td-pill--sand">{task.task_category.replace(/_/g, ' ')}</span>
                  </InfoItem>
                )}
                {task.priority && (
                  <InfoItem label="Priority">
                    <span className={`td-pill td-pill--priority-${String(task.priority).toLowerCase()}`}>
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </span>
                  </InfoItem>
                )}
                <InfoItem label={<><Calendar size={12} style={{ verticalAlign: -2 }} /> Scheduled</>}>
                  {task.scheduled_start_date
                    ? `${fmtDate(task.scheduled_start_date)}${task.scheduled_end_date && task.scheduled_end_date !== task.scheduled_start_date ? ` — ${fmtDate(task.scheduled_end_date)}` : ''}`
                    : '—'}
                </InfoItem>
                {(task.block_name || task.block?.block_name || task.block_id) && (
                  <InfoItem label={<><MapPin size={12} style={{ verticalAlign: -2 }} /> Block</>}>
                    <span className="td-pill td-pill--sand">{task.block_name || task.block?.block_name || `Block #${task.block_id}`}</span>
                  </InfoItem>
                )}
                {(task.spatial_area?.name || task.spatial_area_name) && (
                  <InfoItem label={<><MapPin size={12} style={{ verticalAlign: -2 }} /> Spatial area</>}>
                    <span className="td-pill td-pill--sand">{task.spatial_area?.name || task.spatial_area_name}</span>
                  </InfoItem>
                )}
                <InfoItem label={<><Clock size={12} style={{ verticalAlign: -2 }} /> Hours</>}>
                  {task.actual_hours > 0 ? `${task.actual_hours}h` : '—'}
                  {task.estimated_hours ? ` / ${task.estimated_hours}h est.` : ''}
                </InfoItem>
                {task.requires_gps_tracking && (
                  <InfoItem label={<><Navigation size={12} style={{ verticalAlign: -2 }} /> GPS tracking</>}>
                    <span className="td-pill td-pill--olive">Enabled</span>
                  </InfoItem>
                )}
                {Array.isArray(task.tags) && task.tags.length > 0 && (
                  <InfoItem label={<><Tag size={12} style={{ verticalAlign: -2 }} /> Tags</>}>
                    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                      {task.tags.map(t => (
                        <span key={t} className="td-pill td-pill--sand">{t}</span>
                      ))}
                    </span>
                  </InfoItem>
                )}
              </div>
              {task.location_notes && (
                <div className="td-card-footer">
                  <div className="td-footer-label">Location notes</div>
                  <div className="td-footer-body">{task.location_notes}</div>
                </div>
              )}
            </div>

            {task.description && (
              <div className="vp-card td-card">
                <h3 className="td-card-title">
                  <FileText size={14} style={{ verticalAlign: -2 }} /> Description
                </h3>
                <div className="td-description">{task.description}</div>
              </div>
            )}
          </div>

          {/* Right column — Assignments + Activity */}
          <div className="td-col td-col--side">
            <div className="vp-card td-card">
              <h3 className="td-card-title">Assignments</h3>
              <div className="td-assignment-section">
                <div className="td-assignment-label"><Users size={12} style={{ verticalAlign: -2 }} /> Users</div>
                {Array.isArray(task.assignee_names) && task.assignee_names.length > 0 ? (
                  <div className="td-assignment-list">
                    {task.assignee_names.map((n, i) => <div key={i}>{n}</div>)}
                  </div>
                ) : (
                  <div className="td-assignment-empty">None</div>
                )}
              </div>
              <div className="td-assignment-section">
                <div className="td-assignment-label"><Wrench size={12} style={{ verticalAlign: -2 }} /> Contractors</div>
                {Array.isArray(task.contractor_names) && task.contractor_names.length > 0 ? (
                  <div className="td-assignment-list">
                    {task.contractor_names.map((n, i) => <div key={i}>{n}</div>)}
                  </div>
                ) : (
                  <div className="td-assignment-empty">None</div>
                )}
              </div>
            </div>

            <div className="vp-card td-card">
              <h3 className="td-card-title">Activity</h3>
              <div className="td-activity-grid">
                <InfoItem label="Created">
                  {fmtDateTime(task.created_at) || '—'}
                  {task.creator && <div className="td-meta-sub">by {friendlyName(task.creator)}</div>}
                </InfoItem>
                {task.actual_start_time && (
                  <InfoItem label="Started">{fmtDateTime(task.actual_start_time)}</InfoItem>
                )}
                {task.completed_at && (
                  <InfoItem label="Completed">
                    {fmtDateTime(task.completed_at)}
                    {task.completer && <div className="td-meta-sub">by {friendlyName(task.completer)}</div>}
                  </InfoItem>
                )}
                {task.cancelled_at && (
                  <InfoItem label="Cancelled">{fmtDateTime(task.cancelled_at)}</InfoItem>
                )}
              </div>
              {task.completion_notes && (
                <div className="td-card-footer">
                  <div className="td-footer-label">Completion notes</div>
                  <div className="td-footer-body">{task.completion_notes}</div>
                </div>
              )}
              {task.cancellation_reason && (
                <div className="td-card-footer">
                  <div className="td-footer-label">Cancellation reason</div>
                  <div className="td-footer-body">{task.cancellation_reason}</div>
                </div>
              )}
            </div>
          </div>
        </div>

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

        {/* ── Edit Task Modal ──────────────────────────────────────── */}
        {showEdit && (
          <>
            <div className="td-overlay" onClick={() => setShowEdit(false)} />
            <div className="td-modal">
              <h3><Edit2 size={16} /> Edit Task</h3>
              {editError && <div className="td-error">{editError}</div>}

              <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 4 }}>Title</label>
                  <input
                    className="td-input"
                    style={{ width: '100%' }}
                    value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: '1fr 1fr' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 4 }}>Priority</label>
                    <select
                      className="td-input"
                      style={{ width: '100%' }}
                      value={editForm.priority}
                      onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 4 }}>Estimated hours</label>
                    <input
                      className="td-input"
                      style={{ width: '100%' }}
                      type="number"
                      step="0.25"
                      min="0"
                      value={editForm.estimated_hours}
                      onChange={e => setEditForm(f => ({ ...f, estimated_hours: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 4 }}>Scheduled start</label>
                    <input
                      className="td-input"
                      style={{ width: '100%' }}
                      type="date"
                      value={editForm.scheduled_start_date}
                      onChange={e => setEditForm(f => ({ ...f, scheduled_start_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 4 }}>Scheduled end</label>
                    <input
                      className="td-input"
                      style={{ width: '100%' }}
                      type="date"
                      value={editForm.scheduled_end_date}
                      onChange={e => setEditForm(f => ({ ...f, scheduled_end_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 4 }}>Description</label>
                  <textarea
                    className="td-textarea"
                    rows={4}
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 4 }}>Location notes</label>
                  <textarea
                    className="td-textarea"
                    rows={2}
                    value={editForm.location_notes}
                    onChange={e => setEditForm(f => ({ ...f, location_notes: e.target.value }))}
                  />
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editForm.requires_gps_tracking}
                    onChange={e => setEditForm(f => ({ ...f, requires_gps_tracking: e.target.checked }))}
                  />
                  <Navigation size={14} /> Require GPS tracking
                </label>
              </div>

              <div className="td-modal-actions">
                <button className="btn-ghost" onClick={() => setShowEdit(false)} disabled={editSaving}>
                  <X size={14} /> Cancel
                </button>
                <button className="btn-primary" onClick={doSaveEdit} disabled={editSaving || !editForm.title?.trim()}>
                  <Save size={14} /> {editSaving ? 'Saving...' : 'Save changes'}
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
