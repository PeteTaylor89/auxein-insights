// src/components/TaskDetail.jsx — everything about one task.
//
// Fields save on BLUR, not on every keystroke. A PATCH per character would be
// a request storm and would make the undo history in the notes box useless;
// saving on blur means the moment you leave a field it is durable, with no
// explicit Save button to forget.
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Clock, Check } from 'lucide-react';

import plannerService from '../services/plannerService';
import { formatMinutes, todayKey, duePhrase } from '../utils/planDates';
import PlanDrawer from './PlanDrawer';
import './task-detail.css';

const URGENCIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

export default function TaskDetail({
  task, projects, clients, onChange, onDelete, onClose,
}) {
  const [draft, setDraft] = useState(task);
  const [subDraft, setSubDraft] = useState('');
  const [timeMinutes, setTimeMinutes] = useState('');
  const [timeNote, setTimeNote] = useState('');
  const [timeDate, setTimeDate] = useState(todayKey());
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset when a different task is opened. Without this the drawer keeps the
  // previous task's draft and the first blur writes it onto the new one.
  useEffect(() => {
    setDraft(task);
    setConfirmDelete(false);
    setError(null);
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    plannerService.listTime({ task_id: task.id })
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries || []);
      })
      .catch(() => { /* time is secondary; the task still opens without it */ });
    return () => { cancelled = true; };
  }, [task.id]);

  const patch = async (payload) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await plannerService.updateTask(task.id, payload);
      setDraft(updated);
      onChange(updated);
      return updated;
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save that change.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Only PATCH when the value actually differs from what the server last sent.
  // A blur with nothing typed is the common case and should cost no request.
  const saveIfChanged = (field, value) => {
    const current = task[field] ?? null;
    const next = value === '' ? null : value;
    if (current === next) return;
    patch({ [field]: next });
  };

  async function addSubtask(e) {
    e.preventDefault();
    const title = subDraft.trim();
    if (!title) return;
    setSubDraft('');
    try {
      const updated = await plannerService.addSubtask(task.id, { title });
      setDraft(updated);
      onChange(updated);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not add that subtask.');
    }
  }

  async function toggleSubtask(sub) {
    try {
      const updated = await plannerService.updateSubtask(task.id, sub.id, { done: !sub.done });
      setDraft(updated);
      onChange(updated);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not update that subtask.');
    }
  }

  async function removeSubtask(sub) {
    try {
      await plannerService.deleteSubtask(task.id, sub.id);
      const updated = await plannerService.getTask(task.id);
      setDraft(updated);
      onChange(updated);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not remove that subtask.');
    }
  }

  async function logTime(e) {
    e.preventDefault();
    const minutes = parseInt(timeMinutes, 10);
    if (!minutes || minutes <= 0) return;
    try {
      const entry = await plannerService.logTime({
        task_id: task.id,
        spent_on: timeDate,
        minutes,
        note: timeNote.trim() || null,
      });
      setEntries((prev) => [entry, ...prev]);
      setTimeMinutes('');
      setTimeNote('');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not log that time.');
    }
  }

  async function removeEntry(entry) {
    try {
      await plannerService.deleteTime(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not delete that entry.');
    }
  }

  const totalMinutes = entries.reduce((n, e) => n + e.minutes, 0);
  const subtasks = draft.subtasks || [];

  return (
    <PlanDrawer
      open
      title={draft.title}
      onClose={onClose}
      footer={(
        <>
          <span className="td-savestate">
            {saving ? 'Saving…' : 'Saved'}
          </span>
          {confirmDelete ? (
            <span className="td-confirm">
              Delete this task?
              <button type="button" className="td-danger" onClick={() => onDelete(task)}>
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="td-deletebtn"
                    onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
          )}
        </>
      )}
    >
      {error && <p className="td-error" role="alert">{error}</p>}

      <label className="td-field">
        <span>Title</span>
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={(e) => saveIfChanged('title', e.target.value.trim())}
        />
      </label>

      <div className="td-row">
        <label className="td-field">
          <span>Status</span>
          <select
            value={draft.status}
            onChange={(e) => { setDraft({ ...draft, status: e.target.value });
                               patch({ status: e.target.value }); }}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>

        <label className="td-field">
          <span>Urgency</span>
          <select
            className={`td-urgency u-${draft.urgency}`}
            value={draft.urgency}
            onChange={(e) => { setDraft({ ...draft, urgency: e.target.value });
                               patch({ urgency: e.target.value }); }}
          >
            {URGENCIES.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="td-row">
        <label className="td-field">
          <span>Due date</span>
          <input
            type="date"
            value={draft.due_date || ''}
            onChange={(e) => { setDraft({ ...draft, due_date: e.target.value || null });
                               patch({ due_date: e.target.value || null }); }}
          />
          {draft.due_date && (
            <small className="td-hint">{duePhrase(draft.due_date)}</small>
          )}
        </label>

        <label className="td-field">
          <span>Project</span>
          <select
            value={draft.project_id || ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setDraft({ ...draft, project_id: v });
              patch({ project_id: v });
            }}
          >
            <option value="">— none —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="td-field">
        <span>Client</span>
        {/* A datalist, not a select: the field is free text by design, and a
            datalist suggests without constraining. */}
        <input
          list="td-clients"
          value={draft.client || ''}
          onChange={(e) => setDraft({ ...draft, client: e.target.value })}
          onBlur={(e) => saveIfChanged('client', e.target.value.trim())}
          placeholder="Who is this for?"
        />
        <datalist id="td-clients">
          {clients.map((c) => <option key={c.name} value={c.name} />)}
        </datalist>
      </label>

      <label className="td-field">
        <span>Notes</span>
        <textarea
          rows={5}
          value={draft.notes || ''}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onBlur={(e) => saveIfChanged('notes', e.target.value)}
          placeholder="Anything worth remembering."
        />
      </label>

      <section className="td-section">
        <h3>
          Subtasks
          {subtasks.length > 0 && (
            <span className="td-badge">
              {subtasks.filter((s) => s.done).length}/{subtasks.length}
            </span>
          )}
        </h3>

        <ul className="td-subs">
          {subtasks.map((s) => (
            <li key={s.id} className={s.done ? 'is-done' : ''}>
              <button
                type="button"
                className="td-tick"
                aria-pressed={s.done}
                aria-label={s.done ? `Reopen ${s.title}` : `Complete ${s.title}`}
                onClick={() => toggleSubtask(s)}
              >
                {s.done && <Check size={11} aria-hidden="true" />}
              </button>
              <span>{s.title}</span>
              <button
                type="button"
                className="td-subdel"
                aria-label={`Delete ${s.title}`}
                onClick={() => removeSubtask(s)}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        <form className="td-addsub" onSubmit={addSubtask}>
          <input
            value={subDraft}
            onChange={(e) => setSubDraft(e.target.value)}
            placeholder="Add a subtask"
          />
          <button type="submit" aria-label="Add subtask">
            <Plus size={14} aria-hidden="true" />
          </button>
        </form>
      </section>

      <section className="td-section">
        <h3>
          <Clock size={14} aria-hidden="true" /> Time
          {totalMinutes > 0 && <span className="td-badge">{formatMinutes(totalMinutes)}</span>}
        </h3>

        <form className="td-logtime" onSubmit={logTime}>
          <input
            type="date"
            value={timeDate}
            onChange={(e) => setTimeDate(e.target.value)}
            aria-label="Date worked"
          />
          <input
            type="number"
            min="1"
            max="1440"
            value={timeMinutes}
            onChange={(e) => setTimeMinutes(e.target.value)}
            placeholder="min"
            aria-label="Minutes"
          />
          <input
            value={timeNote}
            onChange={(e) => setTimeNote(e.target.value)}
            placeholder="What did you do?"
            aria-label="Note"
          />
          <button type="submit">Log</button>
        </form>

        {entries.length > 0 && (
          <ul className="td-entries">
            {entries.map((e) => (
              <li key={e.id}>
                <span className="td-entrywhen">{e.spent_on}</span>
                <span className="td-entrymins">{formatMinutes(e.minutes)}</span>
                <span className="td-entrynote">{e.note || ''}</span>
                <button type="button" aria-label="Delete entry"
                        onClick={() => removeEntry(e)}>
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {draft.project_id ? (
          <p className="td-hint">
            Logged here also counts towards this task&rsquo;s project.
          </p>
        ) : (
          <p className="td-hint">
            No project set, so this time will show as unattributed in the summary.
          </p>
        )}
      </section>
    </PlanDrawer>
  );
}
