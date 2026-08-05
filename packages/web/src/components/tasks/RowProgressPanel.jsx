// components/tasks/RowProgressPanel.jsx — Row-level task progress panel (Grow V1, R7)
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, RotateCw, Check, SkipForward, Star, MessageSquare, Save, X, ClipboardList } from 'lucide-react';
import { taskRowService, usersService, byNatural } from '@vineyard/shared';
import RowTaskCreateModal from './RowTaskCreateModal';
import './RowProgressPanel.css';

const STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

const STATUS_CLASSES = {
  pending: 'rp-status--pending',
  in_progress: 'rp-status--progress',
  completed: 'rp-status--completed',
  skipped: 'rp-status--skipped',
};

function StarRating({ value, onChange, readOnly }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="rp-stars">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={14}
          className={i <= (hover || value || 0) ? 'rp-star--filled' : 'rp-star--empty'}
          onClick={!readOnly ? () => onChange(i === value ? null : i) : undefined}
          onMouseEnter={!readOnly ? () => setHover(i) : undefined}
          onMouseLeave={!readOnly ? () => setHover(0) : undefined}
          style={!readOnly ? { cursor: 'pointer' } : undefined}
        />
      ))}
    </span>
  );
}

function RowProgressPanel({ taskId, canEdit, task, onIssueRaised }) {
  const [expanded, setExpanded] = useState(true);
  // Row to spin a follow-up task from (null = modal closed).
  const [taskModalRow, setTaskModalRow] = useState(null);
  const [rows, setRows] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [skipReason, setSkipReason] = useState('');
  const [showBulkSkip, setShowBulkSkip] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  // Company users — fetched once for the row audit display ("Completed by
  // Sarah · 10:43"). Backend returns completed_by as a user id only, so we
  // resolve names client-side. Failure is non-fatal: we fall back to "User #N"
  // so the time still renders.
  const [users, setUsers] = useState([]);
  useEffect(() => {
    usersService.getCompanyUsers()
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, []);
  const userById = useMemo(() => {
    const m = new Map();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);
  const labelFor = useCallback((userId) => {
    if (!userId) return null;
    const u = userById.get(userId);
    if (!u) return `User #${userId}`;
    const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    return full || u.email || `User #${userId}`;
  }, [userById]);

  const load = useCallback(async () => {
    try {
      const [rowData, progressData] = await Promise.all([
        taskRowService.listRows(taskId),
        taskRowService.getProgress(taskId),
      ]);
      // Natural sort by row_number — backend ORDER BY treats row_number as a
      // string ("1", "10", "2"...), so we re-sort client-side. Falls through
      // to id as a stable tiebreaker for rows missing a row_number.
      const list = Array.isArray(rowData) ? [...rowData] : [];
      list.sort((a, b) => {
        const cmp = byNatural('row_number')(a, b);
        if (cmp !== 0) return cmp;
        return (a.id ?? 0) - (b.id ?? 0);
      });
      setRows(list);
      setProgress(progressData);
    } catch (err) {
      console.error('Failed to load rows', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await taskRowService.generateRows(taskId);
      await load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to generate rows');
    } finally {
      setGenerating(false);
    }
  };

  const handleComplete = async (rowId) => {
    const ed = editData[rowId] || {};
    try {
      await taskRowService.completeRow(taskId, rowId, {
        notes: ed.notes || null,
        issues_found: ed.issues_found || null,
        quality_rating: ed.quality_rating || null,
      });
      setExpandedRowId(null);
      await load();
    } catch (err) {
      console.error('Failed to complete row', err);
    }
  };

  const handleSkip = async (rowId) => {
    const reason = (editData[rowId]?.skip_reason || '').trim();
    if (!reason) {
      // Expand the row to show skip reason input
      setExpandedRowId(rowId);
      setEditData(prev => ({ ...prev, [rowId]: { ...prev[rowId], showSkipPrompt: true } }));
      return;
    }
    try {
      await taskRowService.skipRow(taskId, rowId, reason);
      setExpandedRowId(null);
      await load();
    } catch (err) {
      console.error('Failed to skip row', err);
    }
  };

  const handleSaveNotes = async (rowId) => {
    const ed = editData[rowId] || {};
    setSaving(true);
    try {
      await taskRowService.updateRow(taskId, rowId, {
        notes: ed.notes !== undefined ? ed.notes : null,
        issues_found: ed.issues_found !== undefined ? ed.issues_found : null,
        quality_rating: ed.quality_rating !== undefined ? ed.quality_rating : null,
      });
      await load();
    } catch (err) {
      console.error('Failed to save row', err);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkComplete = async () => {
    if (selectedRows.size === 0) return;
    try {
      await taskRowService.bulkComplete(taskId, [...selectedRows]);
      setSelectedRows(new Set());
      await load();
    } catch (err) {
      console.error('Failed to bulk complete', err);
    }
  };

  const handleBulkSkip = async () => {
    if (selectedRows.size === 0 || !skipReason.trim()) return;
    try {
      await taskRowService.bulkSkip(taskId, [...selectedRows], skipReason);
      setSelectedRows(new Set());
      setSkipReason('');
      setShowBulkSkip(false);
      await load();
    } catch (err) {
      console.error('Failed to bulk skip', err);
    }
  };

  const toggleSelect = (rowId) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const filteredRows = statusFilter === 'all'
    ? rows
    : rows.filter(r => r.status === statusFilter);

  const toggleSelectAll = () => {
    const actionable = filteredRows.filter(r => r.status === 'pending' || r.status === 'in_progress');
    if (selectedRows.size === actionable.length && actionable.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(actionable.map(r => r.id)));
    }
  };

  const openRowDetail = (row) => {
    if (expandedRowId === row.id) {
      setExpandedRowId(null);
      return;
    }
    setExpandedRowId(row.id);
    setEditData(prev => ({
      ...prev,
      [row.id]: {
        notes: row.notes || '',
        issues_found: row.issues_found || '',
        quality_rating: row.quality_rating || null,
        skip_reason: row.skip_reason || '',
        showSkipPrompt: false,
      }
    }));
  };

  const updateEditField = (rowId, field, value) => {
    setEditData(prev => ({
      ...prev,
      [rowId]: { ...prev[rowId], [field]: value }
    }));
  };

  const fmtTime = (dt) => {
    if (!dt) return '';
    try { return new Date(dt).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const fmtDateTime = (dt) => {
    if (!dt) return '';
    try {
      const d = new Date(dt);
      const today = new Date();
      const sameDay = d.toDateString() === today.toDateString();
      if (sameDay) return fmtTime(dt);
      return d.toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div className="rp-panel">
      <button className="rp-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="rp-header-title">Row Progress</span>
        {progress && (
          <span className="rp-header-summary">
            {progress.completed_rows}/{progress.total_rows} rows ({progress.completion_percentage}%)
          </span>
        )}
      </button>

      {expanded && (
        <div className="rp-body">
          {loading ? (
            <p className="rp-loading">Loading rows...</p>
          ) : rows.length === 0 ? (
            <div className="rp-empty">
              <p>No rows generated for this task.</p>
              {canEdit && (
                <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
                  <RotateCw size={14} /> {generating ? 'Generating...' : 'Generate Rows from Block'}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Progress bar */}
              {progress && (
                <div className="rp-progress">
                  <div className="rp-progress-bar">
                    <div className="rp-progress-fill" style={{ width: `${progress.completion_percentage}%` }} />
                  </div>
                  <div className="rp-progress-stats">
                    <span>{progress.completed_rows} completed</span>
                    <span>{progress.skipped_rows} skipped</span>
                    <span>{progress.in_progress_rows} in progress</span>
                    <span>{progress.pending_rows} pending</span>
                    {progress.rows_with_issues > 0 && (
                      <span className="rp-issues">{progress.rows_with_issues} with issues</span>
                    )}
                  </div>
                </div>
              )}

              {/* Toolbar */}
              <div className="rp-toolbar">
                <select className="rp-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All ({rows.length})</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="skipped">Skipped</option>
                </select>

                {canEdit && selectedRows.size > 0 && (
                  <div className="rp-bulk-actions">
                    <button className="rp-btn rp-btn--success" onClick={handleBulkComplete}>
                      <Check size={14} />
                      <span>Complete {selectedRows.size}</span>
                    </button>
                    {showBulkSkip ? (
                      <div className="rp-skip-input-group">
                        <input
                          type="text"
                          placeholder="Skip reason..."
                          value={skipReason}
                          onChange={(e) => setSkipReason(e.target.value)}
                          className="rp-skip-input"
                          autoFocus
                        />
                        <button className="rp-btn rp-btn--warning" onClick={handleBulkSkip} disabled={!skipReason.trim()}>
                          Skip
                        </button>
                        <button className="rp-btn rp-btn--ghost" onClick={() => setShowBulkSkip(false)}>
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button className="rp-btn rp-btn--warning" onClick={() => setShowBulkSkip(true)}>
                        <SkipForward size={14} />
                        <span>Skip {selectedRows.size}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Row list */}
              <div className="rp-row-list">
                {filteredRows.map(row => {
                  const isExpanded = expandedRowId === row.id;
                  const ed = editData[row.id] || {};
                  const isActionable = row.status === 'pending' || row.status === 'in_progress';

                  return (
                    <div key={row.id} className={`rp-row-card ${isExpanded ? 'rp-row-card--expanded' : ''} ${row.issues_found ? 'rp-row-card--issues' : ''}`}>
                      {/* Row summary line */}
                      <div className="rp-row-summary" onClick={() => openRowDetail(row)}>
                        {canEdit && isActionable && (
                          <input
                            type="checkbox"
                            className="rp-row-check"
                            checked={selectedRows.has(row.id)}
                            onChange={(e) => { e.stopPropagation(); toggleSelect(row.id); }}
                          />
                        )}
                        <span className="rp-row-name">{row.row_number ? `Row ${row.row_number}` : `#${row.id}`}</span>
                        <span className={`rp-status ${STATUS_CLASSES[row.status] || ''}`}>
                          {STATUS_LABELS[row.status] || row.status}
                        </span>
                        {row.quality_rating && <StarRating value={row.quality_rating} readOnly />}
                        {/* Per-row audit: shows who closed the row + when.
                            Same field (completed_by) is stamped for completed
                            and skipped rows, so both surface here. Falls back
                            to time-only if the user isn't in the company list
                            (deactivated, removed, etc.). */}
                        {row.completed_at && (
                          <span className="rp-audit">
                            {labelFor(row.completed_by)
                              ? <>by <strong>{labelFor(row.completed_by)}</strong> · {fmtTime(row.completed_at)}</>
                              : fmtTime(row.completed_at)}
                          </span>
                        )}
                        {row.notes && <MessageSquare size={12} className="rp-has-notes" />}

                        {/* Inline action buttons */}
                        {canEdit && isActionable && (
                          <div className="rp-row-actions" onClick={(e) => e.stopPropagation()}>
                            <button className="rp-btn rp-btn--success rp-btn--sm" onClick={() => handleComplete(row.id)} title="Complete">
                              <Check size={14} />
                            </button>
                            <button className="rp-btn rp-btn--warning rp-btn--sm" onClick={() => handleSkip(row.id)} title="Skip">
                              <SkipForward size={14} />
                            </button>
                          </div>
                        )}

                        <ChevronRight size={14} className={`rp-expand-icon ${isExpanded ? 'rp-expand-icon--open' : ''}`} />
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="rp-row-detail">
                          <div className="rp-detail-grid">
                            <div className="rp-detail-field">
                              <label>Quality Rating</label>
                              <StarRating
                                value={ed.quality_rating ?? row.quality_rating}
                                onChange={canEdit ? (v) => updateEditField(row.id, 'quality_rating', v) : undefined}
                                readOnly={!canEdit}
                              />
                            </div>

                            <div className="rp-detail-field rp-detail-field--wide">
                              <label>Notes</label>
                              {canEdit ? (
                                <textarea
                                  className="rp-detail-textarea"
                                  value={ed.notes ?? row.notes ?? ''}
                                  onChange={(e) => updateEditField(row.id, 'notes', e.target.value)}
                                  placeholder="Add notes..."
                                  rows={2}
                                />
                              ) : (
                                <p className="rp-detail-text">{row.notes || <span className="rp-muted">No notes</span>}</p>
                              )}
                            </div>

                            <div className="rp-detail-field rp-detail-field--wide">
                              <label>Issues Found</label>
                              {canEdit ? (
                                <textarea
                                  className="rp-detail-textarea"
                                  value={ed.issues_found ?? row.issues_found ?? ''}
                                  onChange={(e) => updateEditField(row.id, 'issues_found', e.target.value)}
                                  placeholder="Log any issues..."
                                  rows={2}
                                />
                              ) : (
                                <p className="rp-detail-text">{row.issues_found || <span className="rp-muted">No issues</span>}</p>
                              )}
                            </div>

                            {row.skip_reason && (
                              <div className="rp-detail-field rp-detail-field--wide">
                                <label>Skip Reason</label>
                                <p className="rp-detail-text rp-skip-reason">{row.skip_reason}</p>
                              </div>
                            )}

                            {/* Full audit line — visible in the expanded view
                                even on multi-day-old rows so a manager can see
                                "Completed by Sarah · 14 May 10:43" without
                                hunting through logs. */}
                            {row.completed_at && (
                              <div className="rp-detail-field rp-detail-field--wide">
                                <label>{row.status === 'skipped' ? 'Skipped by' : 'Completed by'}</label>
                                <p className="rp-detail-text">
                                  {labelFor(row.completed_by) || 'Unknown user'}
                                  {' · '}
                                  {fmtDateTime(row.completed_at)}
                                </p>
                              </div>
                            )}

                            {/* Skip reason input when skipping */}
                            {canEdit && ed.showSkipPrompt && (
                              <div className="rp-detail-field rp-detail-field--wide">
                                <label>Skip Reason (required)</label>
                                <div className="rp-skip-action-row">
                                  <input
                                    type="text"
                                    className="rp-detail-input"
                                    value={ed.skip_reason || ''}
                                    onChange={(e) => updateEditField(row.id, 'skip_reason', e.target.value)}
                                    placeholder="Why is this row being skipped?"
                                    autoFocus
                                  />
                                  <button
                                    className="rp-btn rp-btn--warning"
                                    onClick={() => handleSkip(row.id)}
                                    disabled={!(ed.skip_reason || '').trim()}
                                  >
                                    <SkipForward size={12} /> Skip
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Save + create-follow-up-task actions */}
                          {canEdit && (
                            <div className="rp-detail-actions">
                              <button className="rp-btn rp-btn--ghost" onClick={() => setTaskModalRow(row)} title="Create a follow-up task from this row">
                                <ClipboardList size={14} /> Create task
                              </button>
                              <button className="rp-btn rp-btn--primary" onClick={() => handleSaveNotes(row.id)} disabled={saving}>
                                <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <RowTaskCreateModal
        open={!!taskModalRow}
        row={taskModalRow}
        parentTask={task}
        onClose={() => setTaskModalRow(null)}
        onCreated={() => onIssueRaised?.()}
      />
    </div>
  );
}

export default RowProgressPanel;
