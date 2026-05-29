import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { ClipboardList, PlayCircle, Plus, Filter, ArrowRight, FileText, CheckCircle, XCircle, Rocket, Eye, Edit, Trash2, Calendar, Clock, MapPin, Zap, ListChecks, X, Wrench, Sparkles } from 'lucide-react';
import { observationService, usersService, authService, tasksService, contractorManagementService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import './ObservationDashboard.css';
import { TaskTemplateCard, TaskTemplatePreviewModal, TaskStatusBadge } from '@/components/TaskManagement';
import { getInsightKind } from '../utils/observationInsight';


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

function ManagementTab({ StatusBadge }) {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

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

  if (loading) return <div className="od-loading">Loading observations...</div>;
  if (error) return <div className="od-error">{error}</div>;

  return (
    <div>
      <div className="od-tab-header">
        <h2>Observation Management ({runs.length})</h2>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="od-btn od-btn--primary" onClick={() => navigate('/observations/schedule')}>
            <Plus size={14} /> Schedule Observation
          </button>
        </div>
      </div>

      {runs.length > 0 ? (
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
              {runs.map(r => {
                const status = r.status; // computed by backend: scheduled | in progress | complete
                const insightKind = getInsightKind(r.template_type);
                const insightsParams = insightKind
                  ? (() => {
                      const p = new URLSearchParams({
                        kind: insightKind,
                        runId: String(r.id),
                        templateType: r.template_type || '',
                      });
                      if (r.block_id) p.set('blockId', String(r.block_id));
                      return p.toString();
                    })()
                  : null;
                return (
                  <tr key={r.id}>
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
                        {insightsParams && status !== 'scheduled' && (
                          <button
                            className="od-btn od-btn--ghost"
                            onClick={() => navigate(`/Insights?${insightsParams}`)}
                            title="Open Insights"
                          >
                            <Sparkles size={14} /> Insights
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="od-empty">
          <div className="od-empty-text">No observations yet</div>
          <button className="btn-primary" onClick={() => navigate('/observations/schedule')}>
            <Plus size={16} /> Schedule the first one
          </button>
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
                <button className="od-btn od-btn--primary" onClick={() => navigate(`/observations/schedule?template=${t.id}`)} title="Schedule an observation with this template">
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
          <span className="od-filters-chevron">{open ? '▾' : '▸'}</span>
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

// TasksTab — table view with multi-select filters and assignee resolution
function TasksTab() {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();

  const [tasks, setTasks] = useState([]);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Client-side filters: each is a Set so multi-select toggles cleanly.
  const [statusFilter, setStatusFilter] = useState(() => new Set());
  const [categoryFilter, setCategoryFilter] = useState(() => new Set());
  const [priorityFilter, setPriorityFilter] = useState(() => new Set());
  const [locationFilter, setLocationFilter] = useState(() => new Set());
  const [assigneeFilter, setAssigneeFilter] = useState(() => new Set());
  const [contractorFilter, setContractorFilter] = useState(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Sort + paginate. Default sort matches backend: earliest scheduled first.
  // Click a sortable header to toggle direction.
  const [sortKey, setSortKey] = useState('date'); // 'date' | 'location'
  const [sortDir, setSortDir] = useState('asc');  // 'asc' | 'desc'
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

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

        const [tasksRes, usersRes, relsRes] = await Promise.all([
          (tasksService.listTasks?.({ company_id: companyId, limit: 500 })
            ?? tasksService.list?.({ company_id: companyId, limit: 500 })
            ?? tasksService.getTasks?.({ company_id: companyId, limit: 500 })
            ?? Promise.resolve([])).catch(() => []),
          usersService.getCompanyUsers().catch(() => []),
          contractorManagementService.listRelationships().catch(() => []),
        ]);

        if (!mounted) return;
        const items = Array.isArray(tasksRes) ? tasksRes : (tasksRes?.items ?? tasksRes?.data ?? tasksRes?.tasks ?? []);
        setTasks(Array.isArray(items) ? items : []);
        setCompanyUsers(Array.isArray(usersRes) ? usersRes : []);
        setContractors(Array.isArray(relsRes) ? relsRes : []);
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

  const filteredTasks = useMemo(() => (Array.isArray(tasks) ? tasks : []).filter(task => {
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

  const sortedTasks = useMemo(() => {
    const arr = [...filteredTasks];
    const cmp = (a, b) => {
      if (sortKey === 'location') {
        const av = getLocationKey(a);
        const bv = getLocationKey(b);
        return av.localeCompare(bv, 'en-NZ', { numeric: true });
      }
      // date
      const av = new Date(a.scheduled_start_date || a.scheduled_date || 0).getTime() || 0;
      const bv = new Date(b.scheduled_start_date || b.scheduled_date || 0).getTime() || 0;
      return av - bv;
    };
    arr.sort((a, b) => (sortDir === 'asc' ? cmp(a, b) : -cmp(a, b)));
    return arr;
  }, [filteredTasks, sortKey, sortDir]);

  // Reset to page 1 whenever filters / sort / search change the visible set.
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, categoryFilter, priorityFilter, locationFilter, assigneeFilter, contractorFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTasks = sortedTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

  const sortIndicator = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div>
      <div className="od-tab-header">
        <h2>Tasks ({sortedTasks.length})</h2>
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

      {sortedTasks.length > 0 ? (
        <div className="od-table-wrap">
          <table className="od-table od-task-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Category</th>
                <th className="od-th-sortable" onClick={() => toggleSort('location')}>Location{sortIndicator('location')}</th>
                <th className="od-th-sortable" onClick={() => toggleSort('date')}>Schedule{sortIndicator('date')}</th>
                <th className="center">Priority</th>
                <th>Assignees</th>
                <th>Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedTasks.map(t => (
                <tr key={t.id} className="od-clickable-row" onClick={() => navigate(`/tasks/${t.id}`)}>
                  <td className="bold">{t.title || `Task #${t.id}`}</td>
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
              ))}
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


