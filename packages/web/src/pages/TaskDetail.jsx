// pages/TaskDetail.jsx — Task detail view with row progress, equipment check, consumable completion
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Clock, Play, CheckCircle, AlertTriangle, Package, Edit2, Users, Wrench, FileText, Save, X, Tag, ClipboardList } from 'lucide-react';
import RiskHazardChips from '../components/risks/RiskHazardChips';
import { tasksService, taskRowService, byNatural } from '@vineyard/shared';
import { useAuth } from '@vineyard/shared';
import RowProgressPanel from '../components/tasks/RowProgressPanel';
import TaskAssetsPanel from '../components/tasks/TaskAssetsPanel';
import SubTaskPanel from '../components/tasks/SubTaskPanel';
import { TaskStatusBadge } from '../components/TaskManagement';
import '../pages/vineyard-pages.css';
import './TaskDetail.css';

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

// One labelled fact in the header's spec strip. `icon` is optional — most specs
// read fine without one, and a full row of icons is noise.
function Spec({ label, icon, children, muted }) {
  return (
    <div>
      <div className="td-spec-label">{icon}{label}</div>
      <div className={`td-spec-value${muted ? ' td-spec-value--muted' : ''}`}>{children}</div>
    </div>
  );
}

// A titled white panel. Same shape as the assets dashboard's table cards.
function Panel({ title, icon, count, action, children, className = '' }) {
  return (
    <div className={`td-panel ${className}`.trim()}>
      <div className="td-panel-head">
        <span className="td-panel-head-title">
          {icon}{title}
          {count != null && <span className="td-panel-count">({count})</span>}
        </span>
        {action}
      </div>
      <div className="td-panel-body">{children}</div>
    </div>
  );
}

// One timestamped event in the Activity panel.
function Event({ label, children }) {
  return (
    <div className="td-event">
      <span className="td-event-label">{label}</span>
      <span className="td-event-value">{children}</span>
    </div>
  );
}

// GPS tracking is mothballed: phone GPS wasn't accurate enough to be worth
// acting on, so nothing on this page starts a track or reports one. The backend
// endpoints, models and the spray-coverage service are all still in place —
// only the wiring and the UI that exposed them have been removed. Spray coverage
// went with it, since the raster is derived from the GPS track on completion.

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
  // Labour hours at completion. Web has never had this box — only mobile did —
  // so a task finished from a desk logged no time at all: no timesheet entry,
  // and no hours for the machine that ran, which is most of why costing reads
  // empty for office-completed work.
  const [hoursWorked, setHoursWorked] = useState('');
  // The task's machines, and the hours typed against each, keyed by
  // task_asset_id. EMPTY is not zero: a blank primary row inherits the labour
  // hours server-side, a blank secondary row records nothing.
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [equipmentActuals, setEquipmentActuals] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Row notes/issues, rolled up into the "Field Notes" summary card.
  const [rows, setRows] = useState([]);
  const [copiedNotes, setCopiedNotes] = useState(false);

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

  // Row notes/issues — only block-scoped tasks have rows. Refreshes on status
  // change (e.g. after completion); the live per-row view is the Row Progress panel.
  useEffect(() => {
    if (!taskId || !task?.block_id) { setRows([]); return; }
    let cancelled = false;
    taskRowService.listRows(taskId)
      .then(d => { if (!cancelled) setRows(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [taskId, task?.block_id, task?.status]);

  // Roll every row's issues_found + notes into one ordered list (issues first).
  const fieldNotes = useMemo(() => {
    const entries = [];
    for (const r of rows) {
      const label = r.row_number ? `Row ${r.row_number}` : `#${r.id}`;
      if (r.issues_found && r.issues_found.trim()) {
        entries.push({ id: `${r.id}-i`, label, text: r.issues_found.trim(), isIssue: true });
      }
      if (r.notes && r.notes.trim()) {
        entries.push({ id: `${r.id}-n`, label, text: r.notes.trim(), isIssue: false });
      }
    }
    entries.sort((a, b) => {
      if (a.isIssue !== b.isIssue) return a.isIssue ? -1 : 1; // issues first
      return byNatural('label')(a, b);
    });
    return entries;
  }, [rows]);

  const fieldNotesText = useMemo(
    () => fieldNotes.map(e => `${e.label}: ${e.text}`).join('\n'),
    [fieldNotes],
  );

  const copyFieldNotes = async () => {
    try {
      await navigator.clipboard.writeText(fieldNotesText);
      setCopiedNotes(true);
      setTimeout(() => setCopiedNotes(false), 1500);
    } catch { /* clipboard blocked — no-op */ }
  };

  // Seed the completion-notes textarea with the rolled-up field notes (append).
  const insertFieldNotes = () => {
    setCompletionNotes(prev => (prev?.trim() ? `${prev.trim()}\n${fieldNotesText}` : fieldNotesText));
  };

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
      setHoursWorked('');
      setEquipmentActuals({});
      await loadCompletionEquipment();
      setShowComplete(true);
    } catch {
      // No consumables endpoint — just show basic completion
      setConsumables([]);
      setConsumableActuals({});
      setCompletionNotes('');
      setHoursWorked('');
      setEquipmentActuals({});
      await loadCompletionEquipment();
      setShowComplete(true);
    }
  };

  // Machines attached to the task. Fetched when the dialog opens rather than
  // with the page: TaskAssetsPanel loads its own copy for display, and pulling
  // a second one on every render of a task nobody is completing is waste.
  // Failure is non-fatal — completion must not be blocked by a missing list.
  const loadCompletionEquipment = async () => {
    try {
      const data = await tasksService.getTaskAssets(taskId);
      const all = Array.isArray(data?.assets) ? data.assets : [];
      setEquipmentItems(
        all.filter(a => !a.is_consumable)
          .sort((a, b) => (a.role === 'primary' ? -1 : 0) - (b.role === 'primary' ? -1 : 0)),
      );
    } catch {
      setEquipmentItems([]);
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

      const hrs = parseFloat(hoursWorked);
      if (!isNaN(hrs) && hrs > 0) {
        // Quarter-hour increments, matching mobile and the timesheet's own rule.
        // Rounding here beats a 422 the person has to decode.
        payload.hours_worked = Math.round(hrs * 4) / 4;
      }

      // Only rows actually typed into. A blank row is omitted on purpose so the
      // server's rule still applies: primary inherits the labour hours,
      // secondary records nothing.
      const machineHours = equipmentItems
        .map(a => ({ task_asset_id: a.task_asset_id, raw: equipmentActuals[a.task_asset_id] }))
        .filter(e => String(e.raw ?? '').trim() !== '')
        .map(e => ({ task_asset_id: e.task_asset_id, actual_hours: parseFloat(e.raw) }))
        .filter(e => !isNaN(e.actual_hours) && e.actual_hours >= 0 && e.actual_hours <= 24);
      if (machineHours.length > 0) payload.equipment_actuals = machineHours;

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

  // Block and spatial area are mutually exclusive in practice, so they share one
  // spec slot rather than each taking a column that's empty most of the time.
  const locationName = task.block_name || task.block?.block_name
    || task.spatial_area?.name || task.spatial_area_name
    || (task.block_id ? `Block #${task.block_id}` : null);

  const taskStatus = String(task.status || '').toLowerCase().replace(/\s+/g, '_');
  const canStart = ['draft', 'scheduled', 'ready'].includes(taskStatus);
  const canComplete = ['in_progress', 'paused'].includes(taskStatus);
  const isFinished = ['completed', 'cancelled'].includes(taskStatus);


  return (
    <div className="page-container">
      {/* No `vp-page` here — that class paints a sand background, which is what
          kept this page off the white the assets dashboard uses. */}
      <div className="td-page">
        <button className="vp-back td-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>

        {/* Header card — identity, status and page actions together, with the
            at-a-glance facts on a strip beneath. These were three separate
            blocks (toolbar, hero, Overview card) fighting for the top of the
            page. */}
        <div className="td-head">
          <div className="td-head-top">
            <div className="td-head-main">
              <h1 className="td-head-title">{task.title || `Task #${task.id}`}</h1>
              <div className="td-head-sub">
                <TaskStatusBadge status={task.status} size="sm" />
                {task.task_number && <span className="td-head-number">{task.task_number}</span>}
              </div>
            </div>
            {canEdit && !isFinished && (
              <div className="td-head-right">
                <button className="td-tool-btn" onClick={openEdit}>
                  <Edit2 size={14} /> Edit
                </button>
                {canStart && (
                  <button className="td-tool-btn td-tool-btn--primary" onClick={handleStartClick} disabled={actionLoading}>
                    <Play size={14} /> Start
                  </button>
                )}
                {canComplete && (
                  <button className="td-tool-btn td-tool-btn--accent" onClick={handleCompleteClick} disabled={actionLoading}>
                    <CheckCircle size={14} /> Complete
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="td-specs">
            <Spec label="Category">
              {task.task_category
                ? <span className="td-pill td-pill--sand">{task.task_category.replace(/_/g, ' ')}</span>
                : '—'}
            </Spec>
            <Spec label="Priority">
              {task.priority
                ? (
                  <span className={`td-pill td-pill--priority-${String(task.priority).toLowerCase()}`}>
                    {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                  </span>
                )
                : '—'}
            </Spec>
            <Spec label="Scheduled" icon={<Calendar size={11} />} muted={!task.scheduled_start_date}>
              {task.scheduled_start_date
                ? `${fmtDate(task.scheduled_start_date)}${task.scheduled_end_date && task.scheduled_end_date !== task.scheduled_start_date ? ` — ${fmtDate(task.scheduled_end_date)}` : ''}`
                : 'Not scheduled'}
            </Spec>
            <Spec label="Location" icon={<MapPin size={11} />} muted={!locationName}>
              {locationName || 'No location'}
            </Spec>
            <Spec label="Hours" icon={<Clock size={11} />} muted={!task.actual_hours && !task.estimated_hours}>
              {task.actual_hours > 0 ? `${task.actual_hours}h` : '—'}
              {task.estimated_hours ? ` / ${task.estimated_hours}h est.` : ''}
            </Spec>
            {Array.isArray(task.tags) && task.tags.length > 0 && (
              <Spec label="Tags" icon={<Tag size={11} />}>
                <span className="td-tag-wrap">
                  {task.tags.map(t => <span key={t} className="td-pill td-pill--sand">{t}</span>)}
                </span>
              </Spec>
            )}
          </div>
        </div>

        {/* Hazards strip — full width above the two-column body when present */}
        <RiskHazardChips
          blockIds={task.block_id ? [task.block_id] : []}
          spatialAreaId={task.spatial_area_id || null}
          propertyId={task.property_id || task.block?.property_id || null}
        />

        {/* Field Notes — rolled up from row notes/issues. Read-only summary. */}
        {fieldNotes.length > 0 && (
          <Panel
            className="td-fieldnotes"
            title="Field notes"
            icon={<ClipboardList size={13} />}
            count={fieldNotes.length}
            action={(
              <button className="td-panel-btn" onClick={copyFieldNotes} title="Copy all to clipboard">
                <FileText size={12} /> {copiedNotes ? 'Copied' : 'Copy'}
              </button>
            )}
          >
            <ul className="td-fieldnotes-list">
              {fieldNotes.map(e => (
                <li key={e.id} className={`td-fieldnote${e.isIssue ? ' td-fieldnote--issue' : ''}`}>
                  {e.isIssue && <AlertTriangle size={13} className="td-fieldnote-icon" />}
                  <span className="td-fieldnote-row">{e.label}</span>
                  <span className="td-fieldnote-text">{e.text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* Two-column body. The old Overview card is gone — its facts are now
            the header's spec strip, so this is only the long-form content. */}
        <div className="td-grid">
          <div className="td-col td-col--main">
            {/* Always rendered, so the left column never collapses to nothing
                next to a populated right column. */}
            <Panel title="Description" icon={<FileText size={13} />}>
              {task.description
                ? <div className="td-description">{task.description}</div>
                : <div className="td-people-empty">No description on this task.</div>}
            </Panel>

            {task.location_notes && (
              <Panel title="Location notes" icon={<MapPin size={13} />}>
                <div className="td-note-body">{task.location_notes}</div>
              </Panel>
            )}
          </div>

          <div className="td-col td-col--side">
            <Panel title="Assigned to" icon={<Users size={13} />}>
              <div className="td-people">
                <div>
                  <div className="td-people-label"><Users size={11} /> Users</div>
                  {Array.isArray(task.assignee_names) && task.assignee_names.length > 0 ? (
                    <div className="td-people-list">
                      {task.assignee_names.map((n, i) => <div key={i}>{n}</div>)}
                    </div>
                  ) : (
                    <div className="td-people-empty">None</div>
                  )}
                </div>
                <div>
                  <div className="td-people-label"><Wrench size={11} /> Contractors</div>
                  {Array.isArray(task.contractor_names) && task.contractor_names.length > 0 ? (
                    <div className="td-people-list">
                      {task.contractor_names.map((n, i) => <div key={i}>{n}</div>)}
                    </div>
                  ) : (
                    <div className="td-people-empty">None</div>
                  )}
                </div>
              </div>
            </Panel>

            <Panel title="Activity" icon={<Clock size={13} />}>
              <div className="td-events">
                <Event label="Created">
                  {fmtDateTime(task.created_at) || '—'}
                  {task.creator && <span className="td-event-sub">by {friendlyName(task.creator)}</span>}
                </Event>
                {task.actual_start_time && (
                  <Event label="Started">{fmtDateTime(task.actual_start_time)}</Event>
                )}
                {task.completed_at && (
                  <Event label="Completed">
                    {fmtDateTime(task.completed_at)}
                    {task.completer && <span className="td-event-sub">by {friendlyName(task.completer)}</span>}
                  </Event>
                )}
                {task.cancelled_at && (
                  <Event label="Cancelled">{fmtDateTime(task.cancelled_at)}</Event>
                )}
              </div>
              {task.completion_notes && (
                <div className="td-note-block">
                  <div className="td-note-label">Completion notes</div>
                  <div className="td-note-body">{task.completion_notes}</div>
                </div>
              )}
              {task.cancellation_reason && (
                <div className="td-note-block">
                  <div className="td-note-label">Cancellation reason</div>
                  <div className="td-note-body">{task.cancellation_reason}</div>
                </div>
              )}
            </Panel>
          </div>
        </div>

        {/* Row Progress Panel */}
        {task.block_id && (
          <RowProgressPanel taskId={parseInt(taskId)} canEdit={canEdit} task={task} />
        )}

        {/* What this task uses. Before this, equipment was visible only in the
            pre-start check and consumables only in the completion dialog, so
            mid-task there was nothing to look at and after completion the
            recorded quantities were never rendered anywhere. */}
        <TaskAssetsPanel taskId={parseInt(taskId)} taskStatus={task.status} canEdit={canEdit} />

        {/* Rolled-up issues, shown in the same rows idiom. Self-hides on a task
            that has no children, so ordinary tasks are unaffected. */}
        <SubTaskPanel task={task} canEdit={canEdit} />

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

              <div className="td-form">
                <label className="td-field">
                  <span className="td-field-label">Title</span>
                  <input
                    className="td-input"
                    value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  />
                </label>

                <div className="td-form-row">
                  <label className="td-field">
                    <span className="td-field-label">Priority</span>
                    <select
                      className="td-input"
                      value={editForm.priority}
                      onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <label className="td-field">
                    <span className="td-field-label">Estimated hours</span>
                    <input
                      className="td-input"
                      type="number"
                      step="0.25"
                      min="0"
                      value={editForm.estimated_hours}
                      onChange={e => setEditForm(f => ({ ...f, estimated_hours: e.target.value }))}
                    />
                  </label>
                  <label className="td-field">
                    <span className="td-field-label">Scheduled start</span>
                    <input
                      className="td-input"
                      type="date"
                      value={editForm.scheduled_start_date}
                      onChange={e => setEditForm(f => ({ ...f, scheduled_start_date: e.target.value }))}
                    />
                  </label>
                  <label className="td-field">
                    <span className="td-field-label">Scheduled end</span>
                    <input
                      className="td-input"
                      type="date"
                      value={editForm.scheduled_end_date}
                      onChange={e => setEditForm(f => ({ ...f, scheduled_end_date: e.target.value }))}
                    />
                  </label>
                </div>

                <label className="td-field">
                  <span className="td-field-label">Description</span>
                  <textarea
                    className="td-textarea"
                    rows={4}
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  />
                </label>

                <label className="td-field">
                  <span className="td-field-label">Location notes</span>
                  <textarea
                    className="td-textarea"
                    rows={2}
                    value={editForm.location_notes}
                    onChange={e => setEditForm(f => ({ ...f, location_notes: e.target.value }))}
                  />
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

              <div className="td-hours-section">
                <label className="td-hours-label">Hours worked</label>
                <div className="td-hours-row">
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    className="td-input td-hours-input"
                    value={hoursWorked}
                    onChange={(e) => setHoursWorked(e.target.value)}
                    placeholder="0.00"
                  />
                  <div className="td-hours-chips">
                    {['0.5', '1', '2', '4', '8'].map(h => (
                      <button
                        key={h}
                        type="button"
                        className="td-hours-chip"
                        onClick={() => setHoursWorked(h)}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
                <div className="td-hours-hint">
                  Quarter-hour increments. Adds an entry to your timesheet for today.
                </div>
              </div>

              {/* Machine hours. The API has always accepted these and no client
                  ever sent them, so an implement could never be costed and its
                  hour meter never moved. A blank box keeps the server's rule:
                  primary inherits the hours above, secondary records none. */}
              {equipmentItems.length > 0 && (
                <div className="td-hours-section">
                  <label className="td-hours-label">Machine hours</label>
                  {equipmentItems.map(a => {
                    const primary = a.role === 'primary';
                    const h = parseFloat(hoursWorked);
                    const inherited = !isNaN(h) && h > 0 ? (Math.round(h * 4) / 4).toFixed(2) : null;
                    return (
                      <div key={a.task_asset_id} className="td-machine-row">
                        <div className="td-machine-name">
                          {a.asset_name}
                          <span className="td-consumable-meta">
                            {primary
                              ? (inherited
                                ? `Primary — ${inherited} h unless you change it`
                                : 'Primary — matches hours worked')
                              : 'Secondary — no hours unless entered'}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max="24"
                          className="td-input td-machine-input"
                          value={equipmentActuals[a.task_asset_id] ?? ''}
                          onChange={(e) => setEquipmentActuals(prev => ({
                            ...prev,
                            [a.task_asset_id]: e.target.value,
                          }))}
                          placeholder={primary ? (inherited || '0.00') : '0.00'}
                          aria-label={`Machine hours for ${a.asset_name}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="td-notes-section">
                <div className="td-notes-label-row">
                  <label>Completion Notes</label>
                  {fieldNotes.length > 0 && (
                    <button type="button" className="td-notes-insert" onClick={insertFieldNotes}>
                      <ClipboardList size={13} /> Insert field notes ({fieldNotes.length})
                    </button>
                  )}
                </div>
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

    </div>
  );
}

export default TaskDetail;
