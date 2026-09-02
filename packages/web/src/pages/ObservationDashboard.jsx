import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { ClipboardList, PlayCircle, Plus, Filter, ArrowRight, FileText, CheckCircle, XCircle, Rocket, Eye, Edit, Trash2, Calendar, Clock, MapPin, Zap, ListChecks, X, Wrench, Sparkles, CheckSquare, Square, Users, Layers, GripVertical, ChevronDown, ChevronRight } from 'lucide-react';
import { observationService, usersService, authService, tasksService, contractorManagementService, reportService, useAuth } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import HelpTip from '../components/HelpTip';
import { useToast } from '../components/ToastProvider';
import './ObservationDashboard.css';
import { TaskTemplateCard, TaskTemplatePreviewModal, TaskStatusBadge } from '@/components/TaskManagement';
import { getInsightTarget, insightSearchParams } from '../utils/observationInsight';
import { usePersistentState, usePersistentSet, usePruneToOptions } from '../hooks/usePersistentState';


function readTemplateFields(tpl) {
  if (!tpl) return [];
  const s = tpl.field_schema ?? tpl.fields_json ?? tpl.schema?.fields ?? tpl.schema ?? [];
  return Array.isArray(s) ? s : Array.isArray(s.fields) ? s.fields : [];
}

const VALID_TABS = ['runs', 'templates', 'tasks', 'task-templates'];

export default function ObservationDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'tasks';
  const [tab, setTab] = useState(initialTab);

  // Keep tab in sync with URL (back button + deep links)
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (VALID_TABS.includes(urlTab) && urlTab !== tab) {
      setTab(urlTab);
    }
  }, [searchParams]);

  const switchTab = (next) => {
    setTab(next);
    setSearchParams(next === 'tasks' ? {} : { tab: next }, { replace: true });
  };

  const StatusBadge = ({ status }) => {
    const colors = {
      "in progress": { bg: 'var(--color-info-bg)', color: 'var(--color-info)' },
      "complete": { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
      "not started": { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
      "scheduled": { bg: 'var(--color-info-bg)', color: 'var(--color-info)' },
      "cancelled": { bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
      "active": { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
    };
    const s = colors[status] || { bg: 'var(--color-olive-light)', color: 'var(--color-primary)' };
    return (
      <span style={{
        background: s.bg, color: s.color,
        padding: '2px 10px', borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--font-size-xs)', fontWeight: '600',
        whiteSpace: 'nowrap',
      }}>
        {status?.replace('_', ' ')}
      </span>
    );
  };

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  return (
    <div className="page-container" style={{ paddingTop: 'var(--space-base)' }}>

      {/* Quick Actions */}
      <div className="stats-container">
        <div className="container-title">
          <span>Quick Actions</span>
        </div>
        <div className="stats-grid">
          <Link to="/tasks/new" className="stat-card">
            <div className="icon-wrapper"><Zap size={24} /></div>
            <div className="actions-title">Quick Create Task</div>
          </Link>
          <Link to="/tasks/templates/new" className="stat-card">
            <div className="icon-wrapper"><FileText size={24} /></div>
            <div className="actions-title">Create Task Template</div>
          </Link>
          <Link to="/observations/quick" className="stat-card">
            <div className="icon-wrapper"><Eye size={24} /></div>
            <div className="actions-title">Quick Observation</div>
          </Link>
          <Link to="/observations/schedule" className="stat-card">
            <div className="icon-wrapper"><ClipboardList size={24} /></div>
            <div className="actions-title">Schedule Observation</div>
          </Link>
        </div>
      </div>

      {/* Tab Navigation — Asset-style button tabs */}
      <div className="od-tab-card">
        <div className="od-tab-bar">
          <button className={`od-tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => switchTab('tasks')}>
            <ClipboardList size={16} /> Task Management
          </button>
          <button className={`od-tab ${tab === 'task-templates' ? 'active' : ''}`} onClick={() => switchTab('task-templates')}>
            <FileText size={16} /> Task Templates
          </button>
          <button className={`od-tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => switchTab('templates')}>
            <ListChecks size={16} /> Observation Templates
          </button>
          <button className={`od-tab ${tab === 'runs' ? 'active' : ''}`} onClick={() => switchTab('runs')}>
            <Rocket size={16} /> Observation Management
          </button>
        </div>

        <div className="od-tab-content">
          {tab === 'tasks' && <TasksTab StatusBadge={StatusBadge} />}
          {tab === 'task-templates' && <TaskTemplatesTab />}
          {tab === 'templates' && <TemplatesTab />}
          {tab === 'runs' && <ManagementTab StatusBadge={StatusBadge} />}
        </div>
      </div>

      <MobileNavigation />
    </div>
  );
}

function TemplatePreviewModal({ open, template, onClose }) {
  if (!open || !template) return null;
  
  const fields = readTemplateFields(template);

  useEffect(() => {
    if (!open) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    const originalOverflow = document.body.style.overflow;
    
    document.addEventListener('keydown', handleEscape);
   
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalContent = (
    <div role="dialog" aria-modal="true" className="od-modal-overlay" onClick={handleBackdropClick}>
      <div className="od-modal" onClick={(e) => e.stopPropagation()}>
        <div className="od-modal-header">
          <h3>{template.name} Template</h3>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <div className="card--warm" style={{ padding: 'var(--space-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)', fontWeight: 600 }}>Scope</div>
            <div style={{ fontSize: 'var(--font-size-sm)' }}><strong>Template:</strong> {template.type || template.observation_type}</div>
            <div style={{ fontSize: 'var(--font-size-sm)' }}><strong>Owner:</strong> {template.company_id ? 'Company' : 'Global'}</div>
          </div>
          <div className="card--warm" style={{ padding: 'var(--space-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 'var(--font-size-sm)' }}><strong>Note:</strong> GPS location, date/time, and user are captured automatically for all runs.</div>
          </div>
        </div>

        <h4 style={{ margin: '0 0 var(--space-md)', fontSize: 'var(--font-size-md)', fontWeight: 700 }}>Fields</h4>
        <div className="od-table-wrap">
          <table className="od-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 && (
                <tr><td colSpan={2} className="od-loading">No fields defined.</td></tr>
              )}
              {fields.map((f, i) => (
                <tr key={f.name ?? i}>
                  <td className="bold">{f.label || '—'}</td>
                  <td>{f.required ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// Run status is a fixed vocabulary, unlike blocks/templates/assignees which are
// derived from the data. Hoisted so the chips and the stale-value prune below
// can't drift apart.
const RUN_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
];

function ManagementTab({ StatusBadge }) {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // The run awaiting a delete confirmation, or null.
  const [deleting, setDeleting] = useState(null);
  // The run whose figures are expanded, or null. One at a time — the row is
  // wide and two open summaries push the table off the screen.
  const [expandedRun, setExpandedRun] = useState(null);
  const toast = useToast();
  // The counts endpoint is `reports:read`, which stops at manager. Everyone
  // else still sees the run list; they just get no Figures button, rather than
  // one that always 403s.
  const { hasPermission } = useAuth();
  const canSeeReports = hasPermission('reports', 'read');

  // Filters (beta: "Observation Management — a few filters here would go a long
  // way"). Client-side over the already-loaded run list, matching how TasksTab
  // filters: the run count per company is small and it keeps this instant.
  // Persisted per user + company, so the view you left is the view you come back
  // to. Search stays transient — see the note in TasksTab.
  const [statusFilter, setStatusFilter] = usePersistentSet('observations.filter.status');
  const [blockFilter, setBlockFilter] = usePersistentSet('observations.filter.block');
  const [templateFilter, setTemplateFilter] = usePersistentSet('observations.filter.template');
  const [assigneeFilter, setAssigneeFilter] = usePersistentSet('observations.filter.assignee');
  const [searchQuery, setSearchQuery] = useState('');
  // Open on arrival if filters were restored, so a filtered table always shows
  // the chips explaining why — a count badge over a collapsed panel doesn't.
  const [filtersOpen, setFiltersOpen] = useState(() =>
    statusFilter.size + blockFilter.size + templateFilter.size + assigneeFilter.size > 0);

  const reload = async () => {
    try {
      setLoading(true);
      const res = await observationService.listRuns({ company_id: companyId }).catch(() => []);
      setRuns(Array.isArray(res) ? res : res?.items || []);
    } catch (e) {
      console.error(e);
      setError('Failed to load observations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [companyId]);

  const beginRun = async (run) => {
    try {
      setBusyId(run.id);
      const started = await observationService.beginRun(run.id);
      if (started?.id) navigate(`/observations/runcapture/${started.id}`);
    } catch (e) {
      console.error('Failed to start observation:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to start observation';
      alert(`Could not start observation:\n${Array.isArray(detail) ? detail[0]?.msg || detail : detail}`);
    } finally {
      setBusyId(null);
    }
  };

  // Deleting a run takes every spot recorded in it, cascaded in the database
  // and unrecoverable. So the confirm names the count rather than asking "are
  // you sure?" about a number nobody has seen. `spots_count` already comes back
  // on the run list, so the dialog costs no extra request.
  //
  // `force` is sent because the dialog IS the confirmation the server is
  // demanding — without it the API refuses any run holding spots. Never call
  // this straight off a button.
  const confirmDelete = async () => {
    const run = deleting;
    if (!run) return;
    try {
      setBusyId(run.id);
      await observationService.deleteRun(run.id, { force: true });
      setDeleting(null);
      toast.success(`Deleted "${run.template_name || `Run ${run.id}`}"`);
      await reload();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not delete that observation run');
    } finally {
      setBusyId(null);
    }
  };

  // Distinct option lists, derived from the loaded runs so they only ever offer
  // values that actually exist.
  const uniqueSorted = (values) =>
    [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'en-NZ', { numeric: true }));

  const blockOptions = uniqueSorted(runs.map(r => r.block_name));
  const templateOptions = uniqueSorted(runs.map(r => r.template_name));
  const assigneeOptions = uniqueSorted(runs.map(r => r.assigned_to_user_name));

  // A restored filter can outlive what it points at — a deleted template, a
  // block renamed. Prune once the runs are loaded, so a stale value can't filter
  // the table to nothing with no chip on screen to unclick.
  const runsReady = !loading && runs.length > 0;
  usePruneToOptions(setStatusFilter, RUN_STATUS_OPTIONS.map(o => o.value), true);
  usePruneToOptions(setBlockFilter, blockOptions, runsReady);
  usePruneToOptions(setTemplateFilter, templateOptions, runsReady);
  usePruneToOptions(setAssigneeFilter, ['__unassigned__', ...assigneeOptions], runsReady);

  const toggleIn = (setter) => (value) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  const filteredRuns = runs.filter(r => {
    if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
    if (blockFilter.size > 0 && !blockFilter.has(r.block_name)) return false;
    if (templateFilter.size > 0 && !templateFilter.has(r.template_name)) return false;
    if (assigneeFilter.size > 0) {
      // 0 stands for "unassigned" — a run with no assignee has no name to match.
      const unassignedWanted = assigneeFilter.has('__unassigned__');
      if (r.assigned_to_user_name) {
        if (!assigneeFilter.has(r.assigned_to_user_name)) return false;
      } else if (!unassignedWanted) {
        return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay = [r.template_name, r.block_name, r.assigned_to_user_name]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalActiveFilters =
    statusFilter.size + blockFilter.size + templateFilter.size + assigneeFilter.size;

  const clearAllFilters = () => {
    setStatusFilter(new Set());
    setBlockFilter(new Set());
    setTemplateFilter(new Set());
    setAssigneeFilter(new Set());
    setSearchQuery('');
  };

  if (loading) return <div className="od-loading">Loading observations...</div>;
  if (error) return <div className="od-error">{error}</div>;

  return (
    <div>
      <div className="od-tab-header">
        <span className="help-tip-head">
          <h2>
            Observation Management ({filteredRuns.length}
            {filteredRuns.length !== runs.length ? ` of ${runs.length}` : ''})
          </h2>
          <HelpTip topic="obs.runs" />
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="od-btn od-btn--primary" onClick={() => navigate('/observations/schedule')}>
            <Plus size={14} /> Schedule Observation
          </button>
        </div>
      </div>

      {runs.length > 0 && (
        <div className="od-filters-panel">
          <div className="od-filters-top">
            <button
              type="button"
              className="od-filters-title od-filters-toggle"
              onClick={() => setFiltersOpen(o => !o)}
              aria-expanded={filtersOpen}
            >
              <Filter size={14} /> Filters
              {totalActiveFilters > 0 && <span className="od-filters-badge">{totalActiveFilters}</span>}
              <span className={`od-filters-chevron ${filtersOpen ? 'od-filters-chevron--open' : ''}`}>
                {filtersOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </span>
            </button>
            <input
              className="od-filter-input"
              type="text"
              placeholder="Search by template, block or assignee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {(totalActiveFilters > 0 || searchQuery) && (
              <button type="button" className="od-btn od-btn--ghost" onClick={clearAllFilters}>
                <X size={12} /> Clear
              </button>
            )}
          </div>

          {filtersOpen && (
            <>
              <FilterChipGroup
                label="Status"
                options={RUN_STATUS_OPTIONS}
                selected={statusFilter}
                onToggle={toggleIn(setStatusFilter)}
              />
              {blockOptions.length > 0 && (
                <FilterChipGroup
                  label="Block"
                  options={blockOptions.map(b => ({ value: b, label: b }))}
                  selected={blockFilter}
                  onToggle={toggleIn(setBlockFilter)}
                />
              )}
              {templateOptions.length > 0 && (
                <FilterChipGroup
                  label="Template"
                  options={templateOptions.map(t => ({ value: t, label: t }))}
                  selected={templateFilter}
                  onToggle={toggleIn(setTemplateFilter)}
                />
              )}
              <FilterChipGroup
                label="Assignee"
                options={[
                  { value: '__unassigned__', label: 'Unassigned' },
                  ...assigneeOptions.map(a => ({ value: a, label: a })),
                ]}
                selected={assigneeFilter}
                onToggle={toggleIn(setAssigneeFilter)}
              />
            </>
          )}
        </div>
      )}

      {filteredRuns.length > 0 ? (
        <div className="od-table-wrap">
          <table className="od-table od-runs-table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Block</th>
                <th>Assignee</th>
                <th className="center od-runs-fit">Scheduled</th>
                <th className="center od-runs-fit">Status</th>
                <th className="center od-runs-fit">Started</th>
                <th className="center od-runs-fit">Completed</th>
                <th className="od-runs-fit">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map(r => {
                const status = r.status; // computed by backend: scheduled | in progress | complete
                const insightTarget = getInsightTarget(r);
                const insightsParams = insightSearchParams(insightTarget);
                // Only a run that recorded something has figures to show.
                const canSummarise = !!r.count_metric && r.spots_count > 0 && canSeeReports;
                const isOpen = expandedRun === r.id;
                return (
                  <Fragment key={r.id}>
                  <tr>
                    <td className="bold">{r.template_name || `Template #${r.template_id}`}</td>
                    <td>{r.block_name || '—'}</td>
                    <td>
                      {r.assigned_to_user_name
                        ? r.assigned_to_user_name
                        : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                    </td>
                    <td className="center od-runs-date">
                      {r.scheduled_date ? dayjs(r.scheduled_date).format('DD MMM') : '—'}
                    </td>
                    <td className="center"><StatusBadge status={status} /></td>
                    <td className="center od-runs-date">
                      {r.observed_at_start ? dayjs(r.observed_at_start).format('DD MMM HH:mm') : '—'}
                    </td>
                    <td className="center od-runs-date">
                      {r.observed_at_end ? dayjs(r.observed_at_end).format('DD MMM HH:mm') : '—'}
                    </td>
                    <td className="right">
                      <div className="od-actions od-actions-runs">
                        {status === 'scheduled' && (
                          <button
                            className="od-btn od-btn--primary"
                            onClick={() => beginRun(r)}
                            disabled={busyId === r.id}
                          >
                            <PlayCircle size={14} /> {busyId === r.id ? 'Starting...' : 'Start'}
                          </button>
                        )}
                        {status === 'in progress' && (
                          <button
                            className="od-btn od-btn--primary"
                            onClick={() => navigate(`/observations/runcapture/${r.id}`)}
                          >
                            Continue <ArrowRight size={14} />
                          </button>
                        )}
                        {status === 'complete' && (
                          <button
                            className="od-btn od-btn--ghost"
                            onClick={() => navigate(`/observations/runcapture/${r.id}`)}
                          >
                            <Eye size={14} /> View
                          </button>
                        )}
                        {canSummarise && (
                          <button
                            className="od-btn od-btn--ghost"
                            onClick={() => setExpandedRun(isOpen ? null : r.id)}
                            title={isOpen ? 'Hide the figures' : 'Show what this run found'}
                          >
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Figures
                          </button>
                        )}
                        {insightsParams && status !== 'scheduled' && (
                          <button
                            className="od-btn od-btn--ghost"
                            onClick={() => navigate(`/Insights?${insightsParams}`)}
                            title={`Open ${insightTarget.label} in Insights`}
                          >
                            <Sparkles size={14} /> {insightTarget.label}
                          </button>
                        )}
                        {/* Delete is admin-only server-side; the button is
                            shown to everyone who can see the row and the API
                            answers 403 otherwise, rather than the page
                            pretending the action does not exist. */}
                        <button
                          className="od-btn od-btn--danger"
                          onClick={() => setDeleting(r)}
                          disabled={busyId === r.id}
                          title="Delete this run and everything recorded in it"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="od-run-summary-row">
                      <td colSpan={8}>
                        <RunCountSummary runId={r.id} metric={r.count_metric} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="od-empty">
          {runs.length > 0 ? (
            <>
              <div className="od-empty-text">No observations match those filters</div>
              <button className="od-btn od-btn--ghost" onClick={clearAllFilters}>
                <X size={14} /> Clear filters
              </button>
            </>
          ) : (
            <>
              <div className="od-empty-text">No observations yet</div>
              <button className="btn-primary" onClick={() => navigate('/observations/schedule')}>
                <Plus size={16} /> Schedule the first one
              </button>
            </>
          )}
        </div>
      )}

      {/* Named, counted and irreversible — in that order. A confirm that says
          "are you sure?" gets clicked through; one that says "30 recorded spots
          will be deleted" does not. */}
      {deleting && createPortal(
        <div className="od-modal-overlay" onClick={() => setDeleting(null)}>
          <div className="od-modal od-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="od-modal-header">
              <h3>Delete this observation run?</h3>
              <button className="od-btn od-btn--ghost" onClick={() => setDeleting(null)}>
                <X size={16} />
              </button>
            </div>
            <p className="od-confirm-body">
              <strong>{deleting.template_name || `Run ${deleting.id}`}</strong>
              {deleting.block_name ? <> on <strong>{deleting.block_name}</strong></> : null}
              {deleting.scheduled_date
                ? <>, scheduled {dayjs(deleting.scheduled_date).format('D MMM YYYY')}</>
                : null}.
            </p>
            {deleting.spots_count > 0 ? (
              <p className="od-confirm-warn">
                This run holds <strong>{deleting.spots_count} recorded spot
                {deleting.spots_count === 1 ? '' : 's'}</strong>. They will be deleted with it and
                cannot be recovered.
              </p>
            ) : (
              <p className="od-confirm-body">Nothing has been recorded in it yet.</p>
            )}
            <p className="od-confirm-body">
              To keep the record but stop the work, cancel the run instead.
            </p>
            <div className="od-confirm-actions">
              <button className="od-btn od-btn--ghost" onClick={() => setDeleting(null)}>
                Keep it
              </button>
              <button
                className="od-btn od-btn--danger"
                onClick={confirmDelete}
                disabled={busyId === deleting.id}
              >
                <Trash2 size={14} />
                {busyId === deleting.id ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}


/**
 * What one run found — the SAME figures as the Counts report, from the same
 * endpoint with `run_id` set.
 *
 * Deliberately not a second calculation. A run summary that disagreed with the
 * report it links to would be worse than not having one, and the two would
 * drift the first time the weighting or the suppression rule changed.
 */
function RunCountSummary({ runId, metric }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let mounted = true;
    setState('loading');
    reportService.getCountSummary(metric, undefined, undefined, undefined, runId)
      .then((res) => { if (mounted) { setData(res); setState('ready'); } })
      .catch(() => { if (mounted) setState('failed'); });
    return () => { mounted = false; };
  }, [runId, metric]);

  if (state === 'loading') return <div className="od-run-summary">Loading figures...</div>;
  if (state === 'failed' || !data) {
    return <div className="od-run-summary">Could not load the figures for this run.</div>;
  }

  const o = data.overall;
  const num = (n, dp = 2) => (n === null || n === undefined ? '—' : Number(n).toFixed(dp));

  return (
    <div className="od-run-summary">
      <div className="od-run-summary-figures">
        <div className="od-run-figure">
          <div className="od-run-figure-value">{o.spots}</div>
          <div className="od-run-figure-label">Spots</div>
        </div>
        <div className="od-run-figure">
          <div className="od-run-figure-value">{num(o.vines_sampled, 0)}</div>
          <div className="od-run-figure-label">Vines sampled</div>
        </div>
        <div className="od-run-figure">
          <div className="od-run-figure-value">{num(o.mean)}</div>
          <div className="od-run-figure-label">Mean{data.unit ? ` ${data.unit}` : ''}</div>
        </div>
        <div className="od-run-figure">
          {/* A dash is the report working. `sd_note` below says why. */}
          <div className="od-run-figure-value">{num(o.sd)}</div>
          <div className="od-run-figure-label">
            Spread{o.sd_basis ? ` (${o.sd_basis})` : ''}
          </div>
        </div>
        <div className="od-run-figure">
          <div className="od-run-figure-value">
            {o.cv_percent === null || o.cv_percent === undefined ? '—' : `${o.cv_percent}%`}
          </div>
          <div className="od-run-figure-label">CV</div>
        </div>
        <div className="od-run-figure">
          <div className="od-run-figure-value">
            {o.percent_of_target === null || o.percent_of_target === undefined
              ? '—'
              : `${o.percent_of_target}%`}
          </div>
          <div className="od-run-figure-label">
            Of target{o.target ? ` (${num(o.target)})` : ''}
          </div>
        </div>
        <div className="od-run-figure">
          <div className="od-run-figure-value">
            {num(o.min, 0)} – {num(o.max, 0)}
          </div>
          <div className="od-run-figure-label">Range</div>
        </div>
      </div>
      {o.sd_note && <div className="od-run-summary-note">{o.sd_note}</div>}
    </div>
  );
}


function TemplatesTab() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await observationService.getTemplates?.({ include_system: true }).catch(() => []);
        if (!mounted) return;
        setTemplates(Array.isArray(res) ? res : res?.items || []);
      } catch (e) {
        console.error(e);
        setError('Failed to load templates');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const labelFor = (t) => (t?.company_id ? 'Company Template' : 'Global Template');
  const onViewTemplate = (tpl) => { setPreviewTemplate(tpl); setPreviewOpen(true); };

  if (loading) return <div className="od-loading">Loading templates...</div>;
  if (error) return <div className="od-error">{error}</div>;

  return (
    <div>
      <div className="od-tab-header">
        <span className="help-tip-head"><h2>Observation Templates ({templates.length})</h2><HelpTip topic="obs.templates" /></span>
        <button className="od-btn od-btn--primary" onClick={() => navigate('/observations/templates/new')}>
          <Plus size={14} /> New Template
        </button>
      </div>

      {templates.length > 0 ? (
        <div className="od-card-grid">
          {templates.map(t => (
            <div key={t.id ?? t.name} className="od-card">
              <div className="od-card-header">
                <FileText size={18} />
                <span className="od-card-title">{t.name || `Template #${t.id}`}</span>
              </div>
              <div className="od-card-badge">{labelFor(t)}</div>
              <div className="od-card-actions">
                <button className="od-btn od-btn--primary" onClick={() => navigate(`/observations/schedule?template=${t.id}`)} title="Schedule an observation with this template">
                  <Plus size={14} /> Use Template
                </button>
                <button className="od-btn od-btn--ghost" onClick={() => onViewTemplate(t)} title="View fields">
                  View
                </button>
                {/* Global templates are shared across companies — the API rejects
                    edits to them (company_id is null), so don't offer it. */}
                {t.company_id && (
                  <button
                    className="od-btn od-btn--ghost"
                    onClick={() => navigate(`/observations/templates/${t.id}/edit`)}
                    title="Edit this template"
                  >
                    <Edit size={14} /> Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="od-empty">
          <div className="od-empty-text">No templates available</div>
        </div>
      )}

      <TemplatePreviewModal
        open={previewOpen}
        template={previewTemplate}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
} 
      
function TaskTemplatesTab() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeOnly, setActiveOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const params = {};
        if (categoryFilter !== 'all') {
          params.task_category = categoryFilter;
        }
        if (activeOnly) {
          params.is_active = true;
        }

        const res = await tasksService.getTemplates?.(params).catch(() => []);
        if (!mounted) return;
        setTemplates(Array.isArray(res) ? res : res?.items || []);
      } catch (e) {
        console.error(e);
        setError('Failed to load templates');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [categoryFilter, activeOnly]);

  const onViewTemplate = (tpl) => {
    setPreviewTemplate(tpl);
    setPreviewOpen(true);
  };

  // Filter templates by search
  const filteredTemplates = templates.filter(template => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      template.name.toLowerCase().includes(query) ||
      template.task_category.toLowerCase().includes(query) ||
      template.task_subcategory?.toLowerCase().includes(query)
    );
  });

  if (loading) return <div className="od-loading">Loading templates...</div>;
  if (error) return <div className="od-error">{error}</div>;

  return (
    <div>
      <div className="od-tab-header">
        <span className="help-tip-head"><h2>Task Templates ({filteredTemplates.length})</h2><HelpTip topic="obs.taskTemplates" /></span>
      </div>

      <div className="od-filters">
        <details>
          <summary><Filter size={14} /> Filters</summary>
          <div className="od-filter-row">
            <input className="od-filter-input" type="text" placeholder="Search templates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <select className="od-filter-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              <option value="vineyard">Vineyard</option>
              <option value="land_management">Land Management</option>
              <option value="compliance">Compliance</option>
              <option value="general">General</option>
            </select>
            <label className="od-filter-checkbox">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
              Active only
            </label>
          </div>
        </details>
      </div>

      {filteredTemplates.length > 0 ? (
        <div className="od-card-grid">
          {filteredTemplates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onView={onViewTemplate}
              onEdit={(tpl) => navigate(`/tasks/templates/${tpl.id}/edit`)}
              onUse={(tpl) => navigate(`/tasks/new?template=${tpl.id}`)}
              onToggleActive={async (tpl) => {
                const next = !tpl.is_active;
                const verb = next ? 'reactivate' : 'retire';
                if (!window.confirm(`${verb[0].toUpperCase() + verb.slice(1)} template "${tpl.name}"?`)) return;
                try {
                  await tasksService.updateTemplate?.(tpl.id, { is_active: next });
                  setTemplates(prev => prev.map(x => x.id === tpl.id ? { ...x, is_active: next } : x));
                } catch (err) {
                  console.error('Toggle template active failed:', err);
                  alert(err.response?.data?.detail || `Failed to ${verb} template`);
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div className="od-empty">
          <div className="od-empty-text">{searchQuery ? 'No templates match your search' : 'No templates available'}</div>
        </div>
      )}

      {/* Preview Modal - Will add in next package */}
      {previewOpen && previewTemplate && (
        <TaskTemplatePreviewModal
          open={previewOpen}
          template={previewTemplate}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

// Template Card Component - Matches observation card styling
function TemplateCard({ template, onView, onEdit, onUse, onToggleActive }) {
  const categoryLabels = { vineyard: 'Vineyard', land_management: 'Land Management', compliance: 'Compliance', general: 'General' };
  const categoryLabel = categoryLabels[template.task_category] || template.task_category;
  const equipCount = template.required_equipment_ids?.length || 0;
  const consumCount = template.required_consumables?.length || 0;

  return (
    <div className="od-card">
      <div className="od-card-header">
        <span className="od-card-title">{template.name}</span>
        {!template.is_active && <span className="badge">Inactive</span>}
        {template.quick_create_enabled && template.is_active && <span className="badge" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>Quick</span>}
      </div>
      <div className="od-card-badge">
        {categoryLabel}{template.task_subcategory && ` · ${template.task_subcategory}`}
      </div>
      {template.description && <div className="od-task-card-desc">{template.description}</div>}
      {(equipCount > 0 || consumCount > 0) && (
        <div className="od-task-card-meta">
          {equipCount > 0 && (
            <span title="Required equipment"><Wrench size={12} /> {equipCount} equipment</span>
          )}
          {consumCount > 0 && (
            <span title="Required consumables">{consumCount} consumable{consumCount === 1 ? '' : 's'}</span>
          )}
        </div>
      )}
      <div className="od-card-actions">
        <button className="od-btn od-btn--primary" onClick={() => onUse(template)} disabled={!template.is_active} style={{ opacity: template.is_active ? 1 : 0.5 }}>
          <Plus size={14} /> Use Template
        </button>
        <button className="od-btn od-btn--ghost" onClick={() => onView(template)}>View</button>
        <button className="od-btn od-btn--ghost od-btn--icon" onClick={() => onEdit(template)} title="Edit template"><Edit size={12} /></button>
        {onToggleActive && (
          <button
            className="od-btn od-btn--ghost"
            onClick={() => onToggleActive(template)}
            title={template.is_active ? 'Retire template' : 'Reactivate template'}
          >
            {template.is_active ? <><XCircle size={12} /> Retire</> : <><CheckCircle size={12} /> Reactivate</>}
          </button>
        )}
      </div>
    </div>
  );
}

// Multi-select filter chip group
function FilterChipGroup({ label, options, selected, onToggle }) {
  return (
    <div className="od-chip-group">
      <span className="od-chip-group-label">{label}</span>
      <div className="od-chip-row">
        {options.map(opt => {
          const isActive = selected.has(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={`od-chip ${isActive ? 'active' : ''}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TaskFilters({
  searchQuery, setSearchQuery,
  statusFilter, setStatusFilter,
  categoryFilter, setCategoryFilter,
  priorityFilter, setPriorityFilter,
  locationFilter, setLocationFilter,
  assigneeFilter, setAssigneeFilter,
  contractorFilter, setContractorFilter,
  locationOptions, assigneeOptions, contractorOptions,
  totalActive, onClear,
}) {
  // Collapsed by default; auto-expand when any chip filter is active so users
  // never lose sight of why the table is filtered.
  const [open, setOpen] = useState(totalActive > 0);
  useEffect(() => {
    if (totalActive > 0) setOpen(true);
  }, [totalActive]);

  const toggleIn = (setter) => (value) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const categoryOptions = [
    { value: 'vineyard', label: 'Vineyard' },
    { value: 'land_management', label: 'Land Mgmt' },
    { value: 'compliance', label: 'Compliance' },
    { value: 'general', label: 'General' },
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
  ];

  const locationChipOptions = locationOptions.map(loc => ({ value: loc, label: loc }));
  const assigneeChipOptions = [
    { value: 0, label: 'Unassigned' },
    ...assigneeOptions.map(u => ({ value: u.id, label: u.displayName })),
  ];
  const contractorChipOptions = (contractorOptions || []).map(c => ({
    value: c.contractor_id,
    label: c.contractor_name,
  }));

  return (
    <div className="od-filters-panel">
      <div className="od-filters-top">
        <button
          type="button"
          className="od-filters-title od-filters-toggle"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
        >
          <Filter size={14} /> Filters
          {totalActive > 0 && <span className="od-filters-badge">{totalActive}</span>}
          <span className={`od-filters-chevron ${open ? 'od-filters-chevron--open' : ''}`}>
            {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
        </button>
        <input
          className="od-filter-input"
          type="text"
          placeholder="Search by task name or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {(totalActive > 0 || searchQuery) && (
          <button type="button" className="od-btn od-btn--ghost" onClick={onClear}>
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {open && (
        <>
          <FilterChipGroup label="Status"   options={statusOptions}        selected={statusFilter}   onToggle={toggleIn(setStatusFilter)} />
          <FilterChipGroup label="Category" options={categoryOptions}      selected={categoryFilter} onToggle={toggleIn(setCategoryFilter)} />
          <FilterChipGroup label="Priority" options={priorityOptions}      selected={priorityFilter} onToggle={toggleIn(setPriorityFilter)} />
          {locationChipOptions.length > 0 && (
            <FilterChipGroup label="Location" options={locationChipOptions} selected={locationFilter} onToggle={toggleIn(setLocationFilter)} />
          )}
          {assigneeChipOptions.length > 1 && (
            <FilterChipGroup label="Assignee" options={assigneeChipOptions} selected={assigneeFilter} onToggle={toggleIn(setAssigneeFilter)} />
          )}
          {contractorChipOptions.length > 0 && (
            <FilterChipGroup label="Contractor" options={contractorChipOptions} selected={contractorFilter} onToggle={toggleIn(setContractorFilter)} />
          )}
        </>
      )}
    </div>
  );
}

// Bulk action bar — appears only while rows are selected. Deliberately docked
// above the table rather than floating, so it can't cover the rows it acts on.
function BulkActionBar({
  count, busy, assigneeOptions, rollUpTargets = [],
  onAssign, onStatus, onReschedule, onDelete, onRollUp, onAddToRollUp, onClear,
}) {
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rollUpTitle, setRollUpTitle] = useState('');
  const [rollUpOpen, setRollUpOpen] = useState(false);

  // Dragging a row onto a roll-up is the quick path; this is the same move for
  // anyone not using a mouse, and the only path when the target roll-up is on
  // another page of the table.
  const canAddToExisting = count >= 1 && rollUpTargets.length > 0;

  return (
    <div className="od-bulk-bar">
      <span className="od-bulk-count">
        <CheckSquare size={14} /> {count} selected
      </span>

      <div className="od-bulk-actions">
        <select
          className="od-bulk-select"
          value=""
          disabled={busy}
          onChange={(e) => { if (e.target.value) onAssign(Number(e.target.value)); e.target.value = ''; }}
        >
          <option value="">Assign to…</option>
          {assigneeOptions.map(u => (
            <option key={u.id} value={u.id}>{u.displayName}</option>
          ))}
        </select>

        <select
          className="od-bulk-select"
          value=""
          disabled={busy}
          onChange={(e) => { if (e.target.value) onStatus(e.target.value); e.target.value = ''; }}
        >
          <option value="">Set status…</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <input
          className="od-bulk-date"
          type="date"
          value={rescheduleDate}
          disabled={busy}
          onChange={(e) => {
            setRescheduleDate(e.target.value);
            if (e.target.value) { onReschedule(e.target.value); setRescheduleDate(''); }
          }}
          title="Reschedule selected tasks"
        />

        {canAddToExisting && (
          <select
            className="od-bulk-select"
            value=""
            disabled={busy}
            onChange={(e) => { if (e.target.value) onAddToRollUp(Number(e.target.value)); e.target.value = ''; }}
            title="Add the selected tasks to a roll-up that already exists"
          >
            <option value="">Add to roll-up…</option>
            {rollUpTargets.map(p => (
              <option key={p.id} value={p.id}>{p.title || `Task #${p.id}`} ({p.childCount})</option>
            ))}
          </select>
        )}

        <button
          className="od-btn od-btn--ghost"
          disabled={busy || count < 2}
          onClick={() => setRollUpOpen(o => !o)}
          title={count < 2 ? 'Select at least two tasks to roll up' : 'Group these under one task'}
        >
          <ListChecks size={12} /> Roll up
        </button>

        <button className="od-btn od-btn--danger" disabled={busy} onClick={onDelete}>
          <Trash2 size={12} /> Delete
        </button>
        <button className="od-btn od-btn--ghost" disabled={busy} onClick={onClear}>
          <X size={12} /> Clear
        </button>
      </div>

      {rollUpOpen && (
        <form
          className="od-bulk-rollup"
          onSubmit={(e) => {
            e.preventDefault();
            if (!rollUpTitle.trim()) return;
            onRollUp(rollUpTitle.trim());
            setRollUpTitle('');
            setRollUpOpen(false);
          }}
        >
          <input
            className="od-bulk-rollup-input"
            type="text"
            value={rollUpTitle}
            onChange={(e) => setRollUpTitle(e.target.value)}
            placeholder="Name the roll-up task, e.g. Broken wires — north blocks"
            autoFocus
          />
          <button className="od-btn od-btn--primary" type="submit" disabled={busy || !rollUpTitle.trim()}>
            Create roll-up
          </button>
          <button className="od-btn od-btn--ghost" type="button" onClick={() => setRollUpOpen(false)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

// TasksTab — table view with multi-select filters and assignee resolution
function TasksTab() {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();

  const [tasks, setTasks] = useState([]);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [contractors, setContractors] = useState([]);
  // Task payloads carry template_id but no template name — TaskResponse has no
  // template_name field and TaskWithRelations doesn't nest the relationship.
  // Resolving it here beats adding an eager-load to the list endpoint, which
  // is the sort of thing that turns into an N+1 on a 500-row fetch.
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Client-side filters: each is a Set so multi-select toggles cleanly, and each
  // is persisted per user + company so the view you left is the view you come
  // back to (beta: filters resetting on every reload).
  const [statusFilter, setStatusFilter] = usePersistentSet('tasks.filter.status');
  const [categoryFilter, setCategoryFilter] = usePersistentSet('tasks.filter.category');
  const [priorityFilter, setPriorityFilter] = usePersistentSet('tasks.filter.priority');
  const [locationFilter, setLocationFilter] = usePersistentSet('tasks.filter.location');
  const [assigneeFilter, setAssigneeFilter] = usePersistentSet('tasks.filter.assignee');
  const [contractorFilter, setContractorFilter] = usePersistentSet('tasks.filter.contractor');
  // Search stays transient: a forgotten search term restored days later reads as
  // an empty task list, with nothing in the filter chips to explain it.
  const [searchQuery, setSearchQuery] = useState('');

  // Sort + paginate. Default sort matches backend: earliest scheduled first.
  // Click a sortable header to toggle direction.
  const [sortKey, setSortKey] = usePersistentState('tasks.sortKey', 'date',
    v => ['date', 'location', 'title', 'priority'].includes(v));
  const [sortDir, setSortDir] = usePersistentState('tasks.sortDir', 'asc',
    v => ['asc', 'desc'].includes(v));
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Grouping (beta: "sort and group tasks — by block, by type, or by template.
  // For example, tracking every broken wire report across the whole vineyard").
  // Rendered as header rows inside the existing table rather than as separate
  // tables, so pagination and the bulk bar keep working unchanged.
  const [groupKey, setGroupKey] = usePersistentState('tasks.groupKey', 'none',
    v => ['none', 'location', 'category', 'template'].includes(v));

  // Multi-select. `lastClickedId` anchors shift-click range selection.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [lastClickedId, setLastClickedId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const toast = useToast();

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [tasksRes, usersRes, relsRes, tplRes] = await Promise.all([
          (tasksService.listTasks?.({ company_id: companyId, limit: 500 })
            ?? tasksService.list?.({ company_id: companyId, limit: 500 })
            ?? tasksService.getTasks?.({ company_id: companyId, limit: 500 })
            ?? Promise.resolve([])).catch(() => []),
          usersService.getCompanyUsers().catch(() => []),
          contractorManagementService.listRelationships().catch(() => []),
          // No is_active filter: a task built from a since-retired template
          // still has to show that template's name, not its id.
          (tasksService.getTemplates?.({}) ?? Promise.resolve([])).catch(() => []),
        ]);

        if (!mounted) return;
        const items = Array.isArray(tasksRes) ? tasksRes : (tasksRes?.items ?? tasksRes?.data ?? tasksRes?.tasks ?? []);
        setTasks(Array.isArray(items) ? items : []);
        setCompanyUsers(Array.isArray(usersRes) ? usersRes : []);
        setContractors(Array.isArray(relsRes) ? relsRes : []);
        setTaskTemplates(Array.isArray(tplRes) ? tplRes : (tplRes?.items ?? []));
      } catch (err) {
        console.error('Failed to load tasks:', err);
        setError('Failed to load tasks');
        setTasks([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  const fmtDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' }); }
    catch { return '—'; }
  };

  const fmtLocation = (t) => {
    const blockName = t.block?.block_name || t.block?.name || t.block_name;
    if (blockName) return blockName;
    const areaName = t.spatial_area?.name || t.spatial_area_name;
    if (areaName) return areaName;
    if (t.block_id) return `Block #${t.block_id}`;
    if (t.spatial_area_id) return `Area #${t.spatial_area_id}`;
    return t.location_type === 'point' ? '📍 Pin' : '—';
  };

  const getLocationKey = (t) => {
    const blockName = t.block?.block_name || t.block?.name || t.block_name;
    if (blockName) return blockName;
    const areaName = t.spatial_area?.name || t.spatial_area_name;
    if (areaName) return areaName;
    return '__none__';
  };

  const fmtAssignees = (t) => {
    const users = Array.isArray(t.assignee_names) && t.assignee_names.length > 0
      ? t.assignee_names
      : (Array.isArray(t.assignments) ? t.assignments.map(a => a.user_name || a.user?.full_name || a.user?.name).filter(Boolean) : []);
    const contractorNames = Array.isArray(t.contractor_names) ? t.contractor_names : [];
    if (users.length === 0 && contractorNames.length === 0) {
      return <span style={{ color: 'var(--color-text-muted)' }}>Unassigned</span>;
    }
    const tooltip = [
      ...users,
      ...contractorNames.map(n => `${n} (contractor)`),
    ].join(', ');
    return (
      <span title={tooltip} style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
        {users.map((n, i) => (
          <span key={`u-${i}`} style={{ display: 'inline-flex', alignItems: 'center' }}>{n}</span>
        ))}
        {contractorNames.map((n, i) => (
          <span key={`c-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '0 6px', borderRadius: 999,
            background: 'var(--color-surface-warm)',
            fontSize: 'var(--font-size-xs)',
          }} title={`Contractor: ${n}`}>
            <Wrench size={10} /> {n}
          </span>
        ))}
      </span>
    );
  };

  const friendlyUserLabel = (u) => {
    const first = (u.first_name || '').trim();
    const last = (u.last_name || '').trim();
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    const email = (u.email || '').trim();
    if (email && email.includes('@')) {
      const local = email.split('@')[0];
      return local.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return u.full_name || u.name || u.username || `User #${u.id}`;
  };

  const badge = (s) => <TaskStatusBadge status={s} size="sm" />;

  const fmtPriority = (p) => {
    const v = String(p || '').toLowerCase();
    const color = v === 'high' || v === 'urgent' ? 'var(--color-danger)'
                : v === 'medium' ? 'var(--color-warning)'
                : 'var(--color-text-muted)';
    const label = v ? v.charAt(0).toUpperCase() + v.slice(1) : '—';
    return <span style={{ color, fontWeight: 600 }}>{label}</span>;
  };

  const normStatus = (s) => {
    const k = String(s || '').toLowerCase().replace(/\s+/g, '_');
    if (['pending','not_started','draft'].includes(k)) return 'pending';
    if (['in_progress','active','started','ongoing','paused'].includes(k)) return 'in_progress';
    if (['completed','complete','done'].includes(k)) return 'completed';
    if (['cancelled','canceled'].includes(k)) return 'cancelled';
    if (['scheduled','planning','ready'].includes(k)) return 'scheduled';
    return 'other';
  };

  // Distinct option lists derived from the dataset
  const locationOptions = useMemo(() => {
    const set = new Set();
    tasks.forEach(t => {
      const key = getLocationKey(t);
      if (key !== '__none__') set.add(key);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'en-NZ', { numeric: true }));
  }, [tasks]);

  const assigneeOptions = useMemo(() => {
    // Build from the company users list so it stays stable as tasks change
    return [...companyUsers]
      .filter(u => u.is_active !== false && !u.is_suspended)
      .map(u => ({ ...u, displayName: friendlyUserLabel(u) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [companyUsers]);

  const contractorOptions = useMemo(() => {
    return [...contractors]
      .filter(c => c.status === 'active')
      .sort((a, b) => (a.contractor_name || '').localeCompare(b.contractor_name || ''));
  }, [contractors]);

  // Restored filters can outlive what they point at — a block renamed, a user
  // who left, a contractor deactivated. Prune those once the option list they
  // belong to has loaded, so a stale value can't filter the table to nothing
  // with no chip on screen to explain it. `0` is Unassigned, always valid.
  const assigneeValues = useMemo(() => [0, ...assigneeOptions.map(u => u.id)], [assigneeOptions]);
  const contractorValues = useMemo(() => contractorOptions.map(c => c.contractor_id), [contractorOptions]);
  usePruneToOptions(setLocationFilter, locationOptions, !loading && tasks.length > 0);
  usePruneToOptions(setAssigneeFilter, assigneeValues, assigneeOptions.length > 0);
  usePruneToOptions(setContractorFilter, contractorValues, contractorOptions.length > 0);

  const filteredTasks = useMemo(() => (Array.isArray(tasks) ? tasks : []).filter(task => {
    // Rolled-up children are not top-level rows — they render inside their
    // parent, so they're excluded here rather than appearing twice.
    if (task.parent_task_id) return false;
    if (statusFilter.size > 0 && !statusFilter.has(normStatus(task.status))) return false;
    if (categoryFilter.size > 0 && !categoryFilter.has(String(task.task_category || ''))) return false;
    if (priorityFilter.size > 0 && !priorityFilter.has(String(task.priority || '').toLowerCase())) return false;
    if (locationFilter.size > 0 && !locationFilter.has(getLocationKey(task))) return false;
    if (assigneeFilter.size > 0) {
      const ids = Array.isArray(task.assigned_user_ids) ? task.assigned_user_ids : [];
      const unassignedSelected = assigneeFilter.has(0);
      const anyMatch = ids.some(id => assigneeFilter.has(id));
      if (!anyMatch && !(unassignedSelected && ids.length === 0)) return false;
    }
    if (contractorFilter.size > 0) {
      const ids = Array.isArray(task.assigned_contractor_ids) ? task.assigned_contractor_ids : [];
      if (!ids.some(id => contractorFilter.has(id))) return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay = [
        task.title, task.description, task.task_category,
        task.block?.block_name, task.block?.name, task.block_name,
        task.spatial_area?.name, task.spatial_area_name,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [tasks, statusFilter, categoryFilter, priorityFilter, locationFilter, assigneeFilter, contractorFilter, searchQuery]);

  // Rolled-up children behave like a task's rows: they belong to the parent, so
  // they are NOT listed as top-level tasks. They're built from the full task
  // list rather than the filtered one — a parent carries its children with it,
  // the same way a task carries its rows, so a filter never leaves a roll-up
  // showing a partial count.
  const childrenByParent = useMemo(() => {
    const map = {};
    (tasks || []).forEach(t => {
      if (!t.parent_task_id) return;
      (map[t.parent_task_id] ||= []).push(t);
    });
    Object.values(map).forEach(list => list.sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), 'en-NZ', { numeric: true })));
    return map;
  }, [tasks]);

  // Every roll-up currently on the books, for the bulk bar's picker. Built from
  // the unfiltered list so a filtered-out roll-up is still reachable.
  const rollUpTargets = useMemo(() => Object.entries(childrenByParent)
    .map(([id, kids]) => {
      const parent = (tasks || []).find(t => t.id === Number(id));
      return parent ? { id: parent.id, title: parent.title, childCount: kids.length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'en-NZ', { numeric: true })),
  [childrenByParent, tasks]);

  const [expandedParents, setExpandedParents] = useState(() => new Set());
  const toggleExpanded = (taskId) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  // Detach one child from its roll-up. Reversible, so it gets a real undo.
  const detachChild = async (child) => {
    try {
      await tasksService.updateTask(child.id, { parent_task_id: null });
      setTasks(prev => prev.map(t => (t.id === child.id ? { ...t, parent_task_id: null } : t)));
      toast.success(`Removed "${child.title}" from the roll-up`, {
        onUndo: async () => {
          await tasksService.updateTask(child.id, { parent_task_id: child.parent_task_id });
          setTasks(prev => prev.map(t => (
            t.id === child.id ? { ...t, parent_task_id: child.parent_task_id } : t
          )));
        },
      });
    } catch (err) {
      console.error('Failed to detach task:', err);
      toast.error('Could not remove that task from the roll-up');
    }
  };

  // ---- Drag a task into an existing roll-up ----
  // The inverse of detachChild, and the reason the parent row is a drop target
  // rather than the roll-up needing to be rebuilt from scratch. Only existing
  // roll-ups accept a drop: promoting a plain task into a parent stays a
  // deliberate act via the bulk bar, so a stray drag can't restructure two
  // unrelated tasks.
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dropParentId, setDropParentId] = useState(null);

  // The backend refuses updates to finished tasks and refuses to nest a task
  // that already has children (tasks.py — roll-ups are one level deep). Both
  // are checked here so the affordance never appears where the drop would 400.
  const canDragTask = (t) => (
    !['completed', 'cancelled'].includes(normStatus(t.status))
    && !(childrenByParent[t.id]?.length)
  );

  const setLocalParent = (childId, parentId) => setTasks(prev => prev.map(t => (
    t.id === childId ? { ...t, parent_task_id: parentId } : t
  )));

  const attachToRollUp = async (childId, parentId) => {
    const child = tasks.find(t => t.id === childId);
    const parent = tasks.find(t => t.id === parentId);
    if (!child || !parent || child.parent_task_id === parentId) return;

    const previousParentId = child.parent_task_id ?? null;
    // Optimistic: the row jumps under the parent on drop, so the gesture reads
    // as direct manipulation rather than as a request.
    setLocalParent(childId, parentId);
    setExpandedParents(prev => new Set(prev).add(parentId));

    try {
      await tasksService.updateTask(childId, { parent_task_id: parentId });
      const childName = child.title || `Task #${child.id}`;
      // Word it as what it was: a move reads differently from a first roll-up,
      // and the undo restores the previous roll-up rather than top level.
      toast.success(previousParentId
        ? `Moved "${childName}" to "${parent.title}"`
        : `Rolled "${childName}" up under "${parent.title}"`, {
        onUndo: async () => {
          await tasksService.updateTask(childId, { parent_task_id: previousParentId });
          setLocalParent(childId, previousParentId);
        },
      });
    } catch (err) {
      console.error('Failed to attach task to roll-up:', err);
      setLocalParent(childId, previousParentId);
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not add that task to the roll-up');
    }
  };

  const handleDragStart = (e, t) => {
    setDragTaskId(t.id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox won't start a drag at all unless some data is set.
    e.dataTransfer.setData('text/plain', String(t.id));
  };

  const handleDragEnd = () => { setDragTaskId(null); setDropParentId(null); };

  const handleDragOverParent = (e, parentId) => {
    if (dragTaskId == null || dragTaskId === parentId) return;
    // A child dragged over the roll-up it already sits in is a no-op —
    // attachToRollUp bails on the same condition. Don't light up a target that
    // would do nothing on drop.
    if (tasks.find(t => t.id === dragTaskId)?.parent_task_id === parentId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropParentId !== parentId) setDropParentId(parentId);
  };

  const handleDragLeaveParent = (e, parentId) => {
    // A roll-up's drop zone spans its header row AND its expanded children, so
    // "left the target" means left the whole group — not merely left one <tr>.
    // Without this the highlight strobes as the pointer crosses from the parent
    // row onto its own children. `data-rollup-group` marks group membership;
    // relatedTarget can be null (left the window) or a non-Element.
    const row = e.relatedTarget?.closest?.('[data-rollup-group]');
    if (row && Number(row.dataset.rollupGroup) === parentId) return;
    setDropParentId(prev => (prev === parentId ? null : prev));
  };

  const handleDropOnParent = (e, parentId) => {
    e.preventDefault();
    const childId = dragTaskId ?? Number(e.dataTransfer.getData('text/plain'));
    setDragTaskId(null);
    setDropParentId(null);
    if (childId && childId !== parentId) attachToRollUp(childId, parentId);
  };

  const templateNameById = useMemo(() => {
    const map = new Map();
    for (const tpl of taskTemplates) {
      if (tpl?.id != null && tpl?.name) map.set(String(tpl.id), tpl.name);
    }
    return map;
  }, [taskTemplates]);

  // What a task is grouped under, for the active groupKey.
  const getGroupLabel = (t) => {
    if (groupKey === 'location') {
      const key = getLocationKey(t);
      return key === '__none__' ? 'No location' : key;
    }
    if (groupKey === 'category') {
      return (t.task_category || '').replace(/_/g, ' ') || 'Uncategorised';
    }
    if (groupKey === 'template') {
      if (t.template_id == null) return 'No template';
      // The id fallback stays as a last resort — a template the company can no
      // longer read still groups its tasks together, just without a name.
      return t.template_name
        || t.template?.name
        || templateNameById.get(String(t.template_id))
        || `Template #${t.template_id}`;
    }
    return '';
  };

  const sortedTasks = useMemo(() => {
    const arr = [...filteredTasks];
    const cmp = (a, b) => {
      if (sortKey === 'location') {
        return getLocationKey(a).localeCompare(getLocationKey(b), 'en-NZ', { numeric: true });
      }
      if (sortKey === 'title') {
        return String(a.title || '').localeCompare(String(b.title || ''), 'en-NZ', { numeric: true });
      }
      if (sortKey === 'priority') {
        const rank = { urgent: 0, high: 1, medium: 2, low: 3 };
        const av = rank[String(a.priority || '').toLowerCase()] ?? 99;
        const bv = rank[String(b.priority || '').toLowerCase()] ?? 99;
        return av - bv;
      }
      // date
      const av = new Date(a.scheduled_start_date || a.scheduled_date || 0).getTime() || 0;
      const bv = new Date(b.scheduled_start_date || b.scheduled_date || 0).getTime() || 0;
      return av - bv;
    };
    arr.sort((a, b) => (sortDir === 'asc' ? cmp(a, b) : -cmp(a, b)));

    // Grouping is applied as a primary sort so members stay contiguous; the
    // chosen sort then orders rows *within* each group.
    if (groupKey !== 'none') {
      arr.sort((a, b) => getGroupLabel(a).localeCompare(getGroupLabel(b), 'en-NZ', { numeric: true }));
    }
    return arr;
  }, [filteredTasks, sortKey, sortDir, groupKey]);

  // Reset to page 1 whenever filters / sort / search change the visible set.
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, categoryFilter, priorityFilter, locationFilter, assigneeFilter, contractorFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTasks = sortedTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Selection is scoped to what's on screen: the header checkbox and shift-click
  // ranges both operate over the current page, so a click never silently picks up
  // rows the user can't see.
  const visibleIds = pagedTasks.map(t => t.id);
  const selectedVisibleCount = visibleIds.filter(id => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0;

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
    setLastClickedId(null);
  };

  const totalActiveFilters =
    statusFilter.size + categoryFilter.size + priorityFilter.size + locationFilter.size + assigneeFilter.size + contractorFilter.size;

  const clearAllFilters = () => {
    setStatusFilter(new Set());
    setCategoryFilter(new Set());
    setPriorityFilter(new Set());
    setLocationFilter(new Set());
    setAssigneeFilter(new Set());
    setContractorFilter(new Set());
    setSearchQuery('');
  };

  // Deferred delete. DELETE /tasks/{id} is a hard delete with no restore, so the
  // request is held back until the undo window lapses — undo is then just
  // putting the row back in local state, with no server round trip and nothing
  // to fail. Replaces the old window.confirm (beta ask: a safety net, not more
  // friction).
  const removeTasksWithUndo = (victims, label) => {
    if (victims.length === 0) return;
    const ids = new Set(victims.map(v => v.id));
    setTasks(prev => prev.filter(t => !ids.has(t.id)));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });

    toast.show(label, {
      onUndo: () => {
        // Nothing was sent yet — restore the rows and re-sort on next render.
        setTasks(prev => [...prev, ...victims]);
      },
      onExpire: async () => {
        const results = await Promise.allSettled(
          victims.map(v => tasksService.deleteTask(v.id)),
        );
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
          console.error('Deferred task delete failed:', failed[0].reason);
          // Put back only what actually failed, so the list matches the server.
          const okIds = new Set(
            victims.filter((_, i) => results[i].status === 'fulfilled').map(v => v.id),
          );
          setTasks(prev => [...prev, ...victims.filter(v => !okIds.has(v.id))]);
          toast.error(
            failed.length === victims.length
              ? 'Could not delete — the task has been restored'
              : `${failed.length} of ${victims.length} could not be deleted and were restored`,
          );
        }
      },
    });
  };

  const handleDeleteTask = (taskId) => {
    const victim = tasks.find(t => t.id === taskId);
    if (!victim) return;
    removeTasksWithUndo([victim], `Deleted "${victim.title || `Task #${victim.id}`}"`);
  };

  // ---- Multi-select ----
  // Plain click toggles one row; shift-click extends from the last clicked row
  // through the current one, over the VISIBLE (paged, sorted, grouped) order —
  // which is what "select a range" means to someone looking at the table.
  const toggleRowSelection = (taskId, shiftKey, visibleIds) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shiftKey && lastClickedId != null) {
        const from = visibleIds.indexOf(lastClickedId);
        const to = visibleIds.indexOf(taskId);
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
          // Shift-click always ADDS the range (never toggles it off) — matching
          // file managers, and avoiding a range that half-clears itself.
          for (let i = lo; i <= hi; i++) next.add(visibleIds[i]);
          return next;
        }
      }
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
    setLastClickedId(taskId);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  };

  // ---- Bulk actions ----
  // Each returns the tasks it changed plus how to put them back, so the toast
  // can offer a real reversal (unlike delete, these are all reversible writes).
  const runBulk = async (label, ids, apply, revert) => {
    setBulkBusy(true);
    try {
      const targets = tasks.filter(t => ids.has(t.id));
      const results = await Promise.allSettled(targets.map(apply));
      const failed = results.filter(r => r.status === 'rejected');
      const okTargets = targets.filter((_, i) => results[i].status === 'fulfilled');

      if (okTargets.length > 0) {
        const refreshed = await tasksService.listTasks({ company_id: companyId, limit: 500 }).catch(() => null);
        if (refreshed) {
          const items = Array.isArray(refreshed) ? refreshed : (refreshed?.items ?? refreshed?.tasks ?? []);
          setTasks(Array.isArray(items) ? items : []);
        }
      }

      if (failed.length > 0) {
        toast.error(`${failed.length} of ${targets.length} failed — ${label.toLowerCase()} applied to the rest`);
      } else if (revert) {
        toast.success(`${label} · ${okTargets.length} task${okTargets.length === 1 ? '' : 's'}`, {
          onUndo: async () => {
            await Promise.allSettled(okTargets.map(revert));
            const back = await tasksService.listTasks({ company_id: companyId, limit: 500 }).catch(() => null);
            if (back) {
              const items = Array.isArray(back) ? back : (back?.items ?? back?.tasks ?? []);
              setTasks(Array.isArray(items) ? items : []);
            }
          },
        });
      } else {
        toast.success(`${label} · ${okTargets.length} task${okTargets.length === 1 ? '' : 's'}`);
      }
      clearSelection();
    } catch (err) {
      console.error(`Bulk ${label} failed:`, err);
      toast.error(`Could not ${label.toLowerCase()}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkAssign = (userId) => runBulk(
    'Assigned',
    selectedIds,
    (t) => tasksService.assignMultipleUsers(t.id, {
      user_ids: [userId], role: 'assignee', estimated_hours: null, set_first_as_primary: true,
    }),
    null, // assignment removal needs the created assignment id — not worth guessing
  );

  const bulkStatus = (status) => runBulk(
    status === 'completed' ? 'Completed' : `Set ${status.replace(/_/g, ' ')}`,
    selectedIds,
    (t) => tasksService.updateTask(t.id, { status }),
    (t) => tasksService.updateTask(t.id, { status: t.status }),
  );

  const bulkReschedule = (dateStr) => runBulk(
    'Rescheduled',
    selectedIds,
    (t) => tasksService.rescheduleTask(t.id, { scheduled_start_date: dateStr }),
    (t) => tasksService.rescheduleTask(t.id, {
      scheduled_start_date: t.scheduled_start_date || t.scheduled_date || null,
    }),
  );

  // Roll-up isn't a per-task loop like the others — it's one call that creates
  // the parent and reparents every child atomically, so it doesn't use runBulk.
  const bulkRollUp = async (title) => {
    setBulkBusy(true);
    try {
      const parent = await tasksService.rollUpTasks({
        task_ids: [...selectedIds],
        title,
      });
      const refreshed = await tasksService.listTasks({ company_id: companyId, limit: 500 }).catch(() => null);
      if (refreshed) {
        const items = Array.isArray(refreshed) ? refreshed : (refreshed?.items ?? refreshed?.tasks ?? []);
        setTasks(Array.isArray(items) ? items : []);
      }
      const rolledCount = selectedIds.size;
      clearSelection();
      // Open the new parent straight away — otherwise the tasks appear to
      // vanish, since they're no longer top-level rows.
      setExpandedParents(prev => new Set(prev).add(parent.id));
      toast.success(`Rolled up ${rolledCount} tasks under "${parent.title}"`);
    } catch (err) {
      console.error('Roll-up failed:', err);
      toast.error(err?.response?.data?.detail || 'Could not roll up those tasks');
    } finally {
      setBulkBusy(false);
    }
  };

  // Same destination as a drag, one call instead of a loop so the reparenting
  // is atomic. The parent itself is filtered out in case it's in the selection.
  const bulkAddToRollUp = async (parentId) => {
    const ids = [...selectedIds].filter(id => id !== parentId);
    if (ids.length === 0) return;
    const previous = tasks
      .filter(t => ids.includes(t.id))
      .map(t => ({ id: t.id, parent_task_id: t.parent_task_id ?? null }));

    setBulkBusy(true);
    try {
      const parent = await tasksService.rollUpTasks({ task_ids: ids, parent_task_id: parentId });
      const refreshed = await tasksService.listTasks({ company_id: companyId, limit: 500 }).catch(() => null);
      if (refreshed) {
        const items = Array.isArray(refreshed) ? refreshed : (refreshed?.items ?? refreshed?.tasks ?? []);
        setTasks(Array.isArray(items) ? items : []);
      }
      clearSelection();
      setExpandedParents(prev => new Set(prev).add(parentId));
      toast.success(`Added ${ids.length} task${ids.length === 1 ? '' : 's'} to "${parent.title}"`, {
        onUndo: async () => {
          await Promise.allSettled(previous.map(p =>
            tasksService.updateTask(p.id, { parent_task_id: p.parent_task_id })));
          const back = await tasksService.listTasks({ company_id: companyId, limit: 500 }).catch(() => null);
          if (back) {
            const items = Array.isArray(back) ? back : (back?.items ?? back?.tasks ?? []);
            setTasks(Array.isArray(items) ? items : []);
          }
        },
      });
    } catch (err) {
      console.error('Add to roll-up failed:', err);
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not add those tasks to the roll-up');
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = () => {
    const victims = tasks.filter(t => selectedIds.has(t.id));
    removeTasksWithUndo(
      victims,
      `Deleted ${victims.length} task${victims.length === 1 ? '' : 's'}`,
    );
  };

  // Style constants removed — now using od-table, od-btn CSS classes

  if (loading) return <div className="od-loading">Loading tasks...</div>;
  if (error) return <div className="od-error">{error}</div>;

  const sortIndicator = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div>
      <div className="od-tab-header">
        <span className="help-tip-head"><h2>Tasks ({sortedTasks.length})</h2><HelpTip topic="obs.tasks" /></span>
        <label className="od-group-control">
          <Layers size={14} />
          <span>Group by</span>
          <select
            className="od-group-select"
            value={groupKey}
            onChange={(e) => setGroupKey(e.target.value)}
          >
            <option value="none">None</option>
            <option value="location">Block / area</option>
            <option value="category">Type</option>
            <option value="template">Template</option>
          </select>
        </label>
      </div>

      <TaskFilters
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
        priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
        locationFilter={locationFilter} setLocationFilter={setLocationFilter}
        assigneeFilter={assigneeFilter} setAssigneeFilter={setAssigneeFilter}
        contractorFilter={contractorFilter} setContractorFilter={setContractorFilter}
        locationOptions={locationOptions} assigneeOptions={assigneeOptions} contractorOptions={contractorOptions}
        totalActive={totalActiveFilters} onClear={clearAllFilters}
      />

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          busy={bulkBusy}
          assigneeOptions={assigneeOptions}
          rollUpTargets={rollUpTargets}
          onAssign={bulkAssign}
          onStatus={bulkStatus}
          onReschedule={bulkReschedule}
          onDelete={bulkDelete}
          onRollUp={bulkRollUp}
          onAddToRollUp={bulkAddToRollUp}
          onClear={clearSelection}
        />
      )}

      {sortedTasks.length > 0 ? (
        <div className="od-table-wrap">
          <table className="od-table od-task-table">
            <thead>
              <tr>
                <th className="od-th-check">
                  <input
                    type="checkbox"
                    aria-label="Select all visible tasks"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                    onChange={toggleSelectAllVisible}
                  />
                </th>
                <th className="od-th-sortable" onClick={() => toggleSort('title')}>Task{sortIndicator('title')}</th>
                <th>Category</th>
                <th className="od-th-sortable" onClick={() => toggleSort('location')}>Location{sortIndicator('location')}</th>
                <th className="od-th-sortable" onClick={() => toggleSort('date')}>Schedule{sortIndicator('date')}</th>
                <th className="center od-th-sortable" onClick={() => toggleSort('priority')}>Priority{sortIndicator('priority')}</th>
                <th>Assignees</th>
                <th>Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedTasks.map((t, i) => {
                const label = getGroupLabel(t);
                const showGroupHeader = groupKey !== 'none'
                  && (i === 0 || getGroupLabel(pagedTasks[i - 1]) !== label);
                const children = childrenByParent[t.id] || [];
                const isExpanded = expandedParents.has(t.id);
                // Only existing roll-ups take a drop, and a roll-up can't itself
                // be dragged into another one (one level deep).
                const isDropTarget = children.length > 0;
                const isDraggable = canDragTask(t);
                return (
                  <Fragment key={t.id}>
                    {showGroupHeader && (
                      <tr className="od-group-row">
                        <td colSpan={9}>
                          <span className="od-group-label">{label}</span>
                          <span className="od-group-count">
                            {sortedTasks.filter(x => getGroupLabel(x) === label).length}
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr
                      className={[
                        'od-clickable-row',
                        selectedIds.has(t.id) ? 'od-row-selected' : '',
                        isDraggable ? 'od-row-draggable' : '',
                        dragTaskId === t.id ? 'od-row-dragging' : '',
                        dropParentId === t.id ? 'od-drop-target' : '',
                        dropParentId === t.id && !isExpanded ? 'od-drop-target--closed' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => navigate(`/tasks/${t.id}`)}
                      draggable={isDraggable}
                      onDragStart={isDraggable ? (e) => handleDragStart(e, t) : undefined}
                      onDragEnd={isDraggable ? handleDragEnd : undefined}
                      onDragOver={isDropTarget ? (e) => handleDragOverParent(e, t.id) : undefined}
                      onDragLeave={isDropTarget ? (e) => handleDragLeaveParent(e, t.id) : undefined}
                      onDrop={isDropTarget ? (e) => handleDropOnParent(e, t.id) : undefined}
                      data-rollup-group={isDropTarget ? t.id : undefined}
                    >
                      <td className="od-td-check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${t.title || `task ${t.id}`}`}
                          checked={selectedIds.has(t.id)}
                          onChange={() => {}}
                          onClick={(e) => toggleRowSelection(t.id, e.shiftKey, visibleIds)}
                        />
                      </td>
                      <td className="bold">
                        {isDraggable && (
                          <GripVertical
                            size={13}
                            className="od-drag-grip"
                            aria-hidden="true"
                          />
                        )}
                        {/* A roll-up parent expands to show its children the way
                            a task expands to show its rows. */}
                        {children.length > 0 && (
                          <button
                            type="button"
                            className={`od-rollup-toggle ${isExpanded ? 'od-rollup-toggle--open' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(t.id); }}
                            title={isExpanded ? 'Hide rolled-up tasks' : 'Show rolled-up tasks'}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                        )}
                        {t.title || `Task #${t.id}`}
                        {children.length > 0 && (
                          <span className="od-rollup-badge" title={`${children.length} tasks rolled up under this`}>
                            <ListChecks size={11} /> {children.length}
                          </span>
                        )}
                      </td>
                      <td><span className="od-category-tag">{(t.task_category || '').replace(/_/g,' ') || '—'}</span></td>
                      <td>{fmtLocation(t)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(t.scheduled_start_date || t.scheduled_date)}
                        {t.scheduled_end_date ? ` – ${fmtDate(t.scheduled_end_date)}` : ''}
                      </td>
                      <td className="center">{fmtPriority(t.priority)}</td>
                      <td>{fmtAssignees(t)}</td>
                      <td>{badge(t.status)}</td>
                      <td className="right" onClick={(e) => e.stopPropagation()}>
                        <div className="od-actions">
                          <button className="od-btn od-btn--primary" onClick={() => navigate(`/tasks/${t.id}`)} title="Open"><Eye size={12}/> Open</button>
                          <button className="od-btn od-btn--danger" onClick={() => handleDeleteTask(t.id)} title="Delete"><Trash2 size={12}/></button>
                        </div>
                      </td>
                    </tr>

                    {/* Rolled-up children — the task's "rows". Not selectable:
                        bulk actions operate on top-level tasks, and letting a
                        child join a shift-click range would make the range span
                        two different kinds of thing.
                        They carry the parent's drop handlers so a drop anywhere
                        in the expanded block lands on the roll-up, rather than
                        the header row being the only target.
                        They are also drag SOURCES, which is how a child moves
                        between roll-ups: no checkbox means the bulk bar can
                        never reach one, so before this the only route was
                        detach-then-re-add. attachToRollUp already captured the
                        previous parent for its undo, so re-parenting needed no
                        new plumbing — only a gesture to start it. */}
                    {isExpanded && children.map((c, ci) => {
                      const childDraggable = canDragTask(c);
                      return (
                      <tr
                        key={`child-${c.id}`}
                        className={[
                          'od-child-row',
                          childDraggable ? 'od-row-draggable' : '',
                          dragTaskId === c.id ? 'od-row-dragging' : '',
                          dropParentId === t.id ? 'od-drop-target-child' : '',
                          dropParentId === t.id && ci === children.length - 1
                            ? 'od-drop-target-child--last' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => navigate(`/tasks/${c.id}`)}
                        draggable={childDraggable}
                        onDragStart={childDraggable ? (e) => handleDragStart(e, c) : undefined}
                        onDragEnd={childDraggable ? handleDragEnd : undefined}
                        onDragOver={(e) => handleDragOverParent(e, t.id)}
                        onDragLeave={(e) => handleDragLeaveParent(e, t.id)}
                        onDrop={(e) => handleDropOnParent(e, t.id)}
                        data-rollup-group={t.id}
                      >
                        <td />
                        <td className="od-child-title" colSpan={3}>
                          {childDraggable && (
                            <GripVertical size={13} className="od-drag-grip" aria-hidden="true" />
                          )}
                          <span className="od-child-marker">↳</span>
                          {c.title || `Task #${c.id}`}
                          {c.block_name && <span className="od-child-location">{c.block_name}</span>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {fmtDate(c.scheduled_start_date || c.scheduled_date)}
                        </td>
                        <td className="center">{fmtPriority(c.priority)}</td>
                        <td>{fmtAssignees(c)}</td>
                        <td>{badge(c.status)}</td>
                        <td className="right" onClick={(e) => e.stopPropagation()}>
                          <div className="od-actions">
                            <button className="od-btn od-btn--ghost" onClick={() => navigate(`/tasks/${c.id}`)} title="Open"><Eye size={12}/></button>
                            <button
                              className="od-btn od-btn--ghost"
                              onClick={() => detachChild(c)}
                              title="Remove from this roll-up"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="od-pagination">
              <button
                type="button"
                className="od-btn od-btn--ghost"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                ← Prev
              </button>
              <span className="od-pagination-info">
                Page {currentPage} of {totalPages} · {sortedTasks.length} task{sortedTasks.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="od-btn od-btn--ghost"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="od-empty">
          <div className="od-empty-text">{searchQuery ? 'No tasks match your search' : 'No tasks found'}</div>
        </div>
      )}
    </div>
  );


}


// Task Card Component
function TaskCard({ task, onView, onEdit, onDelete }) {
  const statusColors = { pending: 'var(--color-warning)', in_progress: 'var(--color-info)', completed: 'var(--color-success)', cancelled: 'var(--color-text-muted)' };

  return (
    <div className="od-task-card" style={{ '--card-status-color': statusColors[task.status] || 'var(--color-border)' }}>
      <div className="od-task-card-header">
        <div style={{ flex: 1 }}>
          <div className="od-task-card-title">{task.title}</div>
          <span className="od-category-tag">{(task.task_category || '').replace(/_/g, ' ')}</span>
        </div>
      </div>
      {task.description && <div className="od-task-card-desc">{task.description}</div>}
      <div className="od-task-card-meta">
        {(task.scheduled_date || task.scheduled_start_date) && (
          <span><Calendar size={12} /> {new Date(task.scheduled_date || task.scheduled_start_date).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' })}</span>
        )}
        {(task.estimated_duration_hours || task.estimated_hours) && (
          <span><Clock size={12} /> {(task.estimated_duration_hours ?? task.estimated_hours)}h</span>
        )}
      </div>
      <div className="od-card-actions">
        <button className="od-btn od-btn--primary" onClick={() => onView(task)}><Eye size={12} /> View</button>
        <button className="od-btn od-btn--ghost" onClick={() => onEdit(task)}><Edit size={12} /></button>
        <button className="od-btn od-btn--danger" onClick={() => onDelete(task.id)}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}


