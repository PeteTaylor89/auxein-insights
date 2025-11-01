import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { ClipboardList, PlayCircle, Plus, Filter, ArrowRight, FileText, CheckCircle, XCircle, Rocket, Eye, Edit, Trash2, Calendar, Clock, MapPin } from 'lucide-react';
import { observationService, usersService, authService, tasksService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import BlockSelectionModal from '../components/BlockSelectionModal';
import { TaskTemplateCard, TaskTemplatePreviewModal  } from '@/components/TaskManagement';


function readTemplateFields(tpl) {
  if (!tpl) return [];
  const s = tpl.schema?.fields ?? tpl.schema ?? tpl.fields_json ?? [];
  return Array.isArray(s) ? s : Array.isArray(s.fields) ? s.fields : [];
}

export default function ObservationDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('plans');

  const StatusBadge = ({ status, type = 'default' }) => {
    const colors = {
      "in progress": { bg: '#dbeafe', color: '#1e40af' },
      "complete": { bg: '#dcfce7', color: '#166534' },
      "not started": { bg: '#fef3c7', color: '#92400e' },
      "scheduled": { bg: '#e0f2fe', color: '#0369a1' },
      "cancelled": { bg: '#fee2e2', color: '#dc2626' },
      "active": { bg: '#d1fae5', color: '#065f46' }
    };
    
    const style = colors[status] || colors.active || { bg: '#f3f4f6', color: '#374151' };
    
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '0.25rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: '500'
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
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      paddingTop: '70px',
      paddingBottom: '80px'
    }}>
      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '1rem' 
      }}>
        
        {/* Dashboard Overview Stats */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid #f3f4f6'
          }}>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
              Vineyard Management Dashboard
            </h1>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => navigate('/planobservation')}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                <Plus size={16} /> Create Observaiton Plan
              </button>

              <button
                onClick={() => navigate('/tasks/new')}
                style={{
                  background: '#1a7403ff',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                <Plus size={16} /> Create New Task
              </button>

              <button
                onClick={() => navigate('/observations/adhoc')}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
                title="Start a one-off run without a plan"
              >
                <Rocket size={16} /> Ad-hoc Observation
              </button>
            </div>
          </div>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem'
          }}>
            {['Active Plans', 'Runs In Progress', 'Submitted Today', 'Overdue Plans'].map(label => (
              <div key={label} style={{
                textAlign: 'center',
                padding: '0.75rem',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#3b82f6' }}>
                  —
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '0',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #f3f4f6'
          }}>
            <TabButton label="Task Management" active={tab === 'tasks'} onClick={() => setTab('tasks')} />
            <TabButton label="Observation Plans" active={tab === 'plans'} onClick={() => setTab('plans')} />
            <TabButton label="Observation Runs" active={tab === 'runs'} onClick={() => setTab('runs')} />
            <TabButton label="Observation Templates" active={tab === 'templates'} onClick={() => setTab('templates')} />
            <TabButton label="Task Templates" active={tab === 'task-templates'} onClick={() => setTab('task-templates')} />
          </div>

          <div style={{ padding: '1.25rem' }}>
            {tab === 'tasks' && <TasksTab StatusBadge={StatusBadge} />}
            {tab === 'plans' && <PlansTab StatusBadge={StatusBadge} />}
            {tab === 'runs' && <RunsTab StatusBadge={StatusBadge} />}
            {tab === 'templates' && <TemplatesTab />}
            {tab === 'task-templates' && <TaskTemplatesTab />}
          </div>
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
      style={{
        flex: 1,
        padding: '1rem',
        border: 'none',
        background: active ? '#f8fafc' : 'white',
        borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: active ? '#3b82f6' : '#6b7280',
        transition: 'all 0.2s ease'
      }}
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
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', 
        inset: 0, 
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: 16, 
        zIndex: 9999
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{ 
          background: '#fff', 
          borderRadius: 12, 
          width: 'min(860px, 95vw)', 
          maxHeight: '85vh', 
          overflow: 'auto', 
          padding: 24,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>{template.name} Template</h3>
          <button 
            onClick={onClose} 
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: 6, 
              background: '#f3f4f6',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ padding: 16, borderRadius: 8, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 8, fontWeight: '500' }}>Scope</div>
            <div style={{ fontSize: '0.875rem', marginBottom: 4 }}><strong>Template:</strong> {template.type}</div>
            <div style={{ fontSize: '0.875rem' }}><strong>Owner:</strong> {template.company_id ? 'Company' : 'Global Template'}</div>
          </div>

          <div style={{ padding: 16, borderRadius: 8, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '0.875rem' }}><strong>Note:</strong> All observation runs will also include automatically captured data related to GPS location, date and time, and user. GPS locations can relate back to the block observed.</div>
          </div>
        </div>

        <h4 style={{ marginTop: 16, marginBottom: 12, fontSize: '1rem', fontWeight: '600' }}>Fields</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Field</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Required</th>
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 && (
                <tr><td colSpan={2} style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontStyle: 'italic' }}>No fields defined.</td></tr>
              )}
              {fields.map((f, i) => (
                <tr key={f.name ?? i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 12, fontWeight: '500' }}>{f.label || '—'}</td>
                  <td style={{ padding: 12 }}>{f.required ? 'Yes' : 'No'}</td>
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        <div>Loading plans…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: '#dc2626',
        background: '#fef2f2',
        borderRadius: '8px'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h2 style={{ 
          fontSize: '1.1rem', 
          fontWeight: '600', 
          margin: 0
        }}>
          Observation Plans ({filtered.length})
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input 
          placeholder="Search by plan name…" 
          value={q} 
          onChange={e => setQ(e.target.value)} 
          style={{ 
            padding: '0.5rem', 
            borderRadius: 6, 
            border: '1px solid #d1d5db',
            flex: 1, 
            minWidth: 200,
            fontSize: '0.875rem'
          }} 
        />
      </div>

      {filtered.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '0.875rem'
          }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Plan Name</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Observation Template</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Runs Captured</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Latest Run</th>
                <th style={{ padding: 12, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr 
                  key={p.id} 
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                  onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                >
                  <td style={{ padding: 12, fontWeight: '500' }}>{p.name || `Plan #${p.id}`}</td>
                  <td style={{ padding: 12 }}>{p.template_name || p.template_id || '—'}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>{typeof p.runs_count === 'number' ? p.runs_count : '—'}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {p.latest_run_started_at ? dayjs(p.latest_run_started_at).format('YYYY-MM-DD HH:mm') : '—'}
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => navigate(`/plandetail/${p.id}`)}
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: 4, 
                          background: '#6b7280', 
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Open <ArrowRight size={14} />
                      </button>
                      <button
                        onClick={() => openBlockModal(p)}
                        disabled={startingRun}
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: 4, 
                          background: '#3b82f6', 
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                        title="Start a run for this plan"
                      >
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
        <div style={{ 
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
          <div>No plans found</div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => navigate('/planobservation')}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Create Your First Plan
            </button>
          </div>
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        <div>Loading runs…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: '#dc2626',
        background: '#fef2f2',
        borderRadius: '8px'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h2 style={{ 
          fontSize: '1.1rem', 
          fontWeight: '600', 
          margin: 0
        }}>
          Observation Runs ({runs.length})
        </h2>
      </div>

      {runs.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '0.875rem'
          }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Run Number</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Plan Name</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Block</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Started</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Completed</th>
                <th style={{ padding: 12, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr 
                  key={r.id} 
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                  onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                >
                  <td style={{ padding: 12, fontWeight: '500' }}>{r.name || `Run #${r.id}`}</td>
                  <td style={{ padding: 12 }}>{r.plan_name || (r.plan_id ? `Plan ${r.plan_id}` : '—')}</td>
                  <td style={{ padding: 12 }}>{r.block_name ? `${r.block_name}` : '—'}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <StatusBadge status={r.status || 'active'} />
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {r.observed_at_start ? dayjs(r.observed_at_start).format('YYYY-MM-DD HH:mm') : '—'}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {r.observed_at_end ? dayjs(r.observed_at_end).format('YYYY-MM-DD HH:mm') : '—'}
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => navigate(`/observations/runcapture/${r.id}`)}
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: 4, 
                          background: '#065f46',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Open <ArrowRight size={14} />
                      </button>

                      <button
                        onClick={() => completeRun(r.id)}
                        disabled={busyId === r.id}
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: 4, 
                          background: '#3b82f6',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                        title="Compute server-side summary for this run"
                      >
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
        <div style={{ 
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
          <div>No runs found</div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Start a run from a plan to begin observations
          </div>
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

  const onViewTemplate = (tpl) => {
    setPreviewTemplate(tpl);
    setPreviewOpen(true);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        <div>Loading templates…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: '#dc2626',
        background: '#fef2f2',
        borderRadius: '8px'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h2 style={{ 
          fontSize: '1.1rem', 
          fontWeight: '600', 
          margin: 0
        }}>
          Observation Templates ({templates.length})
        </h2>
      </div>

      {templates.length > 0 ? (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: 16 
        }}>
          {templates.map(t => (
            <div 
              key={t.id ?? t.name} 
              style={{ 
                padding: 16, 
                border: '1px solid #e5e7eb', 
                borderRadius: 12, 
                background: '#fff',
                transition: 'box-shadow 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FileText size={18} color="#3b82f6" /> 
                <span style={{ fontWeight: 600, fontSize: '0.938rem' }}>{t.name || `Template #${t.id}`}</span>
              </div>
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#6b7280', 
                marginBottom: 16,
                padding: '0.25rem 0.5rem',
                background: '#f8fafc',
                borderRadius: '4px',
                display: 'inline-block'
              }}>
                {labelFor(t)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigate('/planobservation', { state: { template: t } })}
                  style={{ 
                    flex: 1,
                    padding: '0.5rem 0.75rem', 
                    borderRadius: 6, 
                    background: '#3b82f6', 
                    color: '#fff', 
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: 6,
                    fontSize: '0.813rem',
                    fontWeight: '500'
                  }}
                  title="Create an observation plan using this template"
                >
                  <Plus size={14} /> Use Template
                </button>
                <button
                  onClick={() => onViewTemplate(t)}
                  style={{ 
                    padding: '0.5rem 0.75rem', 
                    borderRadius: 6, 
                    background: '#f3f4f6', 
                    color: '#374151',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: 6,
                    fontSize: '0.813rem',
                    fontWeight: '500'
                  }}
                  title="View this template"
                >
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
          <div>No templates available</div>
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        <div>Loading templates…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: '#dc2626',
        background: '#fef2f2',
        borderRadius: '8px'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h2 style={{ 
          fontSize: '1.1rem', 
          fontWeight: '600', 
          margin: 0
        }}>
          Task Templates ({filteredTemplates.length})
        </h2>
        <button
          onClick={() => navigate('/tasks/templates/new')}
          style={{
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.813rem',
            fontWeight: '500'
          }}
        >
          <Plus size={14} /> New Template
        </button>
      </div>

      {/* Filters - Collapsible */}
      <div style={{ marginBottom: '1rem' }}>
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ 
            cursor: 'pointer', 
            padding: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#6b7280',
            userSelect: 'none'
          }}>
            <Filter size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Filters
          </summary>
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginTop: '0.75rem',
            flexWrap: 'wrap',
            padding: '0.75rem',
            background: '#f9fafb',
            borderRadius: '6px'
          }}>
            {/* Search */}
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: '1',
                minWidth: '200px',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.813rem'
              }}
            />

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.813rem',
                cursor: 'pointer',
                background: 'white'
              }}
            >
              <option value="all">All Categories</option>
              <option value="vineyard">🍇 Vineyard</option>
              <option value="land_management">🌱 Land Management</option>
              <option value="asset_management">🔧 Asset Management</option>
              <option value="compliance">📋 Compliance</option>
              <option value="general">📌 General</option>
            </select>

            {/* Active Only Toggle */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.813rem',
              padding: '0.5rem 0.75rem',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '6px'
            }}>
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Active only
            </label>
          </div>
        </details>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length > 0 ? (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: 16 
        }}>
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
        <div style={{ 
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
          <div>
            {searchQuery 
              ? 'No templates match your search'
              : 'No templates available'
            }
          </div>
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
  const categoryIcons = {
    vineyard: '🍇',
    land_management: '🌱',
    asset_management: '🔧',
    compliance: '📋',
    general: '📌'
  };

  const categoryLabels = {
    vineyard: 'Vineyard',
    land_management: 'Land Management',
    asset_management: 'Asset Management',
    compliance: 'Compliance',
    general: 'General'
  };

  const priorityEmojis = {
    low: '⬇️',
    medium: '➡️',
    high: '⬆️',
    urgent: '🚨'
  };

  const icon = template.icon || categoryIcons[template.task_category] || '📌';
  const categoryLabel = categoryLabels[template.task_category] || template.task_category;
  const taskCount = template.task_count || 0;

  return (
    <div 
      style={{ 
        padding: 16, 
        border: '1px solid #e5e7eb', 
        borderRadius: 12, 
        background: '#fff',
        transition: 'box-shadow 0.2s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Header with icon and name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '1.25rem' }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.938rem', marginBottom: '0.25rem' }}>
            {template.name}
          </div>
          {/* Status badges */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {!template.is_active && (
              <span style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                padding: '0.125rem 0.375rem',
                background: '#f3f4f6',
                borderRadius: '4px',
                display: 'inline-block'
              }}>
                Inactive
              </span>
            )}
            {template.quick_create_enabled && template.is_active && (
              <span style={{
                fontSize: '0.75rem',
                color: '#059669',
                padding: '0.125rem 0.375rem',
                background: '#d1fae5',
                borderRadius: '4px',
                display: 'inline-block'
              }}>
                Quick
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Category */}
      <div style={{ 
        fontSize: '0.75rem', 
        color: '#6b7280', 
        marginBottom: 12,
        padding: '0.25rem 0.5rem',
        background: '#f8fafc',
        borderRadius: '4px',
        display: 'inline-block'
      }}>
        {categoryLabel}
        {template.task_subcategory && ` • ${template.task_subcategory}`}
      </div>

      {/* Description */}
      {template.description && (
        <div style={{
          fontSize: '0.813rem',
          color: '#6b7280',
          marginBottom: 12,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {template.description}
        </div>
      )}

      {/* Template info */}
      <div style={{ 
        display: 'flex', 
        gap: 12, 
        marginBottom: 12,
        fontSize: '0.75rem',
        color: '#6b7280'
      }}>
        {/* Priority */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{priorityEmojis[template.default_priority]}</span>
          <span style={{ textTransform: 'capitalize' }}>{template.default_priority}</span>
        </div>

        {/* GPS */}
        {template.requires_gps_tracking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>📍</span>
            <span>GPS</span>
          </div>
        )}

        {/* Equipment */}
        {template.required_equipment_ids?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🔧</span>
            <span>{template.required_equipment_ids.length}</span>
          </div>
        )}

        {/* Usage count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <span>📊</span>
          <span>{taskCount}×</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onUse(template)}
          disabled={!template.is_active}
          style={{ 
            flex: 1,
            padding: '0.5rem 0.75rem', 
            borderRadius: 6, 
            background: template.is_active ? '#3b82f6' : '#d1d5db', 
            color: '#fff', 
            border: 'none',
            cursor: template.is_active ? 'pointer' : 'not-allowed',
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: 6,
            fontSize: '0.813rem',
            fontWeight: '500',
            opacity: template.is_active ? 1 : 0.6
          }}
          title={template.is_active ? "Create task using this template" : "Template is inactive"}
        >
          <Plus size={14} /> Use Template
        </button>
        <button
          onClick={() => onView(template)}
          style={{ 
            padding: '0.5rem 0.75rem', 
            borderRadius: 6, 
            background: '#f3f4f6', 
            color: '#374151',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: 6,
            fontSize: '0.813rem',
            fontWeight: '500'
          }}
          title="View this template"
        >
          View
        </button>
      </div>
    </div>
  );
}

// OPTIONAL CHANGE 5: Add TasksTab component (for task list view - can be done later)
function TasksTab() {
  const navigate = useNavigate();
  
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTasks();
  }, [statusFilter, categoryFilter, priorityFilter]);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (categoryFilter !== 'all') params.task_category = categoryFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;

      const res = await tasksService.listTasks(params);
      setTasks(Array.isArray(res) ? res : res?.items || []);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      await tasksService.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('Failed to delete task');
    }
  };

  // Filter tasks by search
  const filteredTasks = tasks.filter(task => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.title?.toLowerCase().includes(query) ||
      task.task_category.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query)
    );
  });

  // Normalize backend statuses to UI buckets
  const normalizeStatus = (s) => {
    const k = String(s || '').toLowerCase().replace(/\s+/g, '_');
    if (['pending', 'not_started'].includes(k)) return 'pending';
    if (['in_progress', 'active', 'started', 'ongoing'].includes(k)) return 'in_progress';
    if (['completed', 'complete', 'done'].includes(k)) return 'completed';
    if (['cancelled', 'canceled'].includes(k)) return 'cancelled';
    if (['scheduled', 'planning'].includes(k)) return 'scheduled';
    return 'other';
  };

  // Group tasks by normalized status
  const groupedTasks = { pending: [], in_progress: [], completed: [], cancelled: [], scheduled: [], other: [] };
  for (const t of filteredTasks) {
    groupedTasks[normalizeStatus(t.status)].push(t);
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        <div>Loading tasks…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: '#dc2626',
        background: '#fef2f2',
        borderRadius: '8px'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h2 style={{ 
          fontSize: '1.1rem', 
          fontWeight: '600', 
          margin: 0
        }}>
          Tasks ({filteredTasks.length})
        </h2>
        <button
          onClick={() => navigate('/tasks/new')}
          style={{
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.813rem',
            fontWeight: '500'
          }}
        >
          <Plus size={14} /> New Task
        </button>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '1rem' }}>
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ 
            cursor: 'pointer', 
            padding: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#6b7280',
            userSelect: 'none'
          }}>
            <Filter size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Filters
          </summary>
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginTop: '0.75rem',
            flexWrap: 'wrap',
            padding: '0.75rem',
            background: '#f9fafb',
            borderRadius: '6px'
          }}>
            {/* Search */}
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: '1',
                minWidth: '200px',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.813rem'
              }}
            />

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.813rem',
                cursor: 'pointer',
                background: 'white'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="pending">⏳ Pending</option>
              <option value="in_progress">🔄 In Progress</option>
              <option value="completed">✅ Completed</option>
              <option value="cancelled">❌ Cancelled</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.813rem',
                cursor: 'pointer',
                background: 'white'
              }}
            >
              <option value="all">All Categories</option>
              <option value="vineyard">🍇 Vineyard</option>
              <option value="land_management">🌱 Land Management</option>
              <option value="asset_management">🔧 Asset Management</option>
              <option value="compliance">📋 Compliance</option>
              <option value="general">📌 General</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.813rem',
                cursor: 'pointer',
                background: 'white'
              }}
            >
              <option value="all">All Priorities</option>
              <option value="low">⬇️ Low</option>
              <option value="medium">➡️ Medium</option>
              <option value="high">⬆️ High</option>
              <option value="urgent">🚨 Urgent</option>
            </select>
          </div>
        </details>
      </div>

      {/* Task List - Grouped by Status */}
      {filteredTasks.length > 0 ? (
        (() => {
          const any =
            groupedTasks.pending.length ||
            groupedTasks.in_progress.length ||
            groupedTasks.scheduled.length ||
            groupedTasks.completed.length ||
            groupedTasks.cancelled.length ||
            groupedTasks.other.length;
          if (!any) {
            return (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', fontStyle: 'italic' }}>
                No tasks match the selected filters.
              </div>
            );
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {groupedTasks.pending.length > 0 && (
                <TaskGroup title="Pending" icon="⏳" count={groupedTasks.pending.length} tasks={groupedTasks.pending}
                  onView={(task) => navigate(`/tasks/${task.id}`)}
                  onEdit={(task) => navigate(`/tasks/${task.id}/edit`)}
                  onDelete={handleDeleteTask}
                />
              )}
              {groupedTasks.in_progress.length > 0 && (
                <TaskGroup title="In Progress" icon="🔄" count={groupedTasks.in_progress.length} tasks={groupedTasks.in_progress}
                  onView={(task) => navigate(`/tasks/${task.id}`)}
                  onEdit={(task) => navigate(`/tasks/${task.id}/edit`)}
                  onDelete={handleDeleteTask}
                />
              )}
              {groupedTasks.scheduled.length > 0 && (
                <TaskGroup title="Scheduled" icon="📅" count={groupedTasks.scheduled.length} tasks={groupedTasks.scheduled}
                  onView={(task) => navigate(`/tasks/${task.id}`)}
                  onEdit={(task) => navigate(`/tasks/${task.id}/edit`)}
                  onDelete={handleDeleteTask}
                />
              )}
              {groupedTasks.completed.length > 0 && (
                <TaskGroup title="Completed" icon="✅" count={groupedTasks.completed.length} tasks={groupedTasks.completed}
                  onView={(task) => navigate(`/tasks/${task.id}`)}
                  onEdit={(task) => navigate(`/tasks/${task.id}/edit`)}
                  onDelete={handleDeleteTask}
                />
              )}
              {groupedTasks.cancelled.length > 0 && (
                <TaskGroup title="Cancelled" icon="❌" count={groupedTasks.cancelled.length} tasks={groupedTasks.cancelled}
                  onView={(task) => navigate(`/tasks/${task.id}`)}
                  onEdit={(task) => navigate(`/tasks/${task.id}/edit`)}
                  onDelete={handleDeleteTask}
                />
              )}
              {groupedTasks.other.length > 0 && (
                <TaskGroup title="Other" icon="📌" count={groupedTasks.other.length} tasks={groupedTasks.other}
                  onView={(task) => navigate(`/tasks/${task.id}`)}
                  onEdit={(task) => navigate(`/tasks/${task.id}/edit`)}
                  onDelete={handleDeleteTask}
                />
              )}
            </div>
          );
        })()
        ) : (
        <div style={{ 
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
          <div>
            {searchQuery 
              ? 'No tasks match your search'
              : 'No tasks found'}
          </div>
        </div>
      )}
    </div>
  );
}

// Task Group Component
function TaskGroup({ title, count, icon, tasks, onView, onEdit, onDelete }) {
  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.75rem',
        fontSize: '0.938rem',
        fontWeight: '600',
        color: '#374151'
      }}>
        <span>{icon}</span>
        <span>{title}</span>
        <span style={{ 
          fontSize: '0.75rem', 
          color: '#6b7280',
          fontWeight: '500',
          background: '#f3f4f6',
          padding: '0.125rem 0.5rem',
          borderRadius: '12px'
        }}>
          {count}
        </span>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
        gap: 12 
      }}>
        {tasks.map(task => (
          <TaskCard 
            key={task.id} 
            task={task}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// Task Card Component
function TaskCard({ task, onView, onEdit, onDelete }) {
  const categoryIcons = {
    vineyard: '🍇',
    land_management: '🌱',
    asset_management: '🔧',
    compliance: '📋',
    general: '📌'
  };

  const priorityEmojis = {
    low: '⬇️',
    medium: '➡️',
    high: '⬆️',
    urgent: '🚨'
  };

  const statusColors = {
    pending: '#fbbf24',
    in_progress: '#3b82f6',
    completed: '#10b981',
    cancelled: '#6b7280'
  };

  const icon = categoryIcons[task.task_category] || '📌';

  return (
    <div 
      style={{ 
        padding: 14, 
        border: '1px solid #e5e7eb', 
        borderRadius: 10, 
        background: '#fff',
        transition: 'box-shadow 0.2s ease',
        borderLeft: `3px solid ${statusColors[task.status]}`
      }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '1.125rem' }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
            {task.title}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              fontSize: '0.75rem',
              color: '#6b7280',
              padding: '0.125rem 0.375rem',
              background: '#f3f4f6',
              borderRadius: '4px'
            }}>
              {task.task_category}
            </span>
            <span style={{ fontSize: '0.75rem' }}>
              {priorityEmojis[task.priority]}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <div style={{
          fontSize: '0.75rem',
          color: '#6b7280',
          marginBottom: 10,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {task.description}
        </div>
      )}

      {/* Metadata */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap',
        gap: 10, 
        marginBottom: 10,
        fontSize: '0.75rem',
        color: '#6b7280'
      }}>
        {/* Scheduled Date */}
        { (task.scheduled_date || task.scheduled_start_date) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={12} />
            <span>{new Date(task.scheduled_date || task.scheduled_start_date).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' })}</span>
          </div>
        )}

        {/* Duration */}
        {(task.estimated_duration_hours || task.estimated_hours) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} />
            <span>{(task.estimated_duration_hours ?? task.estimated_hours)}h</span>
          </div>
        )}

        {/* GPS */}
        {task.requires_gps_tracking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={12} />
            <span>GPS</span>
          </div>
        )}

        {/* Equipment Count */}
        {task.required_equipment_ids?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🔧</span>
            <span>{task.required_equipment_ids.length}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => onView(task)}
          style={{ 
            flex: 1,
            padding: '0.375rem 0.5rem', 
            borderRadius: 5, 
            background: '#3b82f6', 
            color: '#fff', 
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: 4,
            fontSize: '0.75rem',
            fontWeight: '500'
          }}
        >
          <Eye size={12} /> View
        </button>
        <button
          onClick={() => onEdit(task)}
          style={{ 
            padding: '0.375rem 0.5rem', 
            borderRadius: 5, 
            background: '#f3f4f6', 
            color: '#374151',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex', 
            alignItems: 'center',
            gap: 4,
            fontSize: '0.75rem',
            fontWeight: '500'
          }}
        >
          <Edit size={12} />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          style={{ 
            padding: '0.375rem 0.5rem', 
            borderRadius: 5, 
            background: '#fee2e2', 
            color: '#dc2626',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex', 
            alignItems: 'center',
            gap: 4,
            fontSize: '0.75rem',
            fontWeight: '500'
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}


