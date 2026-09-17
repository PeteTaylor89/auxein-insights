// src/pages/Projects.jsx — projects, their hours, and where the time went.
//
// The list answers one question at a glance: how much time has gone into each
// outcome, against what was budgeted. Everything else is behind a drawer.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, Trash2, StickyNote } from 'lucide-react';

import plannerService from '../services/plannerService';
import AdminLayout from '../components/AdminLayout';
import { formatMinutes, dayLabel, todayKey } from '../utils/planDates';
import PlanDrawer from '../components/PlanDrawer';
import './projects.css';

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'done', label: 'Done' },
  { value: 'archived', label: 'Archived' },
];

const COLOURS = ['teal', 'amber', 'plum', 'slate', 'moss', 'clay'];

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projRes, sumRes, clientRes] = await Promise.all([
        plannerService.listProjects(showArchived),
        plannerService.timeSummary(),
        plannerService.listClients(),
      ]);
      setProjects(projRes.projects || []);
      setSummary(sumRes);
      setClients(clientRes.clients || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load projects.');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout
      title="Projects"
      subtitle="Where your time goes, against what you budgeted for it."
    >
    <div className="proj-page">
      <header className="proj-head">
        <div className="proj-actions">
          <label className="proj-showarch">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
          <button type="button" className="proj-new" onClick={() => setCreating(true)}>
            <Plus size={15} aria-hidden="true" /> New project
          </button>
        </div>
      </header>

      {error && <p className="proj-error" role="alert">{error}</p>}

      {summary && (
        <div className="proj-totals">
          <div>
            <span className="proj-bignum">{summary.total_hours}h</span>
            <span className="proj-biglabel">logged, all time</span>
          </div>
          {summary.unattributed_minutes > 0 && (
            <div className="proj-unattributed">
              <span className="proj-bignum">
                {formatMinutes(summary.unattributed_minutes)}
              </span>
              <span className="proj-biglabel">
                not against any project
              </span>
            </div>
          )}
        </div>
      )}

      {loading && (
        <p className="proj-loading">
          <Loader2 size={15} className="proj-spin" aria-hidden="true" /> Loading…
        </p>
      )}

      {!loading && !projects.length && (
        <p className="proj-empty">
          No projects yet. Create one, then assign tasks to it from the task drawer.
        </p>
      )}

      <div className="proj-grid">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onOpen={() => setOpenId(p.id)} />
        ))}
      </div>

      {creating && (
        <ProjectForm
          clients={clients}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}

      {openId && (
        <ProjectDetail
          projectId={openId}
          clients={clients}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
    </AdminLayout>
  );
}

function ProjectCard({ project, onOpen }) {
  const pct = project.pct_of_target;
  return (
    <button type="button" className="proj-card" onClick={onOpen}>
      <span
        className="proj-stripe"
        style={{ background: `var(--proj-${project.colour || 'slate'})` }}
        aria-hidden="true"
      />
      <span className="proj-cardmain">
        <span className="proj-name">{project.name}</span>
        <span className="proj-meta">
          {project.client && <span>{project.client}</span>}
          <span className={`proj-status is-${project.status}`}>
            {STATUSES.find((s) => s.value === project.status)?.label || project.status}
          </span>
        </span>

        <span className="proj-hours">
          <strong>{formatMinutes(project.logged_minutes)}</strong>
          {project.target_hours ? ` of ${project.target_hours}h` : ' logged'}
        </span>

        {project.target_hours ? (
          <span className="proj-bar" aria-hidden="true">
            {/* Capped at 100% so an overrun does not overflow the track; the
                over-budget state is carried by colour instead. */}
            <span
              className={`proj-barfill ${project.over_target ? 'is-over' : ''}`}
              style={{ width: `${Math.min(pct || 0, 100)}%` }}
            />
          </span>
        ) : (
          <span className="proj-notarget">No target set</span>
        )}

        <span className="proj-tasks">
          {project.task_counts.open} open · {project.task_counts.done} done
        </span>
      </span>
    </button>
  );
}

function ProjectForm({ clients, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', client: '', status: 'active', description: '',
    colour: 'teal', target_hours: '', started_on: '', due_on: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await plannerService.createProject({
        name: form.name.trim(),
        client: form.client.trim() || null,
        status: form.status,
        description: form.description || null,
        colour: form.colour,
        target_hours: form.target_hours ? Number(form.target_hours) : null,
        started_on: form.started_on || null,
        due_on: form.due_on || null,
      });
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not create that project.');
      setSaving(false);
    }
  }

  return (
    <PlanDrawer
      open
      title="New project"
      onClose={onClose}
      footer={(
        <>
          <span />
          <button type="submit" form="proj-form" className="proj-save" disabled={saving}>
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </>
      )}
    >
      {error && <p className="td-error" role="alert">{error}</p>}
      <form id="proj-form" onSubmit={submit} className="proj-form">
        <label className="td-field">
          <span>Name</span>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="What is the outcome?"
          />
        </label>

        <label className="td-field">
          <span>Client</span>
          <input
            list="proj-clients"
            value={form.client}
            onChange={(e) => setForm({ ...form, client: e.target.value })}
          />
          <datalist id="proj-clients">
            {clients.map((c) => <option key={c.name} value={c.name} />)}
          </datalist>
        </label>

        <div className="td-row">
          <label className="td-field">
            <span>Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>

          <label className="td-field">
            <span>Target hours</span>
            <input
              type="number" min="0" step="0.5"
              value={form.target_hours}
              onChange={(e) => setForm({ ...form, target_hours: e.target.value })}
              placeholder="optional"
            />
          </label>
        </div>

        <div className="td-row">
          <label className="td-field">
            <span>Starts</span>
            <input type="date" value={form.started_on}
                   onChange={(e) => setForm({ ...form, started_on: e.target.value })} />
          </label>
          <label className="td-field">
            <span>Due</span>
            <input type="date" value={form.due_on}
                   onChange={(e) => setForm({ ...form, due_on: e.target.value })} />
          </label>
        </div>

        <fieldset className="proj-colours">
          <legend>Colour</legend>
          {COLOURS.map((c) => (
            <label key={c} className={form.colour === c ? 'is-on' : ''}>
              <input
                type="radio" name="colour" value={c}
                checked={form.colour === c}
                onChange={() => setForm({ ...form, colour: c })}
              />
              <span style={{ background: `var(--proj-${c})` }} />
              <em>{c}</em>
            </label>
          ))}
        </fieldset>

        <label className="td-field">
          <span>Description</span>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
      </form>
    </PlanDrawer>
  );
}

function ProjectDetail({ projectId, clients, onClose, onChanged }) {
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [timeMinutes, setTimeMinutes] = useState('');
  const [timeNote, setTimeNote] = useState('');
  const [timeDate, setTimeDate] = useState(todayKey());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reload = useCallback(async () => {
    try {
      setProject(await plannerService.getProject(projectId));
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load that project.');
    }
  }, [projectId]);

  useEffect(() => { reload(); }, [reload]);

  const patch = async (payload) => {
    try {
      await plannerService.updateProject(projectId, payload);
      await reload();
      onChanged();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save that change.');
    }
  };

  async function addNote(e) {
    e.preventDefault();
    const body = noteDraft.trim();
    if (!body) return;
    setNoteDraft('');
    try {
      await plannerService.addNote(projectId, body);
      await reload();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not add that note.');
    }
  }

  async function logTime(e) {
    e.preventDefault();
    const minutes = parseInt(timeMinutes, 10);
    if (!minutes) return;
    try {
      await plannerService.logTime({
        project_id: projectId, spent_on: timeDate, minutes,
        note: timeNote.trim() || null,
      });
      setTimeMinutes('');
      setTimeNote('');
      await reload();
      onChanged();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not log that time.');
    }
  }

  if (!project) {
    return (
      <PlanDrawer open title="Project" onClose={onClose}>
        {error ? <p className="td-error">{error}</p> : <p>Loading…</p>}
      </PlanDrawer>
    );
  }

  return (
    <PlanDrawer
      open
      title={project.name}
      onClose={onClose}
      footer={(
        <>
          <span className="td-savestate">
            {formatMinutes(project.logged_minutes)} logged
          </span>
          {confirmDelete ? (
            <span className="td-confirm">
              Delete project?
              <button
                type="button" className="td-danger"
                onClick={async () => {
                  await plannerService.deleteProject(projectId);
                  onChanged();
                  onClose();
                }}
              >
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

      {confirmDelete && (
        <p className="proj-deletewarn">
          Its tasks and time entries are kept — tasks lose their project, and the
          hours stay in the ledger as unattributed. Only the notes below go.
        </p>
      )}

      <div className="td-row">
        <label className="td-field">
          <span>Status</span>
          <select value={project.status} onChange={(e) => patch({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="td-field">
          <span>Target hours</span>
          <input
            type="number" min="0" step="0.5"
            defaultValue={project.target_hours ?? ''}
            onBlur={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value);
              if (v !== project.target_hours) patch({ target_hours: v });
            }}
          />
        </label>
      </div>

      <label className="td-field">
        <span>Client</span>
        <input
          list="projd-clients"
          defaultValue={project.client || ''}
          onBlur={(e) => {
            const v = e.target.value.trim() || null;
            if (v !== project.client) patch({ client: v });
          }}
        />
        <datalist id="projd-clients">
          {clients.map((c) => <option key={c.name} value={c.name} />)}
        </datalist>
      </label>

      <label className="td-field">
        <span>Description</span>
        <textarea
          rows={3}
          defaultValue={project.description || ''}
          onBlur={(e) => {
            const v = e.target.value || null;
            if (v !== project.description) patch({ description: v });
          }}
        />
      </label>

      {project.target_hours && (
        <p className="proj-progressline">
          {project.logged_hours}h of {project.target_hours}h
          {project.over_target
            ? ` — ${(project.logged_hours - project.target_hours).toFixed(1)}h over`
            : ` — ${project.pct_of_target}%`}
        </p>
      )}

      <section className="td-section">
        <h3><StickyNote size={14} aria-hidden="true" /> Notes</h3>
        <form className="td-addsub" onSubmit={addNote}>
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note"
          />
          <button type="submit" aria-label="Add note">
            <Plus size={14} aria-hidden="true" />
          </button>
        </form>

        <ul className="proj-notes">
          {project.notes_journal.map((n) => (
            <li key={n.id}>
              <span className="proj-notewhen">
                {dayLabel(n.created_at.slice(0, 10))}
              </span>
              <span className="proj-notebody">{n.body}</span>
              <button
                type="button" aria-label="Delete note"
                onClick={async () => {
                  await plannerService.deleteNote(projectId, n.id);
                  reload();
                }}
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {!project.notes_journal.length && (
          <p className="td-hint">No notes yet.</p>
        )}
      </section>

      <section className="td-section">
        <h3>Time</h3>
        <form className="td-logtime" onSubmit={logTime}>
          <input type="date" value={timeDate} aria-label="Date worked"
                 onChange={(e) => setTimeDate(e.target.value)} />
          <input type="number" min="1" max="1440" value={timeMinutes} placeholder="min"
                 aria-label="Minutes"
                 onChange={(e) => setTimeMinutes(e.target.value)} />
          <input value={timeNote} placeholder="What did you do?" aria-label="Note"
                 onChange={(e) => setTimeNote(e.target.value)} />
          <button type="submit">Log</button>
        </form>

        <ul className="td-entries">
          {project.time_entries.map((e) => (
            <li key={e.id}>
              <span className="td-entrywhen">{e.spent_on}</span>
              <span className="td-entrymins">{formatMinutes(e.minutes)}</span>
              <span className="td-entrynote">{e.note || ''}</span>
              <button
                type="button" aria-label="Delete entry"
                onClick={async () => {
                  await plannerService.deleteTime(e.id);
                  await reload();
                  onChanged();
                }}
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="td-section">
        <h3>Tasks <span className="td-badge">{project.tasks.length}</span></h3>
        <ul className="proj-tasklist">
          {project.tasks.map((t) => (
            <li key={t.id} className={t.status === 'done' ? 'is-done' : ''}>
              <span className={`proj-taskdot u-${t.urgency}`} aria-hidden="true" />
              <span>{t.title}</span>
              <span className="proj-taskdue">
                {t.due_date ? dayLabel(t.due_date) : '—'}
              </span>
            </li>
          ))}
        </ul>
        {!project.tasks.length && (
          <p className="td-hint">
            No tasks yet. Assign one from its detail drawer in My tasks.
          </p>
        )}
      </section>
    </PlanDrawer>
  );
}
