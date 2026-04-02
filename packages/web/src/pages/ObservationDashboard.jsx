import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { ClipboardList, PlayCircle, Plus, Filter, ArrowRight, FileText, CheckCircle, XCircle, Rocket, Eye, Edit, Trash2, Calendar, Clock, MapPin, Zap, ListChecks } from 'lucide-react';
import { observationService, usersService, authService, tasksService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import './ObservationDashboard.css';
import BlockSelectionModal from '../components/BlockSelectionModal';
import { TaskTemplateCard, TaskTemplatePreviewModal  } from '@/components/TaskManagement';


function readTemplateFields(tpl) {
  if (!tpl) return [];
  const s = tpl.field_schema ?? tpl.fields_json ?? tpl.schema?.fields ?? tpl.schema ?? [];
  return Array.isArray(s) ? s : Array.isArray(s.fields) ? s.fields : [];
}

export default function ObservationDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('plans');

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

      {/* Dashboard Overview Stats */}
      <div className="stats-container">
        <div className="container-title">
          <span>Vineyard Management</span>
        </div>
        <div className="stats-grid">
          {['Active Plans', 'Runs In Progress', 'Submitted Today', 'Overdue Plans'].map(label => (
            <div key={label} className="stat-card" style={{ textAlign: 'center' }}>
              <div className="stat-value">—</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="stats-container">
        <div className="container-title">
          <span>Quick Actions</span>
        </div>
        <div className="stats-grid">
          <Link to="/observations/quick" className="stat-card">
            <div className="icon-wrapper"><Eye size={24} /></div>
            <div className="actions-title">Quick Observation</div>
          </Link>
          <Link to="/tasks/new" className="stat-card">
            <div className="icon-wrapper"><Zap size={24} /></div>
            <div className="actions-title">Create / Assign Task</div>
          </Link>
          <Link to="/planobservation" className="stat-card">
            <div className="icon-wrapper"><ClipboardList size={24} /></div>
            <div className="actions-title">Schedule Observation</div>
          </Link>
          <div className="stat-card" style={{ opacity: 0.45, cursor: 'default' }}>
            <div className="icon-wrapper"><ListChecks size={24} /></div>
            <div className="actions-title">Assign Observation (coming soon)</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation — grouped: Obs tabs then Task tabs */}
      <div className="stats-container" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="obs-tab-bar">
          <TabButton label="Scheduled" active={tab === 'plans'} onClick={() => setTab('plans')} />
          <TabButton label="Runs" active={tab === 'runs'} onClick={() => setTab('runs')} />
          <TabButton label="Obs Templates" active={tab === 'templates'} onClick={() => setTab('templates')} />
          <TabButton label="Task Management" active={tab === 'tasks'} onClick={() => setTab('tasks')} />
          <TabButton label="Task Templates" active={tab === 'task-templates'} onClick={() => setTab('task-templates')} />
        </div>

        <div style={{ padding: 'var(--space-lg)' }}>
          {tab === 'plans' && <PlansTab StatusBadge={StatusBadge} />}
          {tab === 'runs' && <RunsTab StatusBadge={StatusBadge} />}
          {tab === 'templates' && <TemplatesTab />}
          {tab === 'tasks' && <TasksTab StatusBadge={StatusBadge} />}
          {tab === 'task-templates' && <TaskTemplatesTab />}
        </div>
      </div>

      <MobileNavigation />
    </div>
  );
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`obs-tab-btn ${active ? 'obs-tab-btn--active' : ''}`}
    >
      {label}
    </button>
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

function PlansTab({ StatusBadge }) {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState([]);

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [startingRun, setStartingRun] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [planRes, userRes] = await Promise.all([
          observationService.listPlans({ company_id: companyId }).catch(() => []),
          usersService.listCompanyUsers().catch(() => []),
        ]);
        if (!mounted) return;
        setPlans(Array.isArray(planRes) ? planRes : planRes?.items || []);
        setUsers(Array.isArray(userRes) ? userRes : userRes?.items || []);
      } catch (e) {
        console.error(e);
        setError('Failed to load plans');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  const userMap = new Map(users.map(u => [String(u.id), u.full_name || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || `User ${u.id}`]));

  const filtered = plans.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (assigneeFilter) {
      const assigneeIds = (p.assignees || p.assignee_user_ids || []).map(a => a.user_id ?? a.id ?? a);
      if (!assigneeIds.includes(Number(assigneeFilter))) return false;
    }
    if (q && !p.name?.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const openBlockModal = (plan) => {
    setSelectedPlan(plan);
    setBlockModalOpen(true);
  };

  const closeBlockModal = () => {
    setBlockModalOpen(false);
    setSelectedPlan(null);
  };

  const startRunWithBlock = async (blockId) => {
    if (!selectedPlan || startingRun) return;
    
    try {
      setStartingRun(true);
      
      const payload = {
        company_id: companyId,
        plan_id: selectedPlan.id,
        template_id: selectedPlan.template_id,
        block_id: blockId,
        started_at: new Date().toISOString(),
      };

      console.log('Creating run with payload:', payload);

      const run = await observationService.createRun(payload);
      
      if (run?.id) {
        navigate(`/observations/runcapture/${run.id}`);
      } else {
        alert('Run was not created (no id returned).');
      }
    } catch (e) {
      console.error('Failed to start run:', e);
      const detail = e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Failed to start run';
      alert(`Could not start run:\n${Array.isArray(detail) ? detail[0]?.msg || detail : detail}`);
    } finally {
      setStartingRun(false);
      closeBlockModal();
    }
  };

  if (loading) return <div className="od-loading">Loading scheduled observations...</div>;
  if (error) return <div className="od-error">{error}</div>;

  return (
    <div>
      <div className="od-tab-header">
        <h2>Scheduled Observations ({filtered.length})</h2>
      </div>

      <div className="od-search">
        <input placeholder="Search by name..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {filtered.length > 0 ? (
        <div className="od-table-wrap">
          <table className="od-table">
            <thead>
              <tr>
                <th>Plan Name</th>
                <th>Template</th>
                <th className="center">Runs</th>
                <th className="center">Latest Run</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td className="bold">{p.name || `Plan #${p.id}`}</td>
                  <td>{p.template_name || p.template_id || '—'}</td>
                  <td className="center">{typeof p.runs_count === 'number' ? p.runs_count : '—'}</td>
                  <td className="center">
                    {p.latest_run_started_at ? dayjs(p.latest_run_started_at).format('YYYY-MM-DD HH:mm') : '—'}
                  </td>
                  <td className="right">
                    <div className="od-actions">
                      <button className="od-btn od-btn--ghost" onClick={() => navigate(`/plandetail/${p.id}`)}>
                        Open <ArrowRight size={14} />
                      </button>
                      <button className="od-btn od-btn--primary" onClick={() => openBlockModal(p)} disabled={startingRun} title="Start a run for this plan">
                        <PlayCircle size={14} /> {startingRun ? 'Starting...' : 'Start Run'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="od-empty">
          <div className="od-empty-text">No scheduled observations found</div>
          <button className="btn-primary" onClick={() => navigate('/planobservation')}>
            Schedule Your First Observation
          </button>
        </div>
      )}

      <BlockSelectionModal
        open={blockModalOpen}
        plan={selectedPlan}
        onClose={closeBlockModal}
        onStartRun={startRunWithBlock}
      />
    </div>
  );
}

function RunsTab({ StatusBadge }) {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const reload = async () => {
    try {
      setLoading(true);
      const res = await observationService.listRuns?.({ company_id: companyId }).catch(() => []);
      setRuns(Array.isArray(res) ? res : res?.items || []);
    } catch (e) {
      console.error(e);
      setError('Failed to load runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await reload();
    })();
    return () => { mounted = false; };
  }, [companyId]);

  const setStatus = async (runId, status) => {
    try {
      if (!observationService?.updateRun) {
        alert('Run update service not available yet.');
        return;
      }
      setBusyId(runId);
      await observationService.updateRun(runId, { status });
      await reload();
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        'Unknown error';
      alert(`Could not update run:\n${JSON.stringify(detail)}`);
    } finally {
      setBusyId(null);
    }
  };

  const completeRun = async (runId) => {
    try {
      if (!observationService?.completeRun) {
        alert('Complete Run service not available yet.');
        return;
      }
      setBusyId(runId);
      await observationService.completeRun(runId);
      await reload();
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        'Unknown error';
      alert(`Could not complete run:\n${JSON.stringify(detail)}`);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="od-loading">Loading runs...</div>;
  if (error) return <div className="od-error">{error}</div>;

  return (
    <div>
      <div className="od-tab-header">
        <h2>Observation Runs ({runs.length})</h2>
      </div>

      {runs.length > 0 ? (
        <div className="od-table-wrap">
          <table className="od-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Plan</th>
                <th>Block</th>
                <th className="center">Status</th>
                <th className="center">Started</th>
                <th className="center">Completed</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}>
                  <td className="bold">{r.name || `Run #${r.id}`}</td>
                  <td>{r.plan_name || (r.plan_id ? `Plan ${r.plan_id}` : '—')}</td>
                  <td>{r.block_name || '—'}</td>
                  <td className="center"><StatusBadge status={r.status || 'active'} /></td>
                  <td className="center">{r.observed_at_start ? dayjs(r.observed_at_start).format('YYYY-MM-DD HH:mm') : '—'}</td>
                  <td className="center">{r.observed_at_end ? dayjs(r.observed_at_end).format('YYYY-MM-DD HH:mm') : '—'}</td>
                  <td className="right">
                    <div className="od-actions">
                      <button className="od-btn od-btn--primary" onClick={() => navigate(`/observations/runcapture/${r.id}`)}>
                        Open <ArrowRight size={14} />
                      </button>
                      <button className="od-btn od-btn--accent" onClick={() => completeRun(r.id)} disabled={busyId === r.id} title="Complete this run">
                        <CheckCircle size={14} /> Complete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="od-empty">
          <div className="od-empty-text">No runs found — start a run from a scheduled observation</div>
        </div>
      )}
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
        <h2>Observation Templates ({templates.length})</h2>
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
                <button className="od-btn od-btn--primary" onClick={() => navigate('/planobservation', { state: { template: t } })} title="Use this template">
                  <Plus size={14} /> Use Template
                </button>
                <button className="od-btn od-btn--ghost" onClick={() => onViewTemplate(t)} title="View fields">
                  View
                </button>
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
        <h2>Task Templates ({filteredTemplates.length})</h2>
        <button className="btn-primary" onClick={() => navigate('/tasks/templates/new')}>
          <Plus size={14} /> New Template
        </button>
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
              <option value="asset_management">Asset Management</option>
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
function TemplateCard({ template, onView, onEdit, onUse }) {
  const categoryLabels = { vineyard: 'Vineyard', land_management: 'Land Management', asset_management: 'Asset Management', compliance: 'Compliance', general: 'General' };
  const categoryLabel = categoryLabels[template.task_category] || template.task_category;

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
      <div className="od-task-card-meta">
        <span style={{ textTransform: 'capitalize' }}>{template.default_priority}</span>
        {template.requires_gps_tracking && <span><MapPin size={12} /> GPS</span>}
        {template.required_equipment_ids?.length > 0 && <span>Equipment: {template.required_equipment_ids.length}</span>}
        <span style={{ marginLeft: 'auto' }}>Used: {template.task_count || 0}×</span>
      </div>
      <div className="od-card-actions">
        <button className="od-btn od-btn--primary" onClick={() => onUse(template)} disabled={!template.is_active} style={{ opacity: template.is_active ? 1 : 0.5 }}>
          <Plus size={14} /> Use Template
        </button>
        <button className="od-btn od-btn--ghost" onClick={() => onView(template)}>View</button>
      </div>
    </div>
  );
}

// OPTIONAL CHANGE 5: Add TasksTab component (for task list view - can be done later)
// TasksTab — table view (drop-in replacement)
function TasksTab() {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Client-side filters (do NOT refetch on change)
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch once per company (no infinite loop)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Prefer listTasks; fall back to list/getTasks if needed.
        const res =
          (await tasksService.listTasks?.({ company_id: companyId, limit: 500 }).catch(() => null)) ??
          (await tasksService.list?.({ company_id: companyId, limit: 500 }).catch(() => null)) ??
          (await tasksService.getTasks?.({ company_id: companyId, limit: 500 }).catch(() => null)) ??
          [];

        if (!mounted) return;
        const items = Array.isArray(res) ? res : (res?.items ?? res?.data ?? res?.tasks ?? []);
        setTasks(Array.isArray(items) ? items : []);
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
    if (t.block?.name || t.block_name) return t.block?.name ?? t.block_name;
    if (t.spatial_area?.name || t.spatial_area_name) return t.spatial_area?.name ?? t.spatial_area_name;
    if (t.block_id) return `Block #${t.block_id}`;
    if (t.spatial_area_id) return `Area #${t.spatial_area_id}`;
    return t.location_type === 'point' ? '📍 Pin' : '—';
  };

  const fmtAssignees = (t) => {
    // Prefer embedded assignments if present
    if (Array.isArray(t.assignments) && t.assignments.length > 0) {
      const names = t.assignments
        .map(a => a.user_name || a.user?.full_name || a.user?.name || a.user?.email)
        .filter(Boolean);
      if (names.length <= 2) return names.join(', ');
      return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
    }
    if (typeof t.assigned_user_count === 'number') return `${t.assigned_user_count} user(s)`;
    return '—';
  };

  const badge = (s) => {
    const k = String(s || '').toLowerCase().replace(/\s+/g, '_');
    const map = {
      pending:     { bg:'var(--color-surface-warm)', fg:'var(--color-text-muted)', text:'Pending' },
      not_started: { bg:'var(--color-surface-warm)', fg:'var(--color-text-muted)', text:'Pending' },
      draft:       { bg:'var(--color-surface-warm)', fg:'var(--color-text-muted)', text:'Draft' },
      scheduled:   { bg:'var(--color-info-bg)', fg:'var(--color-info)', text:'Scheduled' },
      ready:       { bg:'var(--color-info-bg)', fg:'var(--color-info)', text:'Ready' },
      in_progress: { bg:'var(--color-warning-bg)', fg:'var(--color-warning)', text:'In Progress' },
      paused:      { bg:'var(--color-warning-bg)', fg:'var(--color-warning)', text:'Paused' },
      completed:   { bg:'var(--color-success-bg)', fg:'var(--color-success)', text:'Completed' },
      cancelled:   { bg:'var(--color-danger-bg)', fg:'var(--color-danger)', text:'Cancelled' },
    };
    const m = map[k] || { bg:'var(--color-olive-light)', fg:'var(--color-primary)', text:(s || 'Other') };
    return (
      <span style={{
        background: m.bg, color: m.fg, padding: '2px 10px', borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--font-size-xs)', fontWeight: 600
      }}>{m.text}</span>
    );
  };

  const fmtPriority = (p) => {
    const v = String(p || '').toLowerCase();
    const color = v === 'high' || v === 'urgent' ? 'var(--color-danger)'
                : v === 'medium' ? 'var(--color-warning)'
                : 'var(--color-text-muted)';
    const label = v ? v.charAt(0).toUpperCase() + v.slice(1) : '—';
    return <span style={{ color, fontWeight: 600 }}>{label}</span>;
  };

  // Client-side filtering
  const filteredTasks = (Array.isArray(tasks) ? tasks : []).filter(task => {
    if (statusFilter !== 'all') {
      const k = String(task.status || '').toLowerCase().replace(/\s+/g, '_');
      const wanted = statusFilter;
      const norm = (s) => {
        if (['pending','not_started'].includes(s)) return 'pending';
        if (['in_progress','active','started','ongoing'].includes(s)) return 'in_progress';
        if (['completed','complete','done'].includes(s)) return 'completed';
        if (['cancelled','canceled'].includes(s)) return 'cancelled';
        if (['scheduled','planning'].includes(s)) return 'scheduled';
        return 'other';
      };
      if (norm(k) !== wanted) return false;
    }
    if (categoryFilter !== 'all' && String(task.task_category || '') !== categoryFilter) return false;
    if (priorityFilter !== 'all' && String(task.priority || '').toLowerCase() !== priorityFilter) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay =
        (task.title || '') + ' ' +
        (task.description || '') + ' ' +
        (task.task_category || '') + ' ' +
        (task.block_name || '') + ' ' +
        (task.spatial_area_name || '');
      if (!hay.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await tasksService.deleteTask?.(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('Failed to delete task');
    }
  };

  // Style constants removed — now using od-table, od-btn CSS classes

  if (loading) return <div className="od-loading">Loading tasks...</div>;
  if (error) return <div className="od-error">{error}</div>;

  return (
    <div>
      <div className="od-tab-header">
        <h2>Tasks ({filteredTasks.length})</h2>
        <button className="btn-primary" onClick={() => navigate('/tasks/new')}>
          <Plus size={14} /> New Task
        </button>
      </div>

      <div className="od-filters">
        <details>
          <summary><Filter size={14} /> Filters</summary>
          <div className="od-filter-row">
            <input className="od-filter-input" type="text" placeholder="Search tasks..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <select className="od-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select className="od-filter-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              <option value="vineyard">Vineyard</option>
              <option value="land_management">Land Management</option>
              <option value="asset_management">Asset Management</option>
              <option value="compliance">Compliance</option>
              <option value="general">General</option>
            </select>
            <select className="od-filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </details>
      </div>

      {filteredTasks.length > 0 ? (
        <div className="od-table-wrap">
          <table className="od-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Category</th>
                <th>Location</th>
                <th className="center">Start</th>
                <th className="center">End</th>
                <th className="center">Priority</th>
                <th>Assignees</th>
                <th className="right">Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(t => (
                <tr key={t.id}>
                  <td className="bold">
                    {t.title || `Task #${t.id}`}
                    {t.description && <div className="od-desc">{t.description}</div>}
                  </td>
                  <td><span className="od-category-tag">{(t.task_category || '').replace(/_/g,' ') || '—'}</span></td>
                  <td>{fmtLocation(t)}</td>
                  <td className="center">{fmtDate(t.scheduled_start_date || t.scheduled_date)}</td>
                  <td className="center">{fmtDate(t.scheduled_end_date)}</td>
                  <td className="center">{fmtPriority(t.priority)}</td>
                  <td>{fmtAssignees(t)}</td>
                  <td className="right">{badge(t.status)}</td>
                  <td className="right">
                    <div className="od-actions">
                      <button className="od-btn od-btn--primary" onClick={() => navigate(`/tasks/${t.id}`)} title="View"><Eye size={12}/> View</button>
                      <button className="od-btn od-btn--ghost" onClick={() => navigate(`/tasks/${t.id}/edit`)} title="Edit"><Edit size={12}/></button>
                      <button className="od-btn od-btn--danger" onClick={() => handleDeleteTask(t.id)} title="Delete"><Trash2 size={12}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        {task.requires_gps_tracking && <span><MapPin size={12} /> GPS</span>}
      </div>
      <div className="od-card-actions">
        <button className="od-btn od-btn--primary" onClick={() => onView(task)}><Eye size={12} /> View</button>
        <button className="od-btn od-btn--ghost" onClick={() => onEdit(task)}><Edit size={12} /></button>
        <button className="od-btn od-btn--danger" onClick={() => onDelete(task.id)}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}


