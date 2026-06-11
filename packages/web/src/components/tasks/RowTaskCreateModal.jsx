// components/tasks/RowTaskCreateModal.jsx — quick-create a follow-up task from a
// task row (e.g. an issue found while completing a row, like "broken post bay 15").
// Prefills title/description/block from the originating row + parent task, then
// posts via tasksService.createTask. Stays in place; offers to open the new task.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ClipboardList, Loader2, ExternalLink } from 'lucide-react';
import { tasksService, usersService } from '@vineyard/shared';
import './RowTaskCreateModal.css';

const CATEGORIES = [
  { value: 'vineyard', label: 'Vineyard' },
  { value: 'land_management', label: 'Land Management' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'general', label: 'General' },
];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export default function RowTaskCreateModal({ open, onClose, parentTask, row, onCreated }) {
  const navigate = useNavigate();
  const rowLabel = row?.row_number ? `Row ${row.row_number}` : row ? `#${row.id}` : '';
  const seedIssue = (row?.issues_found || row?.notes || '').trim();
  const originRef = parentTask
    ? `Raised from ${parentTask.title || `Task #${parentTask.id}`}${parentTask.task_number ? ` (${parentTask.task_number})` : ''}, ${rowLabel}`
    : '';

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  // Prefill each time the modal opens for a row.
  useEffect(() => {
    if (!open) return;
    setTitle(seedIssue ? `${rowLabel} — ${seedIssue}` : `${rowLabel} — follow-up`);
    setCategory(parentTask?.task_category || 'general');
    setPriority('medium');
    setDescription([seedIssue, originRef].filter(Boolean).join('\n\n'));
    setScheduledDate('');
    setAssignees([]);
    setError(null);
    setCreated(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  useEffect(() => {
    if (!open) return;
    usersService.getCompanyUsers()
      .then(u => setUsers((Array.isArray(u) ? u : []).filter(x => x.is_active !== false && !x.is_suspended)))
      .catch(() => setUsers([]));
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        task_category: category,
        priority,
        description: description.trim() || null,
        location_notes: originRef || null,
      };
      if (parentTask?.block_id) payload.block_id = parentTask.block_id;
      if (scheduledDate) payload.scheduled_start_date = scheduledDate;
      if (assignees.length) payload.assigned_user_ids = assignees;
      const newTask = await tasksService.createTask(payload);
      setCreated(newTask);
      onCreated?.(newTask);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const toggleAssignee = (id) => {
    setAssignees(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <div className="rtc-backdrop" onClick={onClose}>
      <div className="rtc-modal" onClick={e => e.stopPropagation()}>
        <button className="rtc-close" onClick={onClose} aria-label="Close"><X size={18} /></button>

        {created ? (
          <div className="rtc-success">
            <div className="rtc-success-icon"><ClipboardList size={28} /></div>
            <h3 className="rtc-success-title">Task created</h3>
            <p className="rtc-success-body">{created.title}</p>
            <div className="rtc-actions">
              <button className="rtc-btn" onClick={onClose}>Done</button>
              <button
                className="rtc-btn rtc-btn--accent"
                onClick={() => { onClose(); navigate(`/tasks/${created.id}`); }}
              >
                <ExternalLink size={14} /> Open task
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="rtc-title"><ClipboardList size={18} /> Create task from {rowLabel}</h3>

            <label className="rtc-label" htmlFor="rtc-title">Title</label>
            <input
              id="rtc-title"
              className="rtc-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
            />

            <div className="rtc-grid2">
              <div>
                <label className="rtc-label" htmlFor="rtc-cat">Category</label>
                <select id="rtc-cat" className="rtc-input" value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="rtc-label" htmlFor="rtc-pri">Priority</label>
                <select id="rtc-pri" className="rtc-input" value={priority} onChange={e => setPriority(e.target.value)}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <label className="rtc-label" htmlFor="rtc-desc">Description</label>
            <textarea
              id="rtc-desc"
              className="rtc-textarea"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />

            <label className="rtc-label" htmlFor="rtc-date">Scheduled date (optional)</label>
            <input id="rtc-date" type="date" className="rtc-input" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />

            <label className="rtc-label">Assign to (optional)</label>
            {users.length === 0 ? (
              <p className="rtc-hint">No team members to assign.</p>
            ) : (
              <div className="rtc-assignees">
                {users.map(u => {
                  const checked = assignees.includes(u.id);
                  return (
                    <label key={u.id} className={`rtc-assignee ${checked ? 'checked' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleAssignee(u.id)} />
                      <span>{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || `User #${u.id}`}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {error && <div className="rtc-error">{error}</div>}

            <div className="rtc-actions">
              <button className="rtc-btn" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="rtc-btn rtc-btn--accent" onClick={submit} disabled={saving || !title.trim()}>
                {saving ? <><Loader2 size={14} className="rtc-spin" /> Creating…</> : 'Create task'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
