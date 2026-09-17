// src/pages/Planner.jsx — the admin's own task calendar.
//
// Two views over one fetch: a month grid and an agenda list. Both read the same
// task array, so switching views never refetches and never disagrees with
// itself.
//
// Clicking a chip or a row opens TaskDetail in a drawer. The two actions worth
// doing WITHOUT opening anything stay inline: add a task to a day, and tick one
// off — so the common case never costs a round trip through the drawer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, List, ChevronLeft, ChevronRight, Plus, Check, Loader2,
} from 'lucide-react';

import plannerService from '../services/plannerService';
import AdminLayout from '../components/AdminLayout';
import TaskDetail from '../components/TaskDetail';
import {
  monthGrid, gridRange, monthLabel, addMonths, todayKey, dayLabel,
  duePhrase, dueBucket,
} from '../utils/planDates';
import './planner.css';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const BUCKETS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
  { key: 'undated', label: 'No date' },
];

export default function Planner() {
  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(todayKey());
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [busyIds, setBusyIds] = useState(() => new Set());

  // Which day cell has its quick-add open. One at a time, by design: an
  // always-open input in all 42 cells is a wall of boxes.
  const [addingOn, setAddingOn] = useState(null);
  const [draft, setDraft] = useState('');

  // The task open in the detail drawer, by id. Holding the ID rather than the
  // object means the drawer always reads the current version from `tasks` —
  // a stale copy would show pre-edit values after any list refresh.
  const [openId, setOpenId] = useState(null);
  const [clients, setClients] = useState([]);

  const range = useMemo(() => gridRange(anchor), [anchor]);
  const weeks = useMemo(() => monthGrid(anchor), [anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The agenda shows everything ahead, so it cannot use the grid window.
      const params = view === 'month'
        ? { start: range.start, end: range.end, include_done: showDone }
        : { include_done: showDone };
      const [taskRes, projRes] = await Promise.all([
        plannerService.listTasks(params),
        plannerService.listProjects(),
      ]);
      setTasks(taskRes.tasks || []);
      setProjects(projRes.projects || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load the planner.');
    } finally {
      setLoading(false);
    }
  }, [view, range.start, range.end, showDone]);

  useEffect(() => { load(); }, [load]);

  // Client names for the detail drawer's autocomplete. Loaded once, not per
  // open — the list is small and changes only when a task is saved.
  useEffect(() => {
    plannerService.listClients()
      .then((r) => setClients(r.clients || []))
      .catch(() => { /* autocomplete is a convenience, not a dependency */ });
  }, []);

  // Below 700px the month grid is hidden in CSS — seven columns on a phone is
  // a row of slivers. The VIEW STATE has to follow the stylesheet, or a narrow
  // screen sitting on 'month' renders an empty page with no way back: the
  // toggle is hidden at that width too.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(max-width: 700px)');
    const apply = (e) => { if (e.matches) setView('agenda'); };
    apply(mq);
    // addListener is the pre-2019 Safari spelling; still worth the fallback.
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, []);

  const projectsById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects],
  );

  // Tasks keyed by due date, so a cell is a lookup rather than a filter over
  // the whole array 42 times.
  const byDay = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (!t.due_date) continue;
      (map[t.due_date] ||= []).push(t);
    }
    return map;
  }, [tasks]);

  const buckets = useMemo(() => {
    const map = { overdue: [], today: [], week: [], later: [], undated: [] };
    for (const t of tasks) {
      if (t.status === 'done' && !showDone) continue;
      map[dueBucket(t.due_date)].push(t);
    }
    return map;
  }, [tasks, showDone]);

  const markBusy = (id, on) => setBusyIds((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  async function toggleDone(task) {
    markBusy(task.id, true);
    try {
      const updated = await plannerService.updateTask(task.id, {
        status: task.status === 'done' ? 'todo' : 'done',
      });
      // Replace in place rather than refetching: a reload would reorder the
      // list under the cursor, and the row you just ticked would jump.
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not update that task.');
    } finally {
      markBusy(task.id, false);
    }
  }

  async function quickAdd(dayKey) {
    const title = draft.trim();
    if (!title) { setAddingOn(null); return; }
    try {
      const created = await plannerService.createTask({ title, due_date: dayKey });
      setTasks((prev) => [...prev, created]);
      // Stay open on the same day: adding one task usually means adding two.
      setDraft('');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not add that task.');
    }
  }

  function applyTaskChange(updated) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function removeTask(task) {
    try {
      await plannerService.deleteTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setOpenId(null);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not delete that task.');
    }
  }

  const openTask = tasks.find((t) => t.id === openId) || null;
  const today = todayKey();

  return (
    <AdminLayout
      title="My tasks"
      subtitle="Personal planner — nothing here is visible to anyone else."
    >
    <div className="plan-page">
      <header className="plan-head">
        <div className="plan-actions">
          <div className="plan-viewtoggle" role="tablist" aria-label="View">
            <button
              type="button" role="tab" aria-selected={view === 'month'}
              className={view === 'month' ? 'is-on' : ''}
              onClick={() => setView('month')}
            >
              <CalendarDays size={15} aria-hidden="true" /> Month
            </button>
            <button
              type="button" role="tab" aria-selected={view === 'agenda'}
              className={view === 'agenda' ? 'is-on' : ''}
              onClick={() => setView('agenda')}
            >
              <List size={15} aria-hidden="true" /> Agenda
            </button>
          </div>

          <label className="plan-showdone">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            Show done
          </label>
        </div>
      </header>

      {error && (
        <div className="plan-error" role="alert">
          {error}
          <button type="button" onClick={() => { setError(null); load(); }}>Retry</button>
        </div>
      )}

      {view === 'month' && (
        <div className="plan-monthbar">
          <button type="button" onClick={() => setAnchor(addMonths(anchor, -1))}
                  aria-label="Previous month">
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <h2>{monthLabel(anchor)}</h2>
          <button type="button" onClick={() => setAnchor(addMonths(anchor, 1))}
                  aria-label="Next month">
            <ChevronRight size={17} aria-hidden="true" />
          </button>
          <button type="button" className="plan-today"
                  onClick={() => setAnchor(todayKey())}>
            Today
          </button>
        </div>
      )}

      {loading && (
        <p className="plan-loading">
          <Loader2 size={15} className="plan-spin" aria-hidden="true" /> Loading…
        </p>
      )}

      {!loading && view === 'month' && (
        <div className="plan-grid" role="grid" aria-label={monthLabel(anchor)}>
          <div className="plan-weekdays" role="row">
            {WEEKDAYS.map((d) => (
              <div key={d} role="columnheader" className="plan-weekday">{d}</div>
            ))}
          </div>

          {weeks.map((week) => (
            <div className="plan-week" role="row" key={week[0].key}>
              {week.map((cell) => {
                const dayTasks = byDay[cell.key] || [];
                const visible = showDone
                  ? dayTasks
                  : dayTasks.filter((t) => t.status !== 'done');
                return (
                  <div
                    role="gridcell"
                    key={cell.key}
                    className={[
                      'plan-cell',
                      cell.inMonth ? '' : 'is-out',
                      cell.key === today ? 'is-today' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="plan-cellhead">
                      <span className="plan-daynum">{cell.day}</span>
                      <button
                        type="button"
                        className="plan-addday"
                        aria-label={`Add a task on ${dayLabel(cell.key)}`}
                        onClick={() => { setAddingOn(cell.key); setDraft(''); }}
                      >
                        <Plus size={13} aria-hidden="true" />
                      </button>
                    </div>

                    <div className="plan-chips">
                      {visible.map((t) => (
                        <TaskChip
                          key={t.id}
                          task={t}
                          project={projectsById[t.project_id]}
                          busy={busyIds.has(t.id)}
                          onToggle={() => toggleDone(t)}
                          onOpen={() => setOpenId(t.id)}
                        />
                      ))}
                    </div>

                    {addingOn === cell.key && (
                      <form
                        className="plan-quickadd"
                        onSubmit={(e) => { e.preventDefault(); quickAdd(cell.key); }}
                      >
                        <input
                          autoFocus
                          value={draft}
                          placeholder="Task…"
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => { if (!draft.trim()) setAddingOn(null); }}
                          onKeyDown={(e) => { if (e.key === 'Escape') setAddingOn(null); }}
                        />
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {!loading && view === 'agenda' && (
        <div className="plan-agenda">
          {BUCKETS.map(({ key, label }) => {
            const items = buckets[key];
            if (!items.length) return null;
            return (
              <section key={key} className={`plan-bucket is-${key}`}>
                <h3>
                  {label} <span className="plan-count">{items.length}</span>
                </h3>
                <ul>
                  {items.map((t) => (
                    <li key={t.id}>
                      <AgendaRow
                        task={t}
                        project={projectsById[t.project_id]}
                        busy={busyIds.has(t.id)}
                        onToggle={() => toggleDone(t)}
                        onOpen={() => setOpenId(t.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {Object.values(buckets).every((b) => !b.length) && (
            <p className="plan-empty">
              Nothing scheduled. Add a task from the month view.
            </p>
          )}
        </div>
      )}

      {openTask && (
        <TaskDetail
          task={openTask}
          projects={projects}
          clients={clients}
          onChange={applyTaskChange}
          onDelete={removeTask}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
    </AdminLayout>
  );
}

function TaskChip({ task, project, busy, onToggle, onOpen }) {
  const done = task.status === 'done';
  return (
    <div
      className={`plan-chip u-${task.urgency} ${done ? 'is-done' : ''}`}
      title={task.client ? `${task.title} — ${task.client}` : task.title}
    >
      <button
        type="button"
        className="plan-tick"
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={done}
        disabled={busy}
        onClick={onToggle}
      >
        {done && <Check size={11} aria-hidden="true" />}
      </button>
      <button type="button" className="plan-chiptext" onClick={onOpen}>
        {task.title}
      </button>
      {project && (
        <span
          className="plan-projdot"
          style={{ background: `var(--proj-${project.colour || 'slate'})` }}
          title={project.name}
        />
      )}
      {task.subtask_counts.total > 0 && (
        <span className="plan-subcount">
          {task.subtask_counts.done}/{task.subtask_counts.total}
        </span>
      )}
    </div>
  );
}

function AgendaRow({ task, project, busy, onToggle, onOpen }) {
  const done = task.status === 'done';
  return (
    <div className={`plan-row u-${task.urgency} ${done ? 'is-done' : ''}`}>
      <button
        type="button"
        className="plan-tick"
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={done}
        disabled={busy}
        onClick={onToggle}
      >
        {done && <Check size={12} aria-hidden="true" />}
      </button>

      <div className="plan-rowmain">
        <button type="button" className="plan-rowtitle" onClick={onOpen}>
          {task.title}
        </button>
        <span className="plan-rowmeta">
          {task.client && <span className="plan-client">{task.client}</span>}
          {project && (
            <span className="plan-projtag"
                  style={{ color: `var(--proj-${project.colour || 'slate'})` }}>
              {project.name}
            </span>
          )}
          {task.subtask_counts.total > 0 && (
            <span>{task.subtask_counts.done}/{task.subtask_counts.total} subtasks</span>
          )}
        </span>
      </div>

      <span className="plan-when">
        {task.due_date ? dayLabel(task.due_date) : '—'}
        <em>{duePhrase(task.due_date)}</em>
      </span>
    </div>
  );
}
