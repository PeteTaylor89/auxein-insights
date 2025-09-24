import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ClipboardList, PlayCircle, Plus, Filter, ArrowRight, FileText, CheckCircle, XCircle, Rocket } from 'lucide-react';
import { observationService, usersService, authService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';



function readTemplateFields(tpl) {
  if (!tpl) return [];
  // Backend returns ObservationTemplateOut with alias: schema <- fields_json
  // schema may be { fields: [...] } or an array
  const s = tpl.schema?.fields ?? tpl.schema ?? tpl.fields_json ?? [];
  return Array.isArray(s) ? s : Array.isArray(s.fields) ? s.fields : [];
}

export default function ObservationDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('plans');

  return (
    <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 1rem' }}>
      {/* Header */}
      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 600 }}>
        <span>Observations</span>
      </div>

      {/* KPI strip (placeholder counts for now) */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginTop: 20 }}>
        {['Active Plans','Runs In Progress','Submitted Today','Overdue Plans'].map(label => (
          <div key={label} className="stat-card" style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fafafa' }}>
            <div style={{ color: '#666', fontSize: 14 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>—</div>
          </div>
        ))}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, margin: '24px 0' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn"
            onClick={() => navigate('/planobservation')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#2563eb', color: '#fff' }}
          >
            <Plus size={16} /> Create a Plan
          </button>

          <button
            className="btn"
            onClick={() => navigate('/observations/runs/new-ad-hoc')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#10b981', color: '#fff' }}
            title="Start a one-off run without a plan"
          >
            <Rocket size={16} /> Log an Ad-hoc Observation
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="stat-card" style={{ borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #eee', background: '#f9fafb' }}>
          <TabButton label="Plans" active={tab === 'plans'} onClick={() => setTab('plans')} />
          <TabButton label="Runs" active={tab === 'runs'} onClick={() => setTab('runs')} />
          <TabButton label="Templates" active={tab === 'templates'} onClick={() => setTab('templates')} />
        </div>

        <div style={{ padding: 16 }}>
          {tab === 'plans' && <PlansTab />}
          {tab === 'runs' && <RunsTab />}
          {tab === 'templates' && <TemplatesTab />}
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
      className="btn"
      style={{
        flex: 1,
        padding: '12px 16px',
        fontWeight: 500,
        background: active ? '#515a77ff' : '#92a2d8ff',
        border: 'none',
        borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  );
}

function TemplatePreviewModal({ open, template, onClose }) {
  if (!open || !template) return null;
  const fields = readTemplateFields(template);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50
      }}
      onClick={onClose}
    >
      <div
        className="stat-card"
        style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, width: 'min(860px, 95vw)', maxHeight: '85vh', overflow: 'auto', padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{template.name}  Template</h3>
          <button className="btn" onClick={onClose} style={{ padding: '6px 12px', borderRadius: 6, background: '#f3f4f6' }}>
            Close
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="stat-card" style={{ padding: 12, borderRadius: 8, border: '1px solid #eee', background: '#fafafa' }}>
            <div style={{ color: '#666', fontSize: 13, marginBottom: 6 }}>Scope</div>
            <div><strong>Template:</strong> {template.type}</div>
            <div><strong>Owner:</strong> {template.company_id ? 'Company' : 'Global Template'}</div>
          </div>

          <div className="stat-card" style={{ padding: 12, borderRadius: 8, border: '1px solid #eee', background: '#fafafa' }}>
            <div><strong>Note:</strong> All observation runs will also include automatically captured data related to GPS location, date and time, and user. GPS locations can relate back to the block observed.</div>
          </div>
        </div>

        <h4 style={{ marginTop: 16, marginBottom: 8 }}>Fields</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: 10 }}>Field</th>
              <th style={{ padding: 10 }}>Required</th>
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 14, color: '#777' }}>No fields defined.</td></tr>
            )}
            {fields.map((f, i) => (
              <tr key={f.name ?? i} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: 10, fontWeight: 500 }}>{f.label || '—'}</td>
                <td style={{ padding: 10 }}>{f.required ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/* ---------------------------
 * Plans Tab
 * --------------------------- */
function PlansTab() {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState([]);

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

  const startRunForPlan = async (plan) => {
    try {
      const company_id = companyId;
      const template_id = plan.template_id ?? plan.template?.id;
      const assignee_user_ids = (plan.assignees || plan.assignee_user_ids || [])
        .map(a => a?.user_id ?? a?.id ?? a)
        .filter(Boolean);

      if (!observationService?.startRun) {
        alert('Start Run service not available yet.');
        return;
      }

      const run = await observationService.startRun(plan.id, {
        company_id,
        template_id,
        assignee_user_ids,
      });

      if (!run?.id) {
        alert('Run was not created (no id returned).');
        return;
      }
      navigate(`/runcapture/${run.id}`);
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        'Unknown error';
      alert(`Could not start run:\n${JSON.stringify(detail)}`);
    }
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>

        <input placeholder="Search by plan name…" value={q} onChange={e => setQ(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, flex: 1, minWidth: 200 }} />
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: 12 }}>Plan Name</th>
              <th style={{ padding: 12 }}>Observation Template</th>
              <th style={{ padding: 12 }}>Runs Captured</th> 
              <th style={{ padding: 12 }}>Latest Observation Run</th>
              <th style={{ padding: 12 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#777' }}>No plans found.</td>
              </tr>
            )}
            {filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: 12, fontWeight: 500 }}>{p.name || `Plan #${p.id}`}</td>
                <td style={{ padding: 12 }}>{p.template_name  || p.template_id || '—'}</td>
                <td style={{ padding: 12 }}>{typeof p.runs_count === 'number' ? p.runs_count : '—'}</td>
                <td style={{ padding: 12 }}>
                  {p.latest_run_started_at ? dayjs(p.latest_run_started_at).format('YYYY-MM-DD HH:mm') : '—'}
                </td>
                <td style={{ padding: 12, textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    className="btn"
                    onClick={() => navigate(`/plandetail/${p.id}`)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#4e638bff', color: '#fff' }}
                  >
                    Open <ArrowRight size={16} />
                  </button>
                  <button
                    className="btn"
                    onClick={() => startRunForPlan(p)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#2563eb', color: '#fff' }}
                    title="Start a run for this plan"
                  >
                    <PlayCircle size={16} /> Start Run
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------------------
 * Runs Tab
 * --------------------------- */
function RunsTab() {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div>
      {loading && <div className="stat-card">Loading runs…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: 12 }}>Run Number</th>
              <th style={{ padding: 12 }}>Plan Name</th>
              <th style={{ padding: 12 }}>Block</th>
              <th style={{ padding: 12 }}>Status</th>
              <th style={{ padding: 12 }}>Started</th>
              <th style={{ padding: 12, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#777' }}>No runs found.</td>
              </tr>
            )}
            {runs.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: 12, fontWeight: 500 }}>{r.name || `Run #${r.id}`}</td>
                <td style={{ padding: 12 }}>{r.plan_name || (r.plan_id ? `Plan ${r.plan_id}` : '—')}</td>
                <td style={{ padding: 12 }}>{r.block_id ? `Block ${r.block_id}` : '—'}</td>
                <td style={{ padding: 12 }}>{r.status}</td>
                <td style={{ padding: 12 }}>{r.started_at ? dayjs(r.started_at).format('YYYY-MM-DD HH:mm') : '—'}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 8 }}>
                    <button
                      className="btn"
                      onClick={() => navigate(`/runcapture/${r.id}`)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#f3f4f6' }}
                    >
                      Open <ArrowRight size={16} />
                    </button>

                    <button
                      className="btn"
                      onClick={() => completeRun(r.id)}
                      disabled={busyId === r.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#e0f2fe', color: '#075985' }}
                      title="Compute server-side summary for this run"
                    >
                      <CheckCircle size={16} /> Complete
                    </button>

                    <button
                      className="btn"
                      onClick={() => setStatus(r.id, 'approved')}
                      disabled={busyId === r.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#d1fae5', color: '#065f46' }}
                    >
                      <CheckCircle size={16} /> Approve
                    </button>

                    <button
                      className="btn"
                      onClick={() => setStatus(r.id, 'rejected')}
                      disabled={busyId === r.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#fee2e2', color: '#7f1d1d' }}
                    >
                      <XCircle size={16} /> Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------------------
 * Templates Tab
 * --------------------------- */
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

  return (
    <div>
      {loading && <div className="stat-card">Loading templates…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && !error && (
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {templates.map(t => (
            <div key={t.id ?? t.name} className="stat-card" style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <FileText size={18} /> <span style={{ fontWeight: 600 }}>{t.name || `Template #${t.id}`}</span>
              </div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>{labelFor(t)}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => navigate('/planobservation', { state: { template: t } })}
                  style={{ padding: '6px 12px', borderRadius: 6, background: '#2563eb', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Create an observation plan using this template"
                >
                  <Plus size={14} /> Use Template
                </button>
                <button
                  className="btn"
                  onClick={() => onViewTemplate(t)}
                  style={{ padding: '6px 12px', borderRadius: 6, background: '#e5e7eb', color: '#111827', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="View this template"
                >
                  View Template
                </button>
              </div>
            </div>
          ))}
          {templates.length === 0 && <div style={{ color: '#777' }}>No templates available.</div>}
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
