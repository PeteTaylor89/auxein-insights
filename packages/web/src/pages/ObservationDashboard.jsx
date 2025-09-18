import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ClipboardList, PlayCircle, Plus, Filter, ArrowRight, FileText } from 'lucide-react';
import { observationService, usersService, authService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

/**
 * ObservationDashboard (OBS-004)
 * - Adds Templates tab wired to observationService.getTemplates
 */
export default function ObservationDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('plans');

  return (
    <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 1rem' }}>
      {/* Header */}
      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 600 }}>
        <ClipboardList /> <span>Observations</span>
      </div>

      {/* KPI strip */}
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
        <div className="stat-card" style={{ padding: 12, borderRadius: 12, border: '1px solid #eee', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
            <Filter size={16} /> Filters
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" onClick={() => navigate('/observations/plans/new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#2563eb', color: '#fff' }}>
            <Plus size={16} /> New Plan
          </button>
          <button className="btn" disabled style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#e5e7eb', color: '#555' }}>
            <PlayCircle size={16} /> Start Run
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
        background: active ? '#eef2ff' : 'transparent',
        border: 'none',
        borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  );
}

// --- Plans Tab (unchanged from OBS-002/3) ---
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

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6 }}>
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="canceled">Canceled</option>
        </select>
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6 }}>
          <option value="">All assignees</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{userMap.get(String(u.id))}</option>
          ))}
        </select>
        <input placeholder="Search by name…" value={q} onChange={e => setQ(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, flex: 1, minWidth: 200 }} />
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: 12 }}>Name</th>
              <th style={{ padding: 12 }}>Type</th>
              <th style={{ padding: 12 }}>Scheduled</th>
              <th style={{ padding: 12 }}>Assignees</th>
              <th style={{ padding: 12 }}>Status</th>
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
                <td style={{ padding: 12 }}>{p.type || p.observation_type || '—'}</td>
                <td style={{ padding: 12 }}>{p.scheduled_for ? dayjs(p.scheduled_for).format('YYYY-MM-DD') : '—'}</td>
                <td style={{ padding: 12 }}>{(p.assignees || p.assignee_user_ids || []).map(a => userMap.get(String(a.user_id ?? a.id ?? a)) || `User ${a.id}`).join(', ') || '—'}</td>
                <td style={{ padding: 12 }}>{p.status}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>
                  <button className="btn" onClick={() => navigate(`/plandetail/${p.id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#f3f4f6' }}>
                    Open <ArrowRight size={16} />
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

// --- Runs Tab ---
function RunsTab() {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await observationService.listRuns?.({ company_id: companyId }).catch(() => []);
        if (!mounted) return;
        setRuns(Array.isArray(res) ? res : res?.items || []);
      } catch (e) {
        console.error(e);
        setError('Failed to load runs');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  return (
    <div>
      {loading && <div className="stat-card">Loading runs…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: 12 }}>Run</th>
              <th style={{ padding: 12 }}>Plan</th>
              <th style={{ padding: 12 }}>Status</th>
              <th style={{ padding: 12 }}>Started</th>
              <th style={{ padding: 12 }} />
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
                <td style={{ padding: 12 }}>{r.plan_id ? `Plan ${r.plan_id}` : '—'}</td>
                <td style={{ padding: 12 }}>{r.status}</td>
                <td style={{ padding: 12 }}>{r.started_at ? dayjs(r.started_at).format('YYYY-MM-DD HH:mm') : '—'}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>
                  <button className="btn" onClick={() => navigate(`/runcapture/${r.id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#f3f4f6' }}>
                    Open <ArrowRight size={16} />
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

// --- Templates Tab ---
function TemplatesTab() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div>
      {loading && <div className="stat-card">Loading templates…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && !error && (
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {templates.map(t => (
            <div key={t.name} className="stat-card" style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <FileText size={18} /> <span style={{ fontWeight: 600 }}>{t.name || `Template #${t.id}`}</span>
              </div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>{t.description || 'No description'}</div>
              <button className="btn" onClick={() => navigate('/observations/plans/new', { state: { template: t } })} style={{ padding: '6px 12px', borderRadius: 6, background: '#2563eb', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> Use Template
              </button>
            </div>
          ))}
          {templates.length === 0 && <div style={{ color: '#777' }}>No templates available.</div>}
        </div>
      )}
    </div>
  );
}
